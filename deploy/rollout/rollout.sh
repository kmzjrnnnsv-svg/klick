#!/usr/bin/env bash
# Server-Rollout für Klick und both.money (Runbook „Server härten“, Releases,
# Signer) — als root, nur aus einem root-eigenen Checkout:
#
#   sudo git clone --depth 1 --branch main https://github.com/kmzjrnnnsv-svg/klick.git /usr/local/src/klick-rollout
#   sudo tmux new -s rollout
#   sudo /usr/local/src/klick-rollout/deploy/rollout/rollout.sh pruefen
#   sudo /usr/local/src/klick-rollout/deploy/rollout/rollout.sh alles --admin <name> --geraet laptop --geraet handy
#
# Jede Phase prüft zuerst, ob sie schon erledigt ist, sichert jede Datei vor
# dem Überschreiben (/var/backups/klick-rollout/<lauf>/) und lässt sich
# einzeln wiederholen. Netz-Änderungen stellen einen Rückweg scharf, der
# nach 10 Minuten zurücksetzt, wenn du nicht aus einer neuen Sitzung
# bestätigst. Runbook: deploy/README.md, „Rollout-Skript“.
set -euo pipefail

ROLLOUT="$(readlink -f "${BASH_SOURCE[0]}")"
ROOT_DIR="$(cd "$(dirname "$ROLLOUT")/../.." && pwd -P)"
DEPLOY="$ROOT_DIR/deploy"
LIB="$ROOT_DIR/deploy/rollout/lib"

# Reihenfolge von `alles`
PHASEN=(pruefen grundlage updates firewall wireguard ssh firewall-final system nginx crowdsec
	postgres virenscanner klick both signer ueberwachung abschluss)
# einzeln aufrufbar, nicht Teil von `alles`
EINZELN=(ssh-schluessel bestaetigen)

hilfe() {
	cat <<EOF
Aufruf: sudo $0 <phase>… [optionen]

Phasen (Reihenfolge von „alles“):
  pruefen         Stand anzeigen, ändert nichts
  grundlage       Pakete, Ordner, Swap, Release-Schlüssel (/etc/klick-release)
  updates         Sicherheits-Updates jetzt und danach täglich automatisch
  firewall        nftables im Übergang (SSH noch öffentlich, WireGuard offen)
  wireguard       Admin-Netz wg-admin, Geräte mit QR-Code, Split-DNS
  ssh             SSH nur über den Tunnel (bisherige Schlüssel), Admin-Konto
  firewall-final  SSH öffentlich zu; danach Hetzner-Firewall angleichen
  system          sysctl, auditd, AppArmor, AIDE-Regeln
  nginx           Admin-Netz, Standard-Server, vHosts (mit Rückfrage)
  crowdsec        CrowdSec mit WAF und Bouncern
  postgres        SCRAM, nur localhost, pg_hba
  virenscanner    clamd ab ≈ 7,5 GiB RAM, sonst Risiko no_av
  klick           Backup, pnpm release (Migrationen), Units, Neustart
  both            Backup, pnpm release:wallet, Units, Neustart
  signer          Signer neu bauen (braucht --signer-tag und --signer-sha)
  ueberwachung    klick-health
  abschluss       AIDE-Basis, Lynis, Bericht als Nachweis
  alles           alle oben in dieser Reihenfolge (je Phase Rückfrage)

Einzeln:
  ssh-schluessel  SSH nur noch mit Sicherheitsschlüssel und PIN (später)
  bestaetigen <wort>  aus der neuen Sitzung: Netz-Schritt bestätigen

Optionen:
  --admin <name>       SSH-Konto (root darf nicht)
  --geraet <name>      WireGuard-Gerät anlegen (mehrfach)
  --endpoint <ip>      öffentliche Adresse für die Geräte (sonst erkannt)
  --ref <tag|branch>   Stand für klick/both (Standard: main; mit Release-Schlüssel nur Tags)
  --signer-tag <tag>   Tag für den Signer
  --signer-sha <hex>   SHA-256 aus CI („Signer bündeln“)
  --ab <phase>         „alles“ ab dieser Phase fortsetzen
  --trocken            nur zeigen, was sich ändern würde
  --ja                 Rückfrage „Phase jetzt?“ bei „alles“ weglassen
  --hilfe              diese Hilfe
EOF
}

ist_phase() {
	local p
	for p in "${PHASEN[@]}" "${EINZELN[@]}" alles; do [ "$p" = "$1" ] && return 0; done
	return 1
}

ADMIN="" ENDPOINT="" REF="" SIGNER_TAG="" SIGNER_SHA="" AB="" TROCKEN=0 JA=0
GERAETE=()
AUFTRAG=()
WORT=""
while [ $# -gt 0 ]; do
	case "$1" in
	--hilfe | -h | --help)
		hilfe
		exit 0
		;;
	--admin) ADMIN="${2:?--admin braucht einen Namen}"; shift ;;
	--geraet) GERAETE+=("${2:?--geraet braucht einen Namen}"); shift ;;
	--endpoint) ENDPOINT="${2:?--endpoint braucht eine Adresse}"; shift ;;
	--ref) REF="${2:?--ref braucht Tag oder Branch}"; shift ;;
	--signer-tag) SIGNER_TAG="${2:?}"; shift ;;
	--signer-sha) SIGNER_SHA="${2:?}"; shift ;;
	--ab) AB="${2:?}"; shift ;;
	--trocken) TROCKEN=1 ;;
	--ja) JA=1 ;;
	-*)
		echo "rollout: unbekannte Option $1 (--hilfe)" >&2
		exit 2
		;;
	*)
		if [ "${AUFTRAG[0]:-}" = bestaetigen ] && [ -z "$WORT" ]; then
			WORT="$1"
		elif ist_phase "$1"; then
			AUFTRAG+=("$1")
		else
			echo "rollout: unbekannte Phase $1 (--hilfe)" >&2
			exit 2
		fi
		;;
	esac
	shift
done
[ "${#AUFTRAG[@]}" -gt 0 ] || {
	hilfe
	exit 2
}
[ -z "$AB" ] || ist_phase "$AB" || {
	echo "rollout: --ab $AB ist keine Phase" >&2
	exit 2
}
[ -z "$ADMIN" ] || [[ "$ADMIN" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || {
	echo "rollout: --admin ungültig: $ADMIN" >&2
	exit 2
}
[ -z "$REF" ] || [[ "$REF" =~ ^[A-Za-z0-9._/-]{1,100}$ ]] || {
	echo "rollout: --ref ungültig: $REF" >&2
	exit 2
}

export TROCKEN DEPLOY ROOT_DIR
# shellcheck source=deploy/rollout/lib/rein.sh
. "$LIB/rein.sh"
# shellcheck source=deploy/rollout/lib/common.sh
. "$LIB/common.sh"
. "$LIB/netz.sh"
. "$LIB/system.sh"
. "$LIB/apps.sh"
. "$LIB/bericht.sh"

[ "$(id -u)" = 0 ] || die "nur als root (sudo)"
pfad_sicher "$ROOT_DIR/deploy/rollout" ||
	die "$ROOT_DIR ist nicht root-eigen oder für andere schreibbar. Nie aus /opt/klick/current als root starten, sondern: sudo git clone … /usr/local/src/klick-rollout"
# auch keine einzelne Datei, die ein anderer User ändern könnte
[ -z "$(find "$DEPLOY" "$ROOT_DIR/scripts" \( ! -user root -o -perm -g+w -o -perm -o+w \) ! -type l -print -quit)" ] ||
	die "Dateien unter $DEPLOY oder scripts/ gehören nicht root oder sind für andere schreibbar"

if [ "${AUFTRAG[0]}" = bestaetigen ]; then
	phase_bestaetigen "$WORT"
	exit 0
fi

# Nur ein Lauf zur Zeit (bestaetigen läuft parallel und braucht die Sperre nicht)
exec 9>/run/klick-rollout.lock
flock -n 9 || die "ein anderer Lauf ist aktiv"

# Protokoll ohne Geheimnisse (WireGuard-Konfigurationen gehen nur ans Terminal)
install -d -m 0700 -o root -g root /var/log/klick-rollout
LOG="/var/log/klick-rollout/$RUN_ID.log"
exec > >(tee -a "$LOG") 2>&1
info "Lauf $RUN_ID$([ "$TROCKEN" = 1 ] && echo ' (Trockenlauf)'), Protokoll $LOG"
info "Rollout-Stand: $(git -C "$ROOT_DIR" describe --tags --always 2>/dev/null || echo unbekannt)"

phase_ausfuehren() {
	local p="$1"
	case "$p" in
	pruefen) phase_pruefen ;;
	grundlage) phase_grundlage ;;
	updates) phase_updates ;;
	firewall) phase_firewall ;;
	wireguard) phase_wireguard ;;
	ssh) phase_ssh ;;
	firewall-final) phase_firewall_final ;;
	system) phase_system ;;
	nginx) phase_nginx ;;
	crowdsec) phase_crowdsec ;;
	postgres) phase_postgres ;;
	virenscanner) phase_virenscanner ;;
	klick) phase_klick ;;
	both) phase_both ;;
	signer) phase_signer ;;
	ueberwachung) phase_ueberwachung ;;
	abschluss) phase_abschluss ;;
	ssh-schluessel) phase_ssh_schluessel ;;
	*) die "unbekannte Phase $p" ;;
	esac
}

for auftrag in "${AUFTRAG[@]}"; do
	if [ "$auftrag" != alles ]; then
		phase_ausfuehren "$auftrag"
		continue
	fi
	gestartet=0
	[ -n "$AB" ] || gestartet=1
	for p in "${PHASEN[@]}"; do
		[ "$p" = "$AB" ] && gestartet=1
		[ "$gestartet" = 1 ] || continue
		if [ "$JA" = 0 ] && [ "$p" != pruefen ] && ! frage "Phase „$p“ jetzt ausführen?"; then
			hinweis "Phase $p übersprungen (später: $0 $p)"
			continue
		fi
		phase_ausfuehren "$p"
	done
done

titel "Fertig"
[ -d "$SICHERUNG" ] && info "Gesicherte Dateien: $SICHERUNG"
if ! trocken && [ -f /var/run/reboot-required ]; then
	hinweis "Neustart nötig (Updates): sudo reboot, sonst nachts um 04:30 von selbst"
fi
info "Protokoll: $LOG"
if ! trocken && [ -f /etc/ssh/sshd_config.d/10-klick.conf ] &&
	! grep -q '^PubkeyAcceptedAlgorithms sk-' /etc/ssh/sshd_config.d/10-klick.conf; then
	hinweis "Später, mit FIDO2-Schlüsseln: $0 ssh-schluessel --admin <name>"
fi
