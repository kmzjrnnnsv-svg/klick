#!/usr/bin/env bash
# Zustand des App-Servers prüfen (Härtung H9). Läuft stündlich über
# klick-health.timer als root; jede Abweichung steht im Journal, und der Lauf
# endet mit Fehler → klick-alert@ mailt die letzten Zeilen.
#
#   HEALTH_DISK_MAX=85         Prozent belegt je Dateisystem
#   HEALTH_CERT_DAYS=14        Tage bis zum Zertifikatsablauf
#   HEALTH_BANS_MAX=200        aktive CrowdSec-Sperren (mehr = Angriff oder Fehlalarm)
#   HEALTH_STATUS_FILE=/var/lib/klick-health/status.json
#
# Zusätzlich schreibt der Lauf eine Statusdatei für Admin > Betrieb (die App
# hat kein root und liest nur): Ordner root:klick 2750 (Rollout-Phase
# ueberwachung), Datei 0640 und atomar ersetzt. Nur Zustand, keine
# Geheimnisse; Format in lib/admin/host-status.ts (version 1).
set -uo pipefail

DISK_MAX="${HEALTH_DISK_MAX:-85}"
CERT_DAYS="${HEALTH_CERT_DAYS:-14}"
BANS_MAX="${HEALTH_BANS_MAX:-200}"
STATUS_FILE="${HEALTH_STATUS_FILE:-/var/lib/klick-health/status.json}"
problems=0
problem_list=()
disks_json=()
certs_json=()
services_json=()
units_json=()
bans_json=null

# JSON-Zeichenkette: Steuerzeichen weg, Backslash und Anführungszeichen entwertet
json_str() {
	local s
	s="$(printf '%s' "$1" | tr -d '\000-\037')"
	s="${s//\\/\\\\}"
	s="${s//\"/\\\"}"
	printf '"%s"' "$s"
}

# Zeitpunkt als ISO-8601 (UTC) aus „@<sekunden>“ oder einer Datumsangabe
iso_time() {
	local v="$1"
	[ -n "$v" ] && [ "$v" != "n/a" ] && [ "$v" != "0" ] || { printf '""'; return; }
	v="${v#@}"
	if [[ "$v" =~ ^[0-9]+$ ]]; then
		printf '"%s"' "$(date -u -d "@$v" +%Y-%m-%dT%H:%M:%SZ)"
	else
		local out
		out="$(date -u -d "$v" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)" || out=""
		printf '"%s"' "$out"
	fi
}

warn() {
	echo "PROBLEM: $*"
	problems=$((problems + 1))
	problem_list+=("$(json_str "$*")")
}

# Platte: jedes echte Dateisystem
while read -r use mount; do
	pct="${use%\%}"
	disks_json+=("{\"mount\":$(json_str "$mount"),\"usedPct\":$pct}")
	if [ "$pct" -ge "$DISK_MAX" ]; then warn "Dateisystem $mount zu $pct % belegt"; fi
done < <(df -P -x tmpfs -x devtmpfs -x overlay -x squashfs | awk 'NR>1 {print $5, $6}')

# Arbeitsspeicher (MB)
mem_total="$(awk '/^MemTotal:/ {print int($2/1024)}' /proc/meminfo 2>/dev/null)"
mem_avail="$(awk '/^MemAvailable:/ {print int($2/1024)}' /proc/meminfo 2>/dev/null)"
mem_json=null
if [ -n "$mem_total" ] && [ -n "$mem_avail" ]; then
	mem_json="{\"totalMb\":$mem_total,\"availableMb\":$mem_avail}"
fi

# Zertifikate
for cert in /etc/letsencrypt/live/*/fullchain.pem; do
	[ -e "$cert" ] || continue
	name="$(basename "$(dirname "$cert")")"
	end="$(openssl x509 -enddate -noout -in "$cert" 2>/dev/null | sed 's/^notAfter=//')"
	if [ -n "$end" ]; then
		certs_json+=("{\"name\":$(json_str "$name"),\"notAfter\":$(iso_time "$end")}")
	fi
	if ! openssl x509 -checkend $((CERT_DAYS * 86400)) -noout -in "$cert" >/dev/null; then
		warn "Zertifikat $name läuft in weniger als $CERT_DAYS Tagen ab"
	fi
done

# Dienste der Plattform (nur installierte zählen in der App)
for u in klick both klick-signer nginx postgresql wg-quick@wg-admin crowdsec clamav-daemon; do
	active="$(systemctl is-active "$u" 2>/dev/null)"
	enabled="$(systemctl is-enabled "$u" 2>/dev/null)"
	services_json+=("{\"name\":$(json_str "$u"),\"active\":$(json_str "${active:-unknown}"),\"enabled\":$(json_str "${enabled:-not-found}")}")
done

# Sicherungen und Prüfläufe: letztes Ergebnis und Zeitpunkt
for u in klick-backup-db klick-backup-objects klick-backup-verify klick-aide; do
	result="$(systemctl show "$u.service" -p Result --value 2>/dev/null)"
	at="$(systemctl show "$u.service" --timestamp=unix -p ExecMainExitTimestamp --value 2>/dev/null)"
	units_json+=("{\"name\":$(json_str "$u"),\"result\":$(json_str "$result"),\"at\":$(iso_time "$at")}")
done

# Ausstehende Updates (Ubuntu: apt-check meldet „gesamt;Sicherheit“ auf stderr)
updates_json=null
if [ -x /usr/lib/update-notifier/apt-check ]; then
	counts="$(/usr/lib/update-notifier/apt-check 2>&1 >/dev/null | tail -n 1)"
	if [[ "$counts" =~ ^([0-9]+)\;([0-9]+)$ ]]; then
		updates_json="{\"total\":${BASH_REMATCH[1]},\"security\":${BASH_REMATCH[2]}}"
	fi
fi

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
	bans_json="${bans:-0}"
	if [ "${bans:-0}" -gt "$BANS_MAX" ]; then warn "$bans aktive CrowdSec-Sperren (Grenze $BANS_MAX)"; fi
else
	warn "CrowdSec nicht installiert"
fi

# Neustart nach Kernel-Update ausstehend (unattended-upgrades startet 04:30 neu)
if [ -f /var/run/reboot-required ] && [ "$(find /var/run/reboot-required -mmin +2880 2>/dev/null)" ]; then
	warn "Neustart seit mehr als 2 Tagen ausstehend"
fi

reboot=false
[ -f /var/run/reboot-required ] && reboot=true

join() {
	local IFS=,
	printf '%s' "$*"
}

# Statusdatei atomar ersetzen (nur, wenn der Ordner existiert)
dir="$(dirname "$STATUS_FILE")"
if [ -d "$dir" ] && [ -w "$dir" ]; then
	tmp="$(mktemp "$dir/.status.XXXXXX")" && {
		printf '{"version":1,"checkedAt":"%s","problems":[%s],"disks":[%s],"memory":%s,"updates":%s,"rebootRequired":%s,"certs":[%s],"services":[%s],"units":[%s],"crowdsecBans":%s}\n' \
			"$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
			"$(join "${problem_list[@]}")" "$(join "${disks_json[@]}")" \
			"$mem_json" "$updates_json" "$reboot" \
			"$(join "${certs_json[@]}")" "$(join "${services_json[@]}")" \
			"$(join "${units_json[@]}")" "$bans_json" >"$tmp"
		chmod 0640 "$tmp"
		mv -f "$tmp" "$STATUS_FILE"
	} || echo "Statusdatei nicht geschrieben ($dir)"
fi

if [ "$problems" -gt 0 ]; then
	echo "$problems Problem(e) gefunden"
	exit 1
fi
echo "Server in Ordnung"
