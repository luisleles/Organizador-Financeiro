# Gráficos

Recharts, com todos os gráficos lendo os tokens do design system. Este documento registra
as três decisões que não são óbvias no código.

## A paleta de gráfico é validada, não escolhida a olho

`--c-grafico-*` em `globals.css` é uma paleta **separada** da paleta de interface. Os pares
passaram nos seis checks de um validador de paleta (faixa de luminosidade, piso de croma,
separação sob daltonismo, piso para visão normal e contraste contra a superfície):

|                               | receita   | despesa   |
| ----------------------------- | --------- | --------- |
| claro (superfície `#fcfdfd`)  | `#12A0A8` | `#C4741C` |
| escuro (superfície `#151E22`) | `#23A4AC` | `#C87C22` |

A separação sob protanopia e deuteranopia fica em ΔE ≈ 17, bem acima do piso de 8 — que é
o ponto: turquesa e ocre continuam distinguíveis por quem não distingue verde de vermelho.

Os passos do modo escuro **não são o claro invertido**. Sobre fundo escuro a marca precisa
de outra luminosidade: os valores do modo claro reprovam a faixa de luminosidade do escuro,
e vice-versa. Como os tokens usam `light-dark()`, a troca é automática na renderização mas
os valores foram escolhidos um a um.

## Barras horizontais, não treemap, para gasto por categoria

O trabalho do gráfico é **comparar magnitude** entre categorias, e comprimento sobre uma
linha de base comum é o que o olho compara com precisão — área não é. Somando a isso: o
nome da categoria cabe legível à esquerda em vez de ser cortado dentro de um retângulo; no
celular as barras empilham e continuam legíveis, enquanto um treemap vira lascas; e cada
barra leva o valor em BRL como rótulo direto, sem depender de passar o mouse.

Treemap ganharia se a pergunta fosse parte-do-todo com hierarquia e dezenas de itens. Aqui
são poucas categorias e a pergunta é "onde foi mais dinheiro".

A cor é **magnitude, não identidade**: um matiz só, o mesmo ocre de saída. Uma paleta
categórica aqui daria a cada categoria uma cor própria e brigaria com o contrato do design
system, onde cor significa direção do dinheiro.

## O fluxo de caixa não empilha receita com despesa

As barras divergem do zero — receita para cima, despesa para baixo — mas **sem `stackId`**.
Empilhar de verdade soma as duas séries, e a soma de receita com despesa é o saldo: um
número que já está na linha e que, como barra, esconderia exatamente os dois valores que o
gráfico existe para mostrar. Receita e despesa não são partes de um todo; são fluxos
opostos.

A linha de saldo usa o **mesmo eixo** das barras, porque é a mesma grandeza em reais. Dois
eixos y seria a forma mais fácil de mentir com este gráfico.

## Detalhes que custaram tempo

- **Animação do Recharts desligada** (`isAnimationActive={false}`). Com ela, as barras
  ficavam presas no primeiro quadro e o gráfico aparecia como um traço rente ao zero. Num
  painel financeiro, o valor certo na hora vale mais que a entrada animada — e isso também
  respeita `prefers-reduced-motion`.
- **Rótulo de barra precisa de `<LabelList>`.** A prop `label` com objeto não renderiza.
- **Não fixe o domínio do eixo** para compensar empilhamento. Sem `stackId`, o Recharts já
  calcula os extremos certos; um domínio explícito atrapalhou mais do que ajudou.
- **Transferência fica de fora de tudo.** A cláusula `NOT_TRANSFER` em
  `report.service.ts` é a única forma de montar a consulta desses relatórios. Consulta de
  receita ou despesa sem ela é bug.
