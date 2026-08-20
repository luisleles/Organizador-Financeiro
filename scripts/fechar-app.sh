#!/usr/bin/env bash
# Encerra o servidor do Controle Financeiro. O atalho de abrir não tem janela, então
# parar o app é um comando próprio.
set -uo pipefail

PORTA="${PORT:-3000}"
# `ss` mostra o dono do socket em escuta; `lsof -i:porta` também traria quem está
# conectado nela, como uma aba do navegador.
PIDS="$(ss -ltnpH "sport = :$PORTA" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u)"

if [ -z "$PIDS" ]; then
  MENSAGEM="O Controle Financeiro não está rodando."
else
  # shellcheck disable=SC2086
  kill $PIDS 2>/dev/null
  sleep 2
  # shellcheck disable=SC2086
  kill -9 $PIDS 2>/dev/null
  MENSAGEM="Controle Financeiro encerrado."
fi

if [ -t 1 ]; then
  printf '\n%s\n\n' "$MENSAGEM"
else
  notify-send -a "Controle Financeiro" "Controle Financeiro" "$MENSAGEM" >/dev/null 2>&1 || true
fi
