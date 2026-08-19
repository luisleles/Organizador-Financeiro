# Padrão de CRUD

O módulo de Contas é o molde para Categorias, Orçamentos, Metas e Transações. Este
documento descreve as camadas e as duas armadilhas que já custaram caro aqui.

## Camadas

```
src/server/<modulo>/
  <modulo>.balance.ts   regra pura, sem Prisma e sem React — é o que os testes cobrem
  <modulo>.schema.ts    schemas Zod + tipos de entrada inferidos
  <modulo>.types.ts     tipos de domínio devolvidos pelo serviço
  <modulo>.service.ts   leitura e escrita via Prisma, invariantes, erros de domínio
src/app/(app)/<rota>/
  actions.ts            Server Actions: FormData -> Zod -> serviço -> revalidate
  page.tsx              Server Component de leitura
src/components/<modulo>/  componentes de apresentação e formulários
```

O serviço **não conhece HTTP nem React**: recebe e devolve tipos do domínio e sinaliza
problemas com `AccountServiceError`, que carrega um `code` (`NOT_FOUND`,
`HAS_TRANSACTIONS`). Quem traduz isso para mensagem de usuário é a Server Action.

Zod fica no domínio, não na action, para que exista uma definição só de "conta válida".
A action apenas converte `FormData` (tudo string) para a forma que o schema de domínio
espera, e faz `.pipe(accountInputSchema)`. Os campos do formulário têm exatamente o nome
dos campos do domínio, então os caminhos de erro do Zod caem direto no `name` do input,
sem tabela de tradução.

Regra que não expressa em Prisma vive na camada de serviço ou no schema Zod — por
exemplo, "dia de fechamento é obrigatório só quando o tipo é `CREDIT_CARD`", que está no
`superRefine` de `account.schema.ts`.

## Testes

O que é testável sem banco fica em um módulo puro. `account.balance.ts` concentra as
regras de saldo — soma de movimento, consolidação de ativos e passivos, série acumulada —
e `account.balance.test.ts` cobre inclusive a invariante de transferência: mover dinheiro
entre duas contas próprias não pode mexer no total consolidado. Rode com `npm test`.

## Armadilha 1: o React reseta o formulário depois da Server Action

Um `<form action={...}>` é resetado assim que a action termina, **inclusive quando ela
recusa a entrada**. Sem tratamento, um erro de validação limpa tudo que a pessoa digitou.

A solução é devolver os valores enviados no estado de erro (`ActionState.values`) e usá-los
como `defaultValue`: o reset passa a repor exatamente o que foi enviado.

`<select>` é um caso à parte — o React só aplica `defaultValue` na montagem, então depois
do reset ele volta para a primeira opção. Por isso os selects levam
`key={valueOf("campo")}`: quando o valor devolvido muda, o campo remonta com o default
certo.

## Armadilha 2: fallback de Suspense não pode conter componentes de cliente

Em `app-shell.tsx` a navegação lateral fica dentro de um `<Suspense>` porque lê
`useSearchParams()`. Enquanto o fallback era a própria navegação — um componente de
cliente que chama `usePathname()` — **qualquer rota cujo Server Component lesse
`searchParams` travava**: a página renderizava normalmente no servidor, mas a hidratação
nunca terminava e nada na tela respondia a clique, sem um único erro no console.

O sintoma é característico: o HTML tem duas cópias da navegação (o fallback e o conteúdo
resolvido) e nada é interativo. Para diagnosticar, conte quantos elementos foram
hidratados:

```js
[...document.querySelectorAll("button,a")].filter((e) =>
  Object.keys(e).some((k) => k.startsWith("__react")),
).length;
```

A regra que ficou: **o conteúdo de um fallback de Suspense é markup inerte.** `NavLink` e
`RailNav` são apresentacionais e recebem `pathname` por prop; quem chama os hooks é só o
componente resolvido (`PeriodRailNav`).

## Transações: decisões que valem para os próximos módulos

### Paginação, e não scroll infinito

A listagem pagina de 50 em 50, com links de anterior e próxima.

O motivo é o mesmo que fez todo filtro morar na URL: **o estado da tela é o endereço**.
Scroll infinito guarda "quanto já carreguei" em memória do cliente, então o link colado
para alguém abre uma tela diferente da que se estava vendo, o botão voltar perde a
posição, e não existe um "1–50 de 279" para conferir se o filtro pegou o que deveria.
Somando a isso: a página é um Server Component que renderiza a tabela pronta, sem estado
de carregamento nem sentinela de interseção, e a navegação por teclado funciona com
links de verdade. Scroll infinito só ganharia se a lista fosse de descoberta, e um
extrato é de conferência.

### Filtros como `<form method="get">`

O formulário de filtros é HTML puro: o navegador monta a URL, inclusive as listas de
checkbox de conta, categoria e etiqueta, que viram parâmetros repetidos. Não há estado de
filtro em React nenhum. Por isso a faixa de valor viaja em reais na URL (`min=100,00`) e
não em centavos — é o que o campo envia sem tradução.

O único JavaScript é cosmético: desligar os campos vazios no `submit`, para o endereço
sair `?q=uber` em vez de `?q=uber&tipo=&min=&max=`. Sem script, o filtro continua
funcionando; a URL só fica mais feia.

### Transferência é uma coisa só, em duas linhas

Uma transferência são duas linhas com o mesmo `transferGroupId` e valores opostos.
Consequências, todas com teste:

- **Editar reescreve as duas pernas dentro de um `$transaction`.** Se o grupo não tiver
  exatamente duas linhas, o serviço recusa (`BROKEN_TRANSFER`) sem alterar nada.
- **Excluir uma perna exclui a outra.** Vale inclusive na exclusão em lote da listagem:
  os ids selecionados são expandidos pelos grupos antes do `deleteMany`.
- **O formulário de lançamento comum recusa editar uma perna** (`NOT_A_TRANSFER`) e manda
  para a tela de transferência, que é a única que conhece os dois lados.
- **Categorizar em lote pula transferências**, porque transferência não tem categoria.

### Teste de serviço com banco de verdade

Provar que as duas pernas mudam juntas exige uma transação de banco real, não um dublê.
`vitest.global-setup.mts` cria um SQLite descartável em `data/test.db` e roda
`prisma migrate deploy`; `vitest.setup.mts` aponta a `DATABASE_URL` para ele antes de
qualquer import do PrismaClient. Como o banco é um só, `fileParallelism` fica desligado.
