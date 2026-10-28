#!/usr/bin/env bash
# Reine Hilfen des Rollout-Skripts: rechnen nur aus ihren Eingaben und
# schreiben nach stdout, nie auf das System. Getestet in
# tests/deploy-rollout.test.ts (über `bash -c 'source …'`).
set -euo pipefail

# Ab dieser Größe (MemTotal in kB, ≈ 7,5 GiB) läuft clamd neben Klick,
# both.money, Postgres und CrowdSec; ein Server mit „8 GB“ meldet etwas
# weniger als 8 GiB.
CLAMD_MIN_KB=7864320

# Virenscanner nach Arbeitsspeicher: „clamd“ oder „no_av“ (Risiko hinnehmen).
virenscanner_entscheidung() {
	local kb="${1:?MemTotal in kB fehlt}"
	[[ "$kb" =~ ^[0-9]+$ ]] || return 2
	if [ "$kb" -ge "$CLAMD_MIN_KB" ]; then echo clamd; else echo no_av; fi
}

# Komma-Liste zusammenführen: `risks_merge "<liste>" add|remove <eintrag>`.
# Reihenfolge bleibt, Doppelte und Leerzeichen fallen weg.
risks_merge() {
	local list="${1-}" op="${2:?add|remove}" item="${3:?Eintrag fehlt}"
	local out="" x seen=","
	IFS=',' read -r -a parts <<<"$list"
	for x in "${parts[@]}"; do
		x="${x//[[:space:]]/}"
		[ -n "$x" ] || continue
		[ "$op" = remove ] && [ "$x" = "$item" ] && continue
		case "$seen" in *",$x,"*) continue ;; esac
		seen="$seen$x,"
		out="${out:+$out,}$x"
	done
	if [ "$op" = add ]; then
		case "$seen" in *",$item,"*) ;; *) out="${out:+$out,}$item" ;; esac
	fi
	printf '%s\n' "$out"
}

# Letzter Wert eines Schlüssels in einer Env-Datei (wie systemd ihn liest:
# spätere Zeilen gewinnen), ohne Anführungszeichen.
env_wert() {
	local file="$1" key="$2"
	[ -r "$file" ] || return 0
	awk -v k="$key" '
		/^[[:space:]]*#/ { next }
		index($0, k "=") == 1 { v = substr($0, length(k) + 2) }
		END { gsub(/^"|"$/, "", v); printf "%s", v }
	' "$file"
}

# Wert eines Schlüssels aus den `Environment=`-Zeilen einer systemd-Datei
# (Drop-in): mehrere Zuweisungen je Zeile, spätere gewinnen, leeres
# `Environment=` setzt zurück. Werte mit Leerzeichen kennt sie nicht.
dropin_wert() {
	local file="$1" key="$2"
	[ -r "$file" ] || return 0
	awk -v k="$key" '
		/^[[:space:]]*[#;]/ { next }
		/^[[:space:]]*Environment[[:space:]]*=/ {
			rest = substr($0, index($0, "=") + 1)
			if (rest ~ /^[[:space:]]*$/) { v = ""; next }
			n = split(rest, t, /[[:space:]]+/)
			for (i = 1; i <= n; i++) {
				gsub(/^"|"$/, "", t[i])
				if (index(t[i], k "=") == 1) v = substr(t[i], length(k) + 2)
			}
		}
		END { printf "%s", v }
	' "$file"
}

# Zwei Komma-Listen vereinen, Reihenfolge der ersten zuerst, ohne Doppelte.
risks_union() {
	local out="" x
	local -a teile=()
	IFS=',' read -r -a teile <<<"${1-},${2-}"
	for x in "${teile[@]}"; do
		x="${x//[[:space:]]/}"
		[ -n "$x" ] && out="$(risks_merge "$out" add "$x")"
	done
	printf '%s\n' "$out"
}

# Risiken nach dem Klick-Update: was in klick.env und in der Not-Freigabe
# (Drop-in risiken.conf) hingenommen ist, ohne admin_anywhere — die neue
# Unit setzt ADMIN_NETWORKS. Bleibt nur, wenn klick.env das Admin-Netz
# ausdrücklich leert.
#   risiken_nach_update <klick.env> <risiken.conf>
risiken_nach_update() {
	local env="$1" dropin="$2" liste
	liste="$(risks_union "$(env_wert "$env" PROD_ACCEPT_RISKS)" "$(dropin_wert "$dropin" PROD_ACCEPT_RISKS)")"
	if [ -r "$env" ] && grep -qE '^ADMIN_NETWORKS=' "$env" && [ -z "$(env_wert "$env" ADMIN_NETWORKS)" ]; then
		printf '%s\n' "$liste"
	else
		risks_merge "$liste" remove admin_anywhere
	fi
}

# Öffentlich lauschende Ports aus `ss -tulnpH` (stdin): Protokoll, Adresse,
# Programm und was nach der Härtung von außen noch geht. Adressen nur auf
# localhost oder im Admin-Netz fallen weg.
ports_bewerten() {
	awk '
		$5 ~ /^(127\.|\[::1\]|10\.9\.0\.1|\[fd10:9::1\])/ { next }
		{
			n = split($5, a, ":"); port = a[n]
			prog = "Kernel"
			if (match($0, /users:\(\("[^"]+"/)) prog = substr($0, RSTART + 9, RLENGTH - 10)
			if ($1 == "tcp" && (port == 80 || port == 443)) note = "bleibt offen (nginx)"
			else if ($1 == "udp" && port == 51820) note = "bleibt offen (WireGuard)"
			else if ($1 == "tcp" && port == 22) note = "nach Phase ssh nur im Tunnel"
			else if ($1 == "udp" && (port == 68 || port == 546)) note = "DHCP, bleibt"
			else note = "nach Phase firewall von außen zu"
			printf "%s %s (%s): %s\n", $1, $5, prog, note
		}' | sort -u
}

# Env-Datei mit verwaltetem Block neu schreiben (stdout).
#   env_block_render <datei> KEY=WERT …   (KEY= entfernt den Schlüssel)
# Gleiche Schlüssel außerhalb des Blocks werden auskommentiert, damit genau
# ein Wert gilt; alles andere bleibt Zeile für Zeile stehen.
ENV_BLOCK_START="# --- rollout (verwaltet von deploy/rollout, nicht von Hand ändern) ---"
ENV_BLOCK_END="# --- rollout Ende ---"
env_block_render() {
	local file="$1"
	shift
	local -a keys=() vals=()
	local kv k v i found
	# 1. bisherige Werte des Blocks übernehmen
	if [ -r "$file" ]; then
		while IFS= read -r kv; do
			[ -n "$kv" ] || continue
			keys+=("${kv%%=*}")
			vals+=("${kv#*=}")
		done < <(awk -v s="$ENV_BLOCK_START" -v e="$ENV_BLOCK_END" '
			$0 == s { inb = 1; next }
			$0 == e { inb = 0; next }
			inb && /^[A-Z_][A-Z0-9_]*=/ { print }
		' "$file")
	fi
	# 2. neue Werte setzen bzw. entfernen
	for kv in "$@"; do
		k="${kv%%=*}"
		v="${kv#*=}"
		[[ "$k" =~ ^[A-Z_][A-Z0-9_]*$ ]] || return 2
		found=0
		for i in "${!keys[@]}"; do
			if [ "${keys[$i]}" = "$k" ]; then
				vals[$i]="$v"
				found=1
			fi
		done
		[ "$found" = 1 ] || {
			keys+=("$k")
			vals+=("$v")
		}
	done
	# 3. Datei ohne alten Block; verwaltete Schlüssel draußen auskommentieren
	local managed=","
	for k in "${keys[@]}"; do managed="$managed$k,"; done
	if [ -r "$file" ]; then
		awk -v s="$ENV_BLOCK_START" -v e="$ENV_BLOCK_END" -v m="$managed" '
			$0 == s { inb = 1; next }
			$0 == e { inb = 0; next }
			inb { next }
			/^[A-Z_][A-Z0-9_]*=/ {
				k = substr($0, 1, index($0, "=") - 1)
				if (index(m, "," k ",")) { print "# rollout: " $0; next }
			}
			{ print }
		' "$file"
	fi
	# 4. Block anhängen (nur Schlüssel mit Wert)
	local any=0
	for i in "${!keys[@]}"; do [ -n "${vals[$i]}" ] && any=1; done
	[ "$any" = 1 ] || return 0
	printf '%s\n' "$ENV_BLOCK_START"
	for i in "${!keys[@]}"; do
		[ -n "${vals[$i]}" ] && printf '%s=%s\n' "${keys[$i]}" "${vals[$i]}"
	done
	printf '%s\n' "$ENV_BLOCK_END"
}

# Nächste freie Host-Nummer im Admin-Netz (10.9.0.N, fd10:9::N) aus einer
# wg-admin.conf; Geräte ab 10, die 1 ist der Server.
naechste_adresse() {
	local conf="$1" max=9 n
	if [ -r "$conf" ]; then
		while read -r n; do
			[ "$n" -gt "$max" ] && max="$n"
		done < <(grep -oE '10\.9\.0\.[0-9]+/32' "$conf" | sed -E 's#10\.9\.0\.([0-9]+)/32#\1#')
	fi
	n=$((max + 1))
	[ "$n" -le 254 ] || return 1
	echo "$n"
}

# nftables-Regeln aus deploy/firewall.nft: `uebergang` setzt an der Markierung
# SSH öffentlich (gedrosselt) ein, `final` lässt nur den Kommentar stehen.
render_firewall() {
	local mode="$1" src="${2:-${DEPLOY:?}/firewall.nft}"
	grep -q '^[[:space:]]*# @rollout: ssh-uebergang' "$src" || return 3
	case "$mode" in
	uebergang)
		sed -E 's|^([[:space:]]*)# @rollout: ssh-uebergang.*$|\1tcp dport 22 ct state new limit rate 10/minute accept # @rollout: ssh-uebergang (öffentlich, bis der Tunnel steht)|' "$src"
		;;
	final) cat "$src" ;;
	*) return 2 ;;
	esac
}

# sshd-Datei aus deploy/ssh/sshd_config.d/10-klick.conf:
#   render_sshd tunnel|schluessel <admin> [quelle]
# `tunnel` = nur über wg-admin, die vorhandenen Schlüssel gelten weiter (die
# zwei Zeilen „nur Sicherheitsschlüssel“ fallen weg); `schluessel` = volle Datei.
render_sshd() {
	local mode="$1" admin="$2" src="${3:-${DEPLOY:?}/ssh/sshd_config.d/10-klick.conf}"
	[[ "$admin" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || return 2
	case "$mode" in
	tunnel)
		sed -e "s/<admin>/$admin/g" \
			-e '/^PubkeyAcceptedAlgorithms /d' \
			-e '/^PubkeyAuthOptions /d' "$src"
		;;
	schluessel) sed -e "s/<admin>/$admin/g" "$src" ;;
	*) return 2 ;;
	esac
}

# Liegt eine Adresse im Admin-Netz (10.9.0.0/24, fd10:9::/64)?
im_admin_netz() {
	case "${1:-}" in
	10.9.0.*) return 0 ;;
	fd10:9::* | fd10:9:0:0:*) return 0 ;;
	*) return 1 ;;
	esac
}
