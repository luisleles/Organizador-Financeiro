#!/usr/bin/env bash
# Abre o Controle Financeiro: prepara o que faltar, sobe o servidor e abre o navegador.
# Funciona tanto no terminal quanto pelo atalho da área de trabalho, que não tem terminal
# nenhum — nesse caso o aviso vai para as notificações do sistema.
set -uo pipefail

PROJETO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJETO"
PORTA="${PORT:-3000}"
URL="http://localhost:$PORTA"
REGISTRO="$PROJETO/data/abrir-app.log"
mkdir -p data
: > "$REGISTRO"

aviso() {
  printf '\n\033[1m%s\033[0m\n' "$1" | tee -a "$REGISTRO"
  [ -t 1 ] || notify-send -a "Controle Financeiro" "Controle Financeiro" "$1" >/dev/null 2>&1 || true
}

erro() {
  printf '\n\033[31m%s\033[0m\n' "$1" | tee -a "$REGISTRO"
  if [ -t 1 ]; then
    read -r -p "Pressione Enter para fechar. "
  else
    zenity --error --title="Controle Financeiro" --width=420 \
      --text="$1"$'\n\n'"Detalhes em data/abrir-app.log" >/dev/null 2>&1 || true
  fi
  exit 1
}

executar() {
  local descricao="$1"
  shift
  printf '\n$ %s\n' "$*" >> "$REGISTRO"
  "$@" >> "$REGISTRO" 2>&1 || erro "$descricao"
}

no_ar() { curl -sf -o /dev/null --max-time 2 "$URL"; }

command -v node >/dev/null || erro "O Node.js não está instalado. Instale o Node 20 ou mais novo e tente de novo."

if no_ar; then
  aviso "O app já estava rodando. Abrindo $URL"
  xdg-open "$URL" >/dev/null 2>&1 &
  exit 0
fi

if [ ! -d node_modules ]; then
  aviso "Primeira vez por aqui: instalando as dependências. Isso demora alguns minutos."
  executar "Não deu para instalar as dependências." npm install
fi

BANCO_NOVO=0
[ -f data/app.db ] || BANCO_NOVO=1

aviso "Preparando o banco de dados…"
executar "Não deu para preparar o banco de dados." npx prisma migrate deploy

if [ "$BANCO_NOVO" = "1" ]; then
  aviso "Banco vazio: gerando dados de exemplo…"
  executar "Não deu para gerar os dados de exemplo." npm run db:seed
fi

# Só recompila quando algo mudou desde a última build — reabrir o app é questão de segundos.
precisa_build() {
  [ -f .next/BUILD_ID ] || return 0
  [ -n "$(find src prisma package.json next.config.ts postcss.config.mjs \
    -newer .next/BUILD_ID 2>/dev/null | head -1)" ]
}

if precisa_build; then
  aviso "Compilando o app. Na primeira vez leva cerca de um minuto…"
  executar "A compilação falhou. Rode 'npm run build' no terminal para ver o erro." npm run build
fi

npm start >> "$REGISTRO" 2>&1 &
SERVIDOR=$!
trap 'kill "$SERVIDOR" 2>/dev/null' EXIT

for _ in $(seq 1 90); do
  no_ar && break
  kill -0 "$SERVIDOR" 2>/dev/null || erro "O servidor não subiu. Veja data/abrir-app.log."
  sleep 1
done

no_ar || erro "O servidor demorou demais para responder. Veja data/abrir-app.log."

xdg-open "$URL" >/dev/null 2>&1 &
aviso "Controle Financeiro rodando em $URL"
[ -t 1 ] && printf 'Feche esta janela para encerrar o app.\n\n'

wait "$SERVIDOR"
