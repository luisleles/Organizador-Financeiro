# Arquitetura

O app é um Next.js 15 com App Router, Prisma e SQLite, rodando numa máquina só. Não há
serviço externo, fila nem cache distribuído — e essa é uma decisão, não uma limitação: o
problema cabe num processo, e um processo é muito mais fácil de operar e de entender.

## As camadas

```
┌──────────────────────────────────────────────────────────────────────────┐
│  src/app         rotas, páginas e Server Actions                         │
│                  Server Components leem; actions escrevem.               │
│                  Nenhuma regra de negócio mora aqui.                     │
├──────────────────────────────────────────────────────────────────────────┤
│  src/components  componentes de UI, quase todos burros                   │
│                  "use client" só onde há estado ou evento.               │
├──────────────────────────────────────────────────────────────────────────┤
│  src/server      o domínio                                               │
│                  ├── *.schema.ts    validação com Zod, na fronteira      │
│                  ├── *.service.ts   orquestra Prisma + regras            │
│                  └── módulos puros  a regra em si, sem banco e sem React │
├──────────────────────────────────────────────────────────────────────────┤
│  src/lib         utilitários sem opinião de domínio                      │
│                  dinheiro, datas, Prisma client, formatação              │
├──────────────────────────────────────────────────────────────────────────┤
│  prisma          schema, migrations e seed                               │
└──────────────────────────────────────────────────────────────────────────┘
```

O fluxo de uma escrita, do clique ao banco:

```
Componente cliente
      │  formData
      ▼
Server Action  ──── Zod ────►  recusa com fieldErrors, devolvendo o que foi digitado
      │  input tipado
      ▼
Serviço  ──── requireUserId() ────►  toda query filtra por userId
      │
      ├──► módulo puro  (a regra: saldo, ritmo, agenda, projeção)
      │
      ▼
Prisma  ──── $transaction quando a operação tem mais de uma escrita
      │
      ▼
revalidatePath  ──►  Server Component relê e a tela se atualiza
```

## Por que os módulos puros existem

Toda regra que dá para expressar sem banco vive num arquivo sem `import { prisma }`:
`account.balance.ts`, `account.credit-card.ts`, `account.buckets.ts`, `budget.pace.ts`,
`goal.projection.ts`, `recurrence.schedule.ts`, `recurrence.projection.ts`,
`import.pipeline.ts`, `category.tree.ts`, `transaction.amount.ts`.

São eles que concentram o que é difícil de acertar — o dia 31 num mês de 30, a fatura que
fecha antes de vencer, o que conta como aporte e o que conta como rendimento — e é por isso
que a maior parte dos testes não precisa de banco nenhum para rodar em milissegundos.

O serviço fica com o que só existe com banco: buscar, gravar, garantir atomicidade e
traduzir erro de domínio em `código + mensagem` que a interface sabe mostrar.

## Onde a identidade entra

`requireUserId()` (`src/server/current-user.ts`) é o **único** ponto em que a sessão vira um
`userId`. Todo serviço chama essa função e filtra por ela; nenhuma query do domínio roda sem
dono. Trocar "o primeiro usuário do banco" pela sessão do Auth.js foi uma mudança de um
arquivo, justamente porque essa fronteira sempre esteve isolada.

## Dinheiro e datas

Dinheiro é `Int` em centavos, em todas as camadas, e só vira texto na renderização.
Datas são gravadas em UTC e exibidas em `America/Sao_Paulo`; toda conta de calendário passa
por `src/lib/date.ts`, que trabalha com ano/mês/dia da zona, e não somando milissegundos.

## Testes

| Tipo          | Onde                                             | O que garante                                            |
| ------------- | ------------------------------------------------ | -------------------------------------------------------- |
| Unitário puro | `src/**/*.test.ts` sem banco                     | as regras difíceis, em milissegundos                     |
| Serviço       | `src/server/**/*.test.ts` com SQLite descartável | atomicidade e integridade de verdade                     |
| E2E           | `e2e/*.spec.ts` com Playwright                   | os caminhos que o usuário percorre, no build de produção |

O E2E roda contra o **build de produção**, e não contra `next dev`. A diferença já custou um
bug: o Auth.js confia no host automaticamente em desenvolvimento e recusa em produção, então
um login quebrado passaria batido num teste que rodasse com o servidor de desenvolvimento.
