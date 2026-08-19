# Design system

Os tokens vivem em `src/app/globals.css`. Não há `tailwind.config.ts`: o Tailwind v4 é
configurado em CSS, via `@theme`. Este documento registra as decisões por trás dos
tokens — em especial por que a paleta não usa verde e vermelho.

## Contrato de cor

**Cor é reservada para significado financeiro.** A interface é tinta e papel: botão
primário, cabeçalho, navegação e ícone não consomem cor nenhuma. Numa tela com dezenas
de números, cromo colorido faz o dado parar de saltar.

| token      | papel                                                             |
| ---------- | ----------------------------------------------------------------- |
| `entrada`  | dinheiro que entrou — turquesa                                    |
| `saida`    | gasto **dentro do previsto** — ocre                               |
| `alerta`   | gasto **fora do plano**, saldo negativo, ação destrutiva — carmim |
| `previsto` | o que ainda não aconteceu (recorrência futura, projeção) — bruma  |
| `foco`     | único acento não-financeiro: foco, seleção, link — cobalto        |

Três razões para turquesa e ocre no lugar de verde e vermelho:

1. **Daltonismo.** Verde e vermelho saturados colidem em protanopia e deuteranopia
   (~8% dos homens). Turquesa (185°) e ocre (35°) continuam separáveis, e o eixo
   frio/quente sobrevive dessaturado num badge de 11px.
2. **Vermelho é alarme, não é gasto.** Se toda despesa é vermelha, o usuário anestesia e
   o alerta real perde força. `alerta` só aparece quando algo de fato saiu do plano.
3. **Direção já está dita duas vezes** — pelo sinal (`+`/`−`) e pela posição na faixa do
   Batimento. A cor fica livre para codificar outra coisa: conformidade com o plano.

Neutros têm viés de petróleo (matiz ~200°, croma baixo) para não parecerem cinza de
framework. Claro é papel frio, escuro é ardósia profunda.

## Tema claro e escuro

Cada token é declarado uma vez só, com `light-dark(claro, escuro)`. A troca acontece por
`color-scheme`: `:root` usa `light dark` (segue o sistema) e `[data-theme]` no `<html>`
força um dos dois. Isso evita manter dois blocos de variáveis em sincronia — o erro mais
comum em design system com tema duplo. `src/components/theme-toggle.tsx` grava a escolha
em `localStorage`, e um script inline no `layout.tsx` a aplica antes da primeira pintura.

## Tipografia

| família             | token          | uso                                         |
| ------------------- | -------------- | ------------------------------------------- |
| Bricolage Grotesque | `font-display` | título de página e headline de estado vazio |
| Archivo             | `font-texto`   | toda a interface (padrão no `body`)         |
| Geist Mono          | `font-numero`  | **todo** número                             |

A regra inegociável: dinheiro é sempre Geist Mono, inclusive o saldo-herói; a display
nunca toca um número. A utilidade `valor` aplica a fonte junto com
`font-variant-numeric: tabular-nums slashed-zero`, que é o que mantém a vírgula alinhada
quando os valores empilham em coluna.

A escala tem duas famílias de tokens: `text-2xs … text-3xl` para texto e
`text-num-xs … text-num-hero` para número. Abaixo de 40rem, apenas `--text-sm` e
`--text-md` sobem um degrau — o resto da escala não é recalculado.

## Coluna de valores

Todo valor monetário fica à direita, numa coluna com borda esquerda própria (`value` em
`TableHeadCell`/`TableCell`), que atravessa cabeçalho, linhas, subtotal de dia e
skeleton sem se deslocar. `Amount` separa reais de centavos e renderiza os centavos a
`0.85em` com 70% de opacidade: o olho ancora nos reais sem que a vírgula saia do lugar.

## Elemento assinatura

**O Batimento** — faixa full-bleed abaixo do cabeçalho, uma coluna por dia do mês,
entradas para cima em turquesa e saídas para baixo em ocre, com os dias restantes
desenhados em `previsto`. Ainda não implementado: depende dos dados do dashboard. O
estado vazio (`EmptyState`) já antecipa sua linguagem visual.

## Styleguide

`/styleguide` renderiza todos os componentes base nos dois temas. É a referência viva —
componente novo entra lá antes de entrar numa tela.
