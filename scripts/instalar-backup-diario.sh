#!/usr/bin/env bash
# Agenda o backup diário como timer de usuário do systemd. Timer de usuário, e não do
# sistema, porque o banco é do usuário: nada aqui precisa de root.
set -euo pipefail

PROJETO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIDADES="$HOME/.config/systemd/user"
NODE_BIN="$(dirname "$(command -v node)")"

mkdir -p "$UNIDADES"

cat > "$UNIDADES/controle-financeiro-backup.service" <<UNIT
[Unit]
Description=Backup diário do Controle Financeiro

[Service]
Type=oneshot
WorkingDirectory=$PROJETO
Environment=PATH=$NODE_BIN:/usr/local/bin:/usr/bin:/bin
ExecStart=$NODE_BIN/npm run backup
UNIT

cat > "$UNIDADES/controle-financeiro-backup.timer" <<UNIT
[Unit]
Description=Roda o backup do Controle Financeiro todo dia

[Timer]
OnCalendar=daily
# Se a máquina estava desligada na hora marcada, roda assim que ela voltar.
Persistent=true
RandomizedDelaySec=15m

[Install]
WantedBy=timers.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now controle-financeiro-backup.timer

# Sem isto, o timer só roda enquanto houver sessão aberta na máquina.
loginctl enable-linger "$USER" 2>/dev/null || true

echo "Backup diário agendado."
echo
systemctl --user list-timers controle-financeiro-backup.timer --no-pager || true
echo
echo "Rodar agora, sem esperar:  systemctl --user start controle-financeiro-backup.service"
echo "Ver o que aconteceu:       journalctl --user -u controle-financeiro-backup.service -n 20"
echo "Desativar:                 systemctl --user disable --now controle-financeiro-backup.timer"
