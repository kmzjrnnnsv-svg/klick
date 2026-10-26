#!/usr/bin/env bash
# Zustand des App-Servers prüfen (Härtung H9). Läuft stündlich über
# klick-health.timer als root; jede Abweichung steht im Journal, und der Lauf
# endet mit Fehler → klick-alert@ mailt die letzten Zeilen.
#
#   HEALTH_DISK_MAX=85         Prozent belegt je Dateisystem
#   HEALTH_CERT_DAYS=14        Tage bis zum Zertifikatsablauf
#   HEALTH_BANS_MAX=200        aktive CrowdSec-Sperren (mehr = Angriff oder Fehlalarm)
set -uo pipefail

DISK_MAX="${HEALTH_DISK_MAX:-85}"
CERT_DAYS="${HEALTH_CERT_DAYS:-14}"
BANS_MAX="${HEALTH_BANS_MAX:-200}"
problems=0

warn() {
	echo "PROBLEM: $*"
	problems=$((problems + 1))
}

# Platte: jedes echte Dateisystem
while read -r use mount; do
	pct="${use%\%}"
	if [ "$pct" -ge "$DISK_MAX" ]; then warn "Dateisystem $mount zu $pct % belegt"; fi
done < <(df -P -x tmpfs -x devtmpfs -x overlay -x squashfs | awk 'NR>1 {print $5, $6}')

# Zertifikate
for cert in /etc/letsencrypt/live/*/fullchain.pem; do
	[ -e "$cert" ] || continue
	if ! openssl x509 -checkend $((CERT_DAYS * 86400)) -noout -in "$cert" >/dev/null; then
		warn "Zertifikat $(basename "$(dirname "$cert")") läuft in weniger als $CERT_DAYS Tagen ab"
	fi
done

# Dienste mit Fehler
failed="$(systemctl list-units --state=failed --no-legend --plain | awk '{print $1}' | tr '\n' ' ')"
if [ -n "${failed// /}" ]; then warn "Dienste mit Fehler: $failed"; fi

# Kernel-Audit läuft und ist gesperrt (-e 2)
if command -v auditctl >/dev/null; then
	if ! systemctl is-active --quiet auditd; then warn "auditd läuft nicht"; fi
	if ! auditctl -s 2>/dev/null | grep -q '^enabled 2'; then warn "Audit-Regeln nicht gesperrt (enabled ≠ 2)"; fi
else
	warn "auditd nicht installiert"
fi

# Firewall geladen
if ! nft list table inet klick >/dev/null 2>&1; then warn "nftables-Tabelle inet klick fehlt"; fi

# SSH nur im Admin-Tunnel: keine Regel, die 22 ohne wg-admin öffnet
if nft list chain inet klick input 2>/dev/null | grep -E 'dport (22|\{[^}]*\b22\b)' | grep -vq 'iifname "wg-admin"'; then
	warn "SSH ist nicht auf wg-admin beschränkt"
fi

# CrowdSec: Agent und Bouncer laufen, Sperren im Rahmen
if command -v cscli >/dev/null; then
	systemctl is-active --quiet crowdsec || warn "crowdsec läuft nicht"
	bans="$(cscli decisions list -o raw 2>/dev/null | tail -n +2 | wc -l)"
	if [ "${bans:-0}" -gt "$BANS_MAX" ]; then warn "$bans aktive CrowdSec-Sperren (Grenze $BANS_MAX)"; fi
else
	warn "CrowdSec nicht installiert"
fi

# Neustart nach Kernel-Update ausstehend (unattended-upgrades startet 04:30 neu)
if [ -f /var/run/reboot-required ] && [ "$(find /var/run/reboot-required -mmin +2880 2>/dev/null)" ]; then
	warn "Neustart seit mehr als 2 Tagen ausstehend"
fi

if [ "$problems" -gt 0 ]; then
	echo "$problems Problem(e) gefunden"
	exit 1
fi
echo "Server in Ordnung"
