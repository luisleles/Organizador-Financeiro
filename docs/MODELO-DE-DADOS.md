# Modelo de dados

Este documento explica as entidades definidas em `prisma/schema.prisma`, as decisões por
trás de cada uma e, em especial, por que uma transferência entre contas é representada
por duas linhas na tabela `Transaction` em vez de uma só.

## Convenções gerais

- **Dinheiro é sempre `Int` em centavos.** Nenhum campo monetário usa `Float`: erro de
  arredondamento em ponto flutuante é inaceitável em um sistema financeiro. `R$ 12,34`
  é armazenado como `1234`. As funções puras em `src/lib/money.ts` fazem a conversão
  entre centavos e o valor exibido ao usuário.
- **Datas ficam em UTC no banco.** O `DateTime` do Prisma grava em UTC; a conversão para
  `America/Sao_Paulo` acontece só na hora de exibir (`src/lib/date.ts`), nunca no banco.
- **Todo dado pertence a um usuário.** O app é single-user, mas cada entidade principal
  carrega `userId` desde já — não porque hoje exista multiusuário, mas para que
  autenticação e eventual multiusuário no futuro não exijam migrar o schema inteiro.
- **IDs são `cuid()`**, gerados pelo Prisma, não autoincrementais — evita vazar contagem
  de registros e facilita gerar IDs no cliente antes de persistir, se necessário no
  futuro.

## Entidades

### User

Uma única linha vai existir na prática, mas o campo `passwordHash` já está aqui para
quando a fase de autenticação for implementada. `email` é `@unique`.

### Account

Uma conta bancária, carteira, cartão de crédito ou caixinha. `type` distingue
`CHECKING | SAVINGS | CREDIT_CARD | INVESTMENT | CASH | SAVINGS_BUCKET`, enquanto `class`
define o lado contábil: todos os tipos, exceto cartão, são `ASSET`; cartão é `LIABILITY`.

- `institution` é opcional: uma carteira (`CASH`) não tem banco associado.
- Os termos do cartão não ficam em `Account`: `CreditCardDetails` guarda fechamento,
  vencimento, limite, bandeira e quatro últimos dígitos numa relação 1:1. O serviço
  cria `Account` e `CreditCardDetails` na mesma transação de banco.

`parentAccountId` é a auto-relação que sustenta a caixinha: preenchido apenas em
`SAVINGS_BUCKET`, onde é obrigatório, sempre apontando para uma conta `ASSET` que não é
outra caixinha — não há aninhamento. Essas três regras vivem no serviço, porque o schema
só sabe dizer que a coluna é opcional. No banco a chave é `onDelete: Cascade`: caixinha
não existe sem a mãe. O serviço, por sua vez, recusa apagar uma conta que ainda tem
caixinhas, para a cascata nunca levar o lastro de uma meta sem avisar.

Uma conta mãe expõe dois saldos, calculados em `splitParentBalance`:
`availableBalanceCents` é o dinheiro livre, sem o que está nas caixinhas, e
`totalBalanceCents` é disponível mais caixinhas. O consolidado do patrimônio soma cada
conta uma vez — a mãe pelo saldo próprio, a caixinha pelo dela — e por isso nunca conta o
mesmo dinheiro duas vezes.

Deletar uma conta (`onDelete: Cascade` a partir de `User`, e as relações de `Account`
para `Transaction`/`RecurringRule` também em cascade) apaga o histórico associado. Como
já existe `archived` para desativar uma conta sem perder dados, a exclusão definitiva é
tratada como uma ação explícita e rara — a UI deve confirmar antes de chamá-la.

### Category

Hierarquia de **um nível só**: uma categoria pode ter `parentId` apontando para outra
categoria, mas uma subcategoria não pode ter filhas — isso é garantido pela camada de
serviço, não pelo schema (Prisma não expressa "profundidade máxima" declarativamente).
`kind` (`INCOME | EXPENSE`) é obrigatório mesmo em categorias pai, e o serviço deve
garantir que uma subcategoria tenha o mesmo `kind` do pai.

`isSystem` marca categorias que o app mantém e o domínio referencia pelo nome —
hoje só "Rendimentos" (`INCOME`), usada por toda receita de caixinha. Renomear ou
arquivar quebraria a separação entre receita ativa e rendimento nos relatórios, então o
serviço recusa editar e arquivar, e a interface troca os botões por um rótulo.

Apagar uma categoria-pai desvincula (`SetNull`) suas subcategorias em vez de apagá-las
em cascata — perder uma subcategoria porque a categoria-pai foi removida seria uma
surpresa desagradável para quem está organizando as próprias finanças.

### Tag

Etiquetas livres (`Fixo`, `Parcelado`, `Reembolsável` no seed), em relação N:N implícita
com `Transaction`. Diferente de `Category`, uma transação pode ter zero, uma ou várias
tags — servem para marcações transversais que não caberiam numa categorização única.

### Transaction

O centro do modelo. Os campos que merecem destaque:

- `amountCents` é **assinado**: negativo é saída, positivo é entrada. Isso permite somar
  `amountCents` de todas as transações de uma conta para obter o saldo atual, sem `CASE
WHEN type = ...` nas queries.
- `categoryId` é opcional porque transferências (`type = TRANSFER`) não têm categoria —
  categorias só existem para o que é receita ou despesa de fato.
- `provider` e `externalId` existem para uma futura integração com Open Finance (ex.:
  Pluggy). Transações lançadas manualmente usam `provider = "manual"` e `externalId`
  nulo.
- O índice único `@@unique([provider, externalId])` impede importar a mesma transação
  duas vezes de uma integração externa. Como `externalId` é opcional, e SQL trata cada
  `NULL` como distinto de qualquer outro `NULL` em um índice único, isso não afeta
  lançamentos manuais — só entra em ação quando `externalId` está de fato preenchido.
- `@@index([userId, date])` e `@@index([accountId, date])` existem porque as duas
  consultas mais comuns do app são "extrato de uma conta" e "transações de um período",
  ambas ordenadas por data.
- `installmentGroupId`, `installmentNumber` e `installmentTotal` guardam parcelamento de
  cartão: as parcelas de uma mesma compra compartilham o grupo, e cada linha sabe que é a
  `n` de `total`. A divisão é feita em centavos inteiros e o resto vai para as primeiras
  parcelas.
- `invoiceId` é obrigatório para qualquer linha do ledger de um cartão e nulo para
  contas `ASSET`. Essa invariante é validada em toda escrita do serviço.

### Cartão de crédito

`Invoice` persiste o mês de referência, fechamento, vencimento e estado de cada fatura.
A compra continua sendo uma linha negativa no ledger do cartão, mas agora aponta para a
fatura que a cobra. O dia exato do fechamento ainda pertence ao mês corrente; o dia
seguinte vai para o próximo, com dias 29–31 encaixados no fim de meses curtos.

O pagamento é um fluxo separado: cria uma perna negativa na conta de ativo e outra
positiva no cartão, ambas `TRANSFER`, sendo que apenas a perna do cartão recebe
`invoiceId`. Cartões não participam da transferência comum nem como origem nem como
destino.

Consequências cobertas pelos testes de serviço:

- **O limite disponível nunca entra no patrimônio.** Limite é crédito de terceiro. Dobrar
  o limite do cartão não muda um centavo do saldo consolidado.
- **O limite considera todas as faturas não pagas.** Uma compra parcelada compromete o
  total no momento da compra, inclusive as parcelas futuras.
- **Pagar a fatura não muda o saldo líquido.** O ativo cai e a dívida cai no mesmo valor;
  o que muda é a composição. Se o líquido subisse ou descesse ao pagar uma fatura, seria
  sinal de que o pagamento virou despesa nova ou perdeu a perna de saída.

O consolidado é apresentado em três blocos — saldo em contas, faturas em aberto e saldo
líquido — porque um total único esconde exatamente a informação que faz alguém se
enganar sobre quanto tem.

As faturas são criadas sob demanda. Uma fatura `PAID` ou `CLOSED` não recebe lançamento
novo; a alocação avança até a próxima fatura aberta. A chave única
`(creditCardDetailsId, referenceMonth)` impede ciclos duplicados.

### Por que transferência usa duas linhas

Uma transferência entre contas (ex.: do Nubank para a poupança) é representada por
**duas linhas em `Transaction`**, uma em cada conta, ligadas pelo mesmo
`transferGroupId`:

```
Transaction A: accountId = Nubank,    amountCents = -50000, type = TRANSFER
Transaction B: accountId = Poupança,  amountCents = +50000, type = TRANSFER
transferGroupId igual nas duas
```

A alternativa óbvia seria um campo `toAccountId` numa única linha. Não foi essa a
escolha, por quatro razões:

1. **O saldo de uma conta é sempre `SUM(amountCents) WHERE accountId = X`.** Com uma
   única linha por transferência, essa query deixaria de funcionar — seria preciso um
   `UNION` ou um `CASE` toda vez que se calculasse o saldo de qualquer conta, em todo
   lugar do sistema que faz essa soma (extrato, dashboard, exportação, etc.). Com duas
   linhas, o saldo de uma conta nunca precisa saber que transferências existem: ele soma
   `amountCents` de tudo que pertence àquela conta, ponto.
2. **Extrato de conta e histórico geral não precisam de lógica especial.** Uma tela que
   lista "transações da conta X" simplesmente filtra por `accountId`, e a transferência
   aparece corretamente como uma saída (ou entrada) daquela conta, junto com receitas e
   despesas comuns — sem um `if (isTransfer) mostrarDeOutroJeito`.
3. **É simétrico com contabilidade de partida dobrada.** Todo valor que sai de algum
   lugar entra em outro; modelar como duas linhas que somam zero é a forma mais direta
   de expressar essa invariante, e permite validar a integridade dos dados com uma
   query simples: `SELECT transferGroupId, SUM(amountCents) FROM "Transaction" WHERE
type = 'TRANSFER' GROUP BY transferGroupId HAVING SUM(amountCents) != 0` deveria
   sempre retornar zero linhas.
4. **Editar ou desfazer uma transferência é uma operação simétrica.** As duas linhas têm
   o mesmo `transferGroupId`, então "apagar a transferência" é
   `DELETE FROM "Transaction" WHERE transferGroupId = ?`, sem precisar decidir qual das
   duas é "a principal".

O custo dessa escolha é que criar ou editar uma transferência precisa tratar as duas
linhas como uma unidade na camada de serviço (criar as duas, ou nenhuma; apagar as
duas, ou nenhuma) — isso é responsabilidade de `src/server`, não do schema.

### Budget

Orçamento mensal por categoria. `month` guarda o primeiro dia do mês em UTC (ex.:
`2026-08-01T00:00:00Z`), nunca um dia arbitrário — isso é convenção da aplicação, não
uma restrição do banco. `@@unique([userId, categoryId, month])` impede dois orçamentos
para a mesma categoria no mesmo mês.

### Goal e a caixinha

Uma meta de economia (`Goal`) tem um valor alvo e, opcionalmente, uma caixinha:
`bucketAccountId` é `@unique`, numa relação 1:1 com a `Account` do tipo
`SAVINGS_BUCKET` que guarda o dinheiro. Meta sem caixinha é um estado válido — é a meta
em planejamento, com progresso zero e um CTA para criar a caixinha.

O progresso **não** é anotação: é o saldo da caixinha, e portanto o mesmo número que o
extrato mostra. Ele se decompõe em duas leituras (`decomposeBucketBalance`):
`totalDepositedCents`, a soma das pernas positivas de `TRANSFER`, e `totalYieldCents`, a
soma das receitas. As duas aparecem separadas na interface porque aportar é esforço e
render não é — só o aporte entra no cálculo de ritmo e de projeção.

Movimentar a caixinha tem regras próprias, todas em `account.buckets.ts` e aplicadas
também no serviço de transações, para não haver porta dos fundos:

- a caixinha só transaciona com a própria mãe: nada de caixinha para outra conta, para
  outra caixinha ou para cartão;
- aporte e resgate são transferências de duas pernas com `transferGroupId` e sem
  categoria, e um aporte que deixaria a mãe negativa é recusado;
- rendimento é um único lançamento `INCOME` na caixinha, sempre positivo, na categoria de
  sistema "Rendimentos", sem perna oposta — é dinheiro que nasce ali;
- despesa avulsa dentro da caixinha é recusada.

`expectedYearlyRatePercent` é usada **apenas** na projeção, com juros compostos, e nunca
gera lançamento: rendimento estimado é estimativa, e vai rotulado como tal na tela.
Resgatar devolve o saldo inteiro para a mãe e arquiva a caixinha, sem apagar nada.

Metas anteriores a esse modelo são convertidas por `scripts/migrate-goals-to-buckets.ts`,
que pergunta, meta a meta, se o saldo da conta mãe já estava descontado (vira
`initialBalanceCents` da caixinha) ou se o dinheiro ainda está lá (vira uma transferência
consolidada na data da migração). O script é idempotente e nunca escolhe sozinho.

### RecurringRule

Modelo usado a partir da fase 10, quando lançamentos recorrentes passam a gerar
`Transaction`s automaticamente. Duas decisões que valem registrar:

- `categoryId` é opcional, pelo mesmo motivo de `Transaction.categoryId`: uma regra
  recorrente de transferência (`type = TRANSFER`) não tem categoria.
- `dayOfMonth` é opcional porque só se aplica a frequências `MONTHLY` e `YEARLY` — uma
  regra `DAILY` ou `WEEKLY` não usa esse campo.

## Seed

`prisma/seed.ts` gera dados fictícios (nenhum dado pessoal real) com um gerador
pseudoaleatório de semente fixa, então rodar `npm run db:seed` duas vezes produz sempre
o mesmo resultado: 4 contas, 22 categorias, 3 tags, ~250–280 transações nos últimos 8
meses, faturas de cartão alocadas, 3 orçamentos e 2 metas com contribuições.
