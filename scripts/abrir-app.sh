#!/usr/bin/env bash
# Abre o Controle Financeiro com um clique: prepara o que faltar, sobe o servidor e
# abre o navegador. Fechar esta janela encerra o app.
set -euo pipefail

PROJETO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORTA="${PORT:-3000}"
URL="http://localhost:$PORTA"
cd "$PROJETO"

titulo() { printf '\n\033[1m%s\033[0m\n' "$1"; }
erro() {
  printf '\n\033[31m%s\033[0m\n\n' "$1"
  read -r -p "Pressione Enter para fechar. "
  exit 1
}

command -v node >/dev/null || erro "Node.js não está instalado. Instale o Node 20 ou mais novo e tente de novo."

if ss -ltn "sport = :$PORTA" 2>/dev/null | grep -q LISTEN; then
  titulo "O app já estava rodando. Abrindo $URL"
  xdg-open "$URL" >/dev/null 2>&1 || true
  exit 0
fi

if [ ! -d node_modules ]; then
  titulo "Primeira vez por aqui: instalando as dependências. Isso demora alguns minutos."
  npm install || erro "Não deu para instalar as dependências."
fi

BANCO_NOVO=0
[ -f data/app.db ] || BANCO_NOVO=1

titulo "Preparando o banco de dados…"
npx prisma migrate deploy >/dev/null || erro "Não deu para preparar o banco de dados."

if [ "$BANCO_NOVO" = "1" ]; then
  titulo "Banco vazio: gerando dados de exemplo…"
  npm run db:seed >/dev/null || erro "Não deu para gerar os dados de exemplo."
fi

# Só recompila quando algo mudou desde a última build — abrir o app de novo é instantâneo.
precisa_build() {
  [ -f .next/BUILD_ID ] || return 0
  [ -n "$(find src prisma package.json next.config.ts postcss.config.mjs -newer .next/BUILD_ID 2>/dev/null | head -1)" ]
}

if precisa_build; then
  titulo "Compilando a versão de produção. Na primeira vez leva cerca de um minuto…"
  npm run build || erro "A compilação falhou. Rode 'npm run build' no terminal para ver o erro."
fi

titulo "Subindo o servidor…"
npm start &
SERVIDOR=$!
trap 'kill "$SERVIDOR" 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "$URL"; then
    xdg-open "$URL" >/dev/null 2>&1 || true
    break
  fi
  sleep 1
done

printf '\n\033[1mControle Financeiro rodando em %s\033[0m\n' "$URL"
printf 'Feche esta janela para encerrar o app.\n\n'
wait "$SERVIDOR"
