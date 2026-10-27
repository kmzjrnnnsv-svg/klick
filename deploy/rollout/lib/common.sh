#!/usr/bin/env bash
# Gemeinsame Hilfen des Rollout-Skripts (deploy/rollout/rollout.sh).
# Regeln: nichts Geheimes auf stdout (das Protokoll liest mit), Passwörter und
# Schlüssel nie in argv, jede überschriebene Datei vorher sichern, jede
# Netz-Änderung nur mit Rückweg.
set -euo pipefail

: "${DEPLOY:?DEPLOY fehlt}"
TROCKEN="${TROCKEN:-0}"
RUN_ID="${RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
SICHERUNG="/var/backups/klick-rollout/$RUN_ID"
STATE_DIR=/var/lib/klick-rollout
CREDSTORE=/etc/credstore.encrypted
KLICK_DIR="${KLICK_DIR:-/opt/klick/current}"
BOTH_DIR="${BOTH_DIR:-/opt/both/current}"
# Release-Schlüssel außerhalb jedes Checkouts (scripts/release-guard.ts,
# deploy/signer/install.sh)
ANKER=/etc/klick-release/allowed_signers
WG_CONF=/etc/wireguard/wg-admin.conf
# Not-Freigabe, wenn Klick nach einem Update an der Start-Prüfung scheitert
# (Runbook „Klick startet nach einem Update nicht“); Phase klick räumt sie auf
NOTFREIGABE=/etc/systemd/system/klick.service.d/risiken.conf

die() {
	printf 'rollout: %s\n' "$*" >&2
	exit 1
}
titel() { printf '\n== %s ==\n' "$*"; }
ok() { printf '  ✔ %s\n' "$*"; }
info() { printf '  · %s\n' "$*"; }
hinweis() { printf '  ! %s\n' "$*"; }
trocken() { [ "$TROCKEN" = 1 ]; }

# Rückfrage an das Terminal; im Trockenlauf gilt „ja“, damit die Vorschau
# alle Schritte zeigt.
frage() {
	local text="$1" a
	if trocken; then
		info "(Trockenlauf) Rückfrage: $text → ja"
		return 0
	fi
	[ -r /dev/tty ] || die "Rückfrage braucht ein Terminal: $text"
	printf '  ? %s [ja/nein] ' "$text" >/dev/tty
	read -r a </dev/tty || a=""
	case "$a" in ja | j | Ja | J | yes | y) return 0 ;; *) return 1 ;; esac
}

# Eingabe vom Terminal (sichtbar); `weiter` wartet nur auf Enter.
eingabe() {
	local text="$1" a
	trocken && return 0
	printf '  ? %s ' "$text" >/dev/tty
	read -r a </dev/tty || a=""
	printf '%s' "$a"
}
weiter() {
	trocken && return 0
	printf '  ⏎ %s ' "${1:-Weiter mit Enter}" >/dev/tty
	read -r _ </dev/tty || true
}

# Befehl ausführen bzw. im Trockenlauf nur zeigen.
aendern() {
	if trocken; then
		printf '  → würde: '
		printf '%q ' "$@"
		printf '\n'
		return 0
	fi
	"$@"
}

paket_da() { dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q 'install ok installed'; }
pakete() {
	local fehlt=() p
	for p in "$@"; do paket_da "$p" || fehlt+=("$p"); done
	[ "${#fehlt[@]}" -eq 0 ] && return 0
	info "Pakete: ${fehlt[*]}"
	# needrestart nur auflisten: Dienste startet das Skript selbst neu
	aendern env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l \
		apt-get install -y -q --no-install-recommends "${fehlt[@]}"
}

# Alte Fassung einer Datei unter /var/backups/klick-rollout/<lauf>/ ablegen.
sichern() {
	local f="$1"
	[ -e "$f" ] || return 0
	trocken && return 0
	install -d -m 0700 -o root -g root "$SICHERUNG"
	cp -a --parents "$f" "$SICHERUNG/"
}
gesichert() { printf '%s%s' "$SICHERUNG" "$1"; }

# Inhalt von stdin nach <ziel> schreiben, nur wenn er sich ändert.
#   schreibe_inhalt <ziel> [modus] [user:gruppe] [geheim]
# Setzt GEAENDERT=1 bei Änderung. `geheim` zeigt keinen diff (Env-Dateien).
GEAENDERT=0
schreibe_inhalt() {
	local ziel="$1" modus="${2:-0644}" own="${3:-root:root}" geheim="${4:-}"
	local tmp
	tmp="$(mktemp)"
	cat >"$tmp"
	if [ -f "$ziel" ] && cmp -s "$tmp" "$ziel"; then
		rm -f "$tmp"
		ok "$ziel unverändert"
		return 0
	fi
	GEAENDERT=1
	if [ -f "$ziel" ]; then
		if [ -n "$geheim" ]; then
			info "$ziel ändert sich (Inhalt wird nicht angezeigt)"
		else
			diff -u "$ziel" "$tmp" | sed -n '1,60p' | sed 's/^/    /' || true
		fi
	fi
	if trocken; then
		info "(Trockenlauf) würde $ziel schreiben"
		rm -f "$tmp"
		return 0
	fi
	sichern "$ziel"
	install -D -m "$modus" -o "${own%%:*}" -g "${own##*:}" "$tmp" "$ziel"
	rm -f "$tmp"
	ok "$ziel geschrieben"
}
einspielen() {
	local src="$1"
	shift
	[ -f "$src" ] || die "Quelle fehlt: $src"
	schreibe_inhalt "$@" <"$src"
}

# Rückweg für Netz-Änderungen: setzt nach 10 Minuten zurück, wenn niemand
# aus einer neuen Sitzung bestätigt (rueckweg_aus).
rueckweg() {
	local name="$1" befehl="$2"
	systemctl stop "klick-rueckweg-$name.timer" 2>/dev/null || true
	systemctl reset-failed "klick-rueckweg-$name.service" 2>/dev/null || true
	aendern systemd-run --quiet --unit="klick-rueckweg-$name" --on-active=10min \
		/bin/sh -c "$befehl"
	hinweis "Rückweg „$name“ scharf: in 10 Minuten wird zurückgesetzt, falls du nicht bestätigst"
}
rueckweg_aus() {
	aendern systemctl stop "klick-rueckweg-$1.timer" || true
	ok "Rückweg „$1“ entschärft"
}

# Wartet auf `rollout.sh bestaetigen <wort>` aus einer neuen Sitzung.
#   bestaetigung_abwarten <name> tunnel|egal <hinweis>
bestaetigung_abwarten() {
	local name="$1" quelle="$2" text="$3" wort i
	if trocken; then
		info "(Trockenlauf) würde auf Bestätigung „$name“ warten"
		return 0
	fi
	install -d -m 0700 -o root -g root "$STATE_DIR"
	wort="$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n')"
	printf '%s %s\n' "$wort" "$quelle" >"$STATE_DIR/erwartet-$name"
	rm -f "$STATE_DIR/bestaetigt-$name"
	printf '\n  ┌ %s\n' "$text"
	printf '  │ Öffne jetzt eine NEUE Sitzung und tippe dort:\n'
	printf '  │   sudo %s bestaetigen %s\n' "$ROLLOUT" "$wort"
	printf '  └ Ohne Bestätigung setzt der Rückweg in 10 Minuten alles zurück.\n'
	for i in $(seq 1 180); do
		if [ -f "$STATE_DIR/bestaetigt-$name" ]; then
			rm -f "$STATE_DIR/erwartet-$name" "$STATE_DIR/bestaetigt-$name"
			ok "bestätigt aus einer neuen Sitzung"
			return 0
		fi
		sleep 3
	done
	rm -f "$STATE_DIR/erwartet-$name"
	die "keine Bestätigung für „$name“; der Rückweg setzt zurück. Ursache prüfen, dann die Phase erneut starten"
}

# Quelladresse der eigenen Sitzung (für `bestaetigen`): `who -m` liest das
# Terminal, das bleibt auch unter sudo erhalten; sonst SSH_CONNECTION.
sitzung_quelle() {
	local q pid
	q="$(who -m 2>/dev/null | sed -nE 's/.*\(([^)]*)\).*/\1/p' | head -1)"
	if [ -z "$q" ]; then
		# Ohne utmp-Eintrag (z. B. in tmux): den sshd der eigenen Sitzung im
		# Prozessbaum suchen und dessen Gegenstelle lesen
		pid=$$
		while [ "${pid:-1}" -gt 1 ] && [ "$(cat "/proc/$pid/comm" 2>/dev/null)" != sshd ]; do
			pid="$(ps -o ppid= -p "$pid" | tr -d ' ')"
		done
		if [ "${pid:-1}" -gt 1 ]; then
			q="$(ss -tnpH state established 2>/dev/null | grep "pid=$pid," |
				awk '{print $(NF - 1)}' | head -1)"
			q="${q%:*}"
			q="${q#[}"
			q="${q%]}"
		fi
	fi
	[ -n "$q" ] || q="${SSH_CONNECTION%% *}"
	printf '%s' "$q"
}

warte_bereit() {
	local url="$1" sek="${2:-120}" i
	trocken && return 0
	for i in $(seq 1 $((sek / 3))); do
		if curl -fsS --max-time 5 -o /dev/null "$url" 2>/dev/null; then
			ok "$url antwortet"
			return 0
		fi
		sleep 3
	done
	return 1
}

speicher_kb() { awk -v k="$1:" '$1 == k { print $2 }' /proc/meminfo; }

# root-Passwort für die Hetzner-Konsole (Rückweg, wenn SSH zu ist)
root_passwort_gesetzt() { [ "$(passwd -S root 2>/dev/null | awk '{print $2}')" = P ]; }

# Ist mindestens ein Admin-Gerät in den letzten 5 Minuten verbunden?
tunnel_verbunden() {
	local jetzt t
	jetzt="$(date +%s)"
	while read -r _ t; do
		[ "${t:-0}" -gt 0 ] && [ $((jetzt - t)) -lt 300 ] && return 0
	done < <(wg show wg-admin latest-handshakes 2>/dev/null || true)
	return 1
}

oeffentliche_ip() {
	ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}'
}

# Credential entschlüsseln (nur in Variablen verwenden, nie ausgeben).
cred() { systemd-creds decrypt "$CREDSTORE/$1" - 2>/dev/null; }

# Umgebung wie die Unit sie sieht (Environment=, EnvironmentFile,
# Credentials nach derselben Zuordnung wie klick-start.sh/both-start.sh) —
# nur in einer Subshell aufrufen: ( app_env klick; … ).
app_env() {
	local unit="$1" kv f n v
	while IFS= read -r kv; do
		[ -n "$kv" ] && export "${kv?}"
	done < <(systemctl show -p Environment --value "$unit" | xargs -n1 printf '%s\n')
	case "$unit" in
	klick) f=/etc/klick/klick.env ;;
	both) f=/etc/both/both.env ;;
	*) die "app_env: unbekannte Unit $unit" ;;
	esac
	if [ -r "$f" ]; then
		set -a
		# shellcheck disable=SC1090
		. "$f"
		set +a
	fi
	if [ "$unit" = klick ]; then
		for n in better_auth_secret vault_kek_base64 database_url database_url_migrate smtp_pass; do
			v="$(cred "$n" || true)"
			[ -n "$v" ] && export "${n^^}=$v"
		done
	else
		for n in wallet_auth_secret wallet_vault_kek_base64 wallet_database_url wallet_database_url_migrate; do
			v="$(cred "$n" || true)"
			[ -n "$v" ] && export "${n^^}=$v"
		done
		v="$(cred wallet_brevo_api_key || true)"
		[ -n "$v" ] && export BREVO_API_KEY="$v"
		for n in bitcoin_signet bitcoin_mainnet ethereum_sepolia ethereum_mainnet; do
			v="$(cred "both_rpc_$n" || true)"
			[ -n "$v" ] && export "WALLET_RPC_${n^^}=$v"
		done
	fi
	unset NODE_ENV
	export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
}

# Zeilen mit Schlüssel in einer allowed_signers-Datei
anker_schluessel() {
	local n=""
	[ -r "$1" ] && n="$(grep -cvE '^[[:space:]]*(#|$)' "$1" || true)"
	echo "${n:-0}"
}

# Liegt dieses Skript in einem Ordner, den nur root ändern kann? Sonst könnte
# ein Dienst-User (klick, both) Code unterschieben, der als root läuft.
pfad_sicher() {
	local d="$1" st
	while :; do
		st="$(stat -c '%u %a' "$d")" || return 1
		[ "${st%% *}" = 0 ] || return 1
		# Gruppe/andere dürfen nicht schreiben (Sticky-Ordner wie /tmp nie)
		[ $((8#${st##* } & 8#022)) -eq 0 ] || return 1
		[ "$d" = / ] && return 0
		d="$(dirname "$d")"
	done
}
