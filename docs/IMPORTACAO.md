# Importação, exportação e backup

O ponto desta parte do sistema não são os dois formatos que ele lê hoje. É a fronteira: uma
fonte de lançamentos é uma coisa só, com um contrato só, e tudo o que vem depois — normalizar,
deduplicar, categorizar, revisar, gravar — é o mesmo caminho para qualquer origem. CSV e OFX
são as duas primeiras implementações; Open Finance entra pela mesma porta.

## A interface

```ts
// src/server/import/source.ts
type RawTransaction = {
  externalId: string; // identidade estável na origem
  date: Date;
  description: string;
  amountCents: number; // inteiro, com sinal: negativo é saída
  rawPayload: unknown; // o registro como veio
};

interface TransactionSource {
  id: string; // vai para Transaction.provider
  fetchTransactions(params: { accountId: string; since: Date }): Promise<RawTransaction[]>;
}
```

Uma fonte **só busca e devolve**. Ela não conhece Prisma, não decide o que é duplicado, não
aplica regra de categoria e nunca grava. Tudo isso é do pipeline, e é por isso que uma fonte
nova não precisa reimplementar nada disso.

## O pipeline

```
fonte.fetchTransactions()
  ↓ normalizar          data em AAAA-MM-DD, tipo derivado do sinal do valor
  ↓ deduplicar          por (provider, externalId), contra o banco e dentro do arquivo
  ↓ categorizar         regras de categorização, as mesmas do lançamento manual
  ↓ revisar             tela de conferência — nada foi gravado até aqui
  ↓ confirmar           createTransaction com a origem marcada
```

`buildPreview` (`import.pipeline.ts`) é puro: recebe as transações, o conjunto de externalIds
já gravados e as regras, e devolve cada linha classificada como `novo`, `duplicado` ou
`repetido-no-arquivo`. Quem conversa com o banco é `import.service.ts`, em duas funções bem
separadas: `previewImport` **só lê** e `confirmImport` **só grava o que foi confirmado**.

A garantia final contra duplicata não é o pipeline: é o índice único `[provider, externalId]`
em `Transaction`. Mesmo que duas confirmações sejam disparadas ao mesmo tempo, a segunda
esbarra no banco e é contada como ignorada.

## Adicionando uma fonte nova

O exemplo abaixo é o esqueleto de uma fonte de Open Finance. São os únicos dois lugares que
mudam.

**1. A classe**, em `src/server/import/openfinance.source.ts`:

```ts
import type { FetchTransactionsParams, RawTransaction, TransactionSource } from "./source";

export class OpenFinanceSource implements TransactionSource {
  readonly id = "openfinance";

  constructor(private readonly client: OpenFinanceClient) {}

  async fetchTransactions({ accountId, since }: FetchTransactionsParams) {
    const pagina = await this.client.listTransactions({ accountId, from: since });

    return pagina.map((item): RawTransaction => ({
      externalId: item.transactionId, // o id do provedor, que já é estável
      date: new Date(item.bookingDate),
      description: item.creditorName ?? item.remittanceInformation,
      amountCents: Math.round(Number(item.amount) * 100),
      rawPayload: item,
    }));
  }
}
```

**2. O registro**, na função `createSource` de `import.service.ts`:

```ts
if (request.sourceId === "openfinance") return new OpenFinanceSource(client);
```

Mais o `id` novo em `SOURCE_IDS` (`import.schema.ts`), para a validação aceitá-lo.

Nada além disso. Deduplicação, categorização, tela de revisão e gravação já funcionam para a
fonte nova no momento em que ela devolve `RawTransaction[]`.

### O que faz um bom `externalId`

É a peça que decide se reimportar é seguro. Em ordem de preferência:

1. **O identificador da origem**, quando existe: `FITID` no OFX, `transactionId` no Open
   Finance. É estável por definição.
2. **Um hash do conteúdo**, quando não existe: é o que `stableExternalId` faz no CSV, a partir
   de data, descrição e valor. Duas linhas idênticas no mesmo arquivo ganham um sufixo de
   ocorrência, porque duas compras iguais no mesmo dia são dois lançamentos de verdade, e não
   uma duplicata.

O que **não** serve: o número da linha do arquivo (muda quando o extrato é reexportado com um
período diferente) e qualquer coisa que inclua a hora da importação.

## As fontes de hoje

| Fonte       | `id`  | Identidade                 | Observações                                         |
| ----------- | ----- | -------------------------- | --------------------------------------------------- |
| `CsvSource` | `csv` | coluna do arquivo, ou hash | mapeamento de colunas vem da tela                   |
| `OfxSource` | `ofx` | `FITID`, ou hash se faltar | sem mapeamento: o formato já diz o que é cada campo |

O CSV aceita separador `;`, `,` ou tabulação, campo entre aspas com separador dentro, valores
como `1.234,56`, `1,234.56`, `(45,90)` e `45,90-`, e extratos que separam entrada e saída em
duas colunas.

## Exportação

Em **Configurações**:

- **CSV** (`/api/exportar/csv`) — todos os lançamentos, com conta, categoria, tags e a origem.
  Separador `;` e BOM, para abrir no Excel em português sem quebrar acento.
- **JSON** (`/api/exportar/json`) — o banco inteiro do usuário: contas, categorias, tags,
  lançamentos, orçamentos, metas e recorrências. Valores em centavos, datas em UTC.

## Backup e restauração

O botão **Gerar backup** (`/api/backup`) usa `VACUUM INTO`, que escreve uma cópia íntegra do
SQLite mesmo com o app aberto — copiar o arquivo `.db` na unha, com o app rodando, pode gerar
uma cópia corrompida.

Para restaurar:

```bash
# 1. Feche o app, para ninguém escrever no banco durante a troca
bash scripts/fechar-app.sh

# 2. Guarde o banco atual antes de sobrescrever
cp data/app.db data/app.db.antes-da-restauracao

# 3. Ponha o backup no lugar
cp ~/Downloads/controle-financeiro-AAAA-MM-DD.db data/app.db

# 4. Aplique as migrations que surgiram depois do backup
npx prisma migrate deploy

# 5. Abra de novo
bash scripts/abrir-app.sh
```

O passo 4 é o que permite restaurar um backup antigo numa versão nova do app: as migrations
são idempotentes e sobem o schema até o estado atual sem tocar nos dados. O passo 2 existe
porque restauração é destrutiva — se o backup for o arquivo errado, o banco de antes ainda
está ali ao lado.
