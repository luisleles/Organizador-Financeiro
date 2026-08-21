#!/usr/bin/env bash
# Restaura um backup por cima do banco atual. Destrutivo por natureza: guarda o banco de
# agora ao lado antes de sobrescrever, porque restaurar o arquivo errado acontece.
set -euo pipefail

PROJETO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJETO"

BACKUP="${1:-}"
BANCO="data/app.db"

if [ -z "$BACKUP" ]; then
  echo "uso: bash scripts/restaurar-backup.sh data/backups/app-AAAA-MM-DD.db"
  echo
  echo "backups disponíveis:"
  ls -1t data/backups/*.db 2>/dev/null || echo "  (nenhum ainda — rode 'npm run backup')"
  exit 1
fi

[ -f "$BACKUP" ] || { echo "Backup não encontrado: $BACKUP"; exit 1; }

# 1. Ninguém pode estar escrevendo durante a troca.
bash scripts/fechar-app.sh >/dev/null 2>&1 || true

# 2. O banco de agora vira uma cópia com hora, e não um arquivo sobrescrito.
if [ -f "$BANCO" ]; then
  ANTES="data/app.db.antes-da-restauracao-$(date +%Y%m%d-%H%M%S)"
  cp "$BANCO" "$ANTES"
  echo "Banco atual guardado em $ANTES"
fi

# 3. O WAL e o índice do banco antigo não podem sobreviver à troca.
rm -f "$BANCO" "$BANCO-wal" "$BANCO-shm"
cp "$BACKUP" "$BANCO"

# 4. Backup antigo pode ser de um schema anterior; as migrations sobem o que faltar.
npx prisma migrate deploy >/dev/null

echo "Restaurado de $BACKUP."
echo "Abra o app de novo com: bash scripts/abrir-app.sh"
