#!/usr/bin/env bash
# One-time setup of the read-only "jarvis" account on a Linux server so JARVIS
# (192.168.0.156) can run its fixed read-only SSH probes (server.health,
# disk.check: hostname, uptime, meminfo, df, systemctl --failed).
#
#   curl/scp this file to the server, then:  sudo bash setup-jarvis-readonly-user.sh
#
# - user "jarvis", shell bash, NO usable password (key only), NO sudo
# - authorized_keys pinned to 192.168.0.156, no forwarding, no pty
# - ~/.ssh and authorized_keys owned by root so the account cannot add keys
# - groups: adm, systemd-journal (log read) if they exist; never docker/sudo/wheel/lxd
# - idempotent: re-running converges to the same state
set -euo pipefail

JARVIS_USER="jarvis"
FROM_IP="192.168.0.156"
PUBKEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBkMUGSRePIiSTNRZcKhGL7ZCft9te0ilbMYisS2cNoy jarvis-fleet@toor-System-Product-Name-192.168.0.156'
KEY_LINE="from=\"${FROM_IP}\",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ${PUBKEY}"
READ_GROUPS=(adm systemd-journal)
FORBIDDEN_GROUPS=(sudo wheel admin docker lxd libvirt root disk)

[[ $EUID -eq 0 ]] || { echo "Run with sudo/root." >&2; exit 1; }

if id "$JARVIS_USER" >/dev/null 2>&1; then
  echo "user $JARVIS_USER: exists"
else
  useradd --create-home --shell /bin/bash --comment "JARVIS read-only probes" "$JARVIS_USER"
  echo "user $JARVIS_USER: created"
fi
usermod --shell /bin/bash "$JARVIS_USER"
# '*' = no valid password (password login impossible) but account not locked, so key auth works.
usermod -p '*' "$JARVIS_USER"

for g in "${FORBIDDEN_GROUPS[@]}"; do
  if id -nG "$JARVIS_USER" | tr ' ' '\n' | grep -qx "$g"; then gpasswd -d "$JARVIS_USER" "$g" >/dev/null; echo "removed from group $g"; fi
done
for g in "${READ_GROUPS[@]}"; do
  if getent group "$g" >/dev/null; then usermod -aG "$g" "$JARVIS_USER"; fi
done
# No sudoers entries for jarvis.
grep -rlsE "^[[:space:]]*${JARVIS_USER}[[:space:]]" /etc/sudoers /etc/sudoers.d 2>/dev/null | while read -r f; do echo "WARNING: sudoers entry for $JARVIS_USER in $f (not removed automatically, please review)"; done

HOME_DIR=$(getent passwd "$JARVIS_USER" | cut -d: -f6)
install -d -o root -g "$JARVIS_USER" -m 0750 "$HOME_DIR/.ssh"
printf '%s\n' "$KEY_LINE" > "$HOME_DIR/.ssh/authorized_keys.tmp"
chown root:"$JARVIS_USER" "$HOME_DIR/.ssh/authorized_keys.tmp"
chmod 0640 "$HOME_DIR/.ssh/authorized_keys.tmp"
mv -f "$HOME_DIR/.ssh/authorized_keys.tmp" "$HOME_DIR/.ssh/authorized_keys"

echo "----- result on $(hostname) -----"
id "$JARVIS_USER"
echo "shell: $(getent passwd "$JARVIS_USER" | cut -d: -f7)"
echo "password: $(passwd -S "$JARVIS_USER" 2>/dev/null | awk '{print $2}') (NP/L/P; '*' hash = no password login)"
echo "sudo: $(sudo -l -U "$JARVIS_USER" 2>/dev/null | grep -q 'may run' && echo 'HAS SUDO - REVIEW' || echo none)"
ls -ld "$HOME_DIR/.ssh"; ls -l "$HOME_DIR/.ssh/authorized_keys"
echo "authorized_keys: $(cut -c1-110 "$HOME_DIR/.ssh/authorized_keys")…"
echo "host key fingerprints (send these to verify JARVIS known_hosts):"
for k in /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_ecdsa_key.pub; do [[ -f $k ]] && ssh-keygen -lf "$k"; done
echo "done."
