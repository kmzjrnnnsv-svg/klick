#!/usr/bin/env bash
# Netz-Phasen: firewall, wireguard, ssh, firewall-final, ssh-schluessel und
# die Bestätigung aus einer neuen Sitzung. Jede Änderung, die dich aussperren
# könnte, stellt vorher einen Rückweg scharf (rueckweg) und gilt erst nach
# `rollout.sh bestaetigen <wort>` aus einer neuen Sitzung.
set -euo pipefail

# Tabellen anderer Herkunft mit Input-Hook (alte Firewall, Ubuntu-Standard);
# die eigenen und die Sperrtabellen von CrowdSec und fail2ban bleiben
# (tabelle_bekannt in rein.sh).
fremde_tabellen() {
	local fam name
	while read -r _ fam name; do
		[ -n "$name" ] || continue
		tabelle_bekannt "$fam" "$name" && continue
		nft list table "$fam" "$name" 2>/dev/null | grep -q 'hook input' && printf '%s %s\n' "$fam" "$name"
	done < <(nft list tables 2>/dev/null || true)
}

firewall_einspielen() {
	local mode="$1" tmp alt fam name t
	GEAENDERT=0
	pakete nftables
	if ! command -v nft >/dev/null; then
		trocken || die "nft fehlt"
		info "(Trockenlauf) nft noch nicht installiert: Regelprüfung übersprungen"
		return 0
	fi
	tmp="$(mktemp)"
	render_firewall "$mode" >"$tmp" || die "deploy/firewall.nft ohne Markierung @rollout"
	nft -c -f "$tmp" || die "nftables-Regeln fehlerhaft (nft -c)"
	if [ -f /etc/nftables.conf ] && cmp -s "$tmp" /etc/nftables.conf &&
		nft list table inet klick >/dev/null 2>&1; then
		rm -f "$tmp"
		ok "Firewall ($mode) ist schon aktiv"
		return 0
	fi
	if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q 'Status: active'; then
		hinweis "ufw ist aktiv und setzt eigene Regeln"
		if frage "ufw abschalten (nftables übernimmt)?"; then aendern ufw disable; fi
	fi
	# Rückweg: Übergang → Tabelle weg (Firewall offen wie vorher);
	# final → Übergangsregeln wieder laden (SSH öffentlich)
	alt="$(gesichert /etc/nftables.conf)"
	if [ "$mode" = uebergang ]; then
		rueckweg firewall "nft delete table inet klick; [ -f '$alt' ] && cp -a '$alt' /etc/nftables.conf; true"
	else
		rueckweg firewall "if [ -f '$alt' ]; then cp -a '$alt' /etc/nftables.conf && nft -f /etc/nftables.conf; else nft delete table inet klick; fi"
	fi
	schreibe_inhalt /etc/nftables.conf 0644 root:root <"$tmp"
	rm -f "$tmp"
	aendern systemctl enable nftables
	if systemctl is-active --quiet nftables; then
		aendern systemctl reload nftables
	else
		aendern systemctl start nftables
	fi
	while read -r fam name; do
		[ -n "${fam:-}" ] || continue
		t="$(nft list table "$fam" "$name" 2>/dev/null | grep -m1 -o 'policy [a-z]*' || true)"
		hinweis "fremde Tabelle mit Input-Hook: $fam $name (${t:-ohne policy})"
		if frage "Tabelle $fam $name löschen (alte Firewall)?"; then aendern nft delete table "$fam" "$name"; fi
	done < <(fremde_tabellen)
}

phase_firewall() {
	titel "Firewall (Übergang: SSH noch öffentlich, WireGuard offen)"
	firewall_einspielen uebergang
	[ "$GEAENDERT" = 1 ] || return 0
	bestaetigung_abwarten firewall egal "Prüfe, dass neue SSH-Verbindungen noch gehen."
	rueckweg_aus firewall
}

phase_firewall_final() {
	titel "Firewall endgültig (SSH nur noch im Tunnel)"
	root_passwort_gesetzt || die "zuerst ein root-Passwort für die Hetzner-Konsole setzen: passwd root"
	[ -f /etc/ssh/sshd_config.d/10-klick.conf ] || die "zuerst Phase ssh"
	trocken || tunnel_verbunden || die "kein Admin-Gerät im Tunnel verbunden (Phase wireguard)"
	firewall_einspielen final
	if [ "$GEAENDERT" = 1 ]; then
		bestaetigung_abwarten firewall tunnel "SSH geht jetzt nur noch über ssh <admin>@10.9.0.1."
		rueckweg_aus firewall
	fi
	hinweis "Hetzner Cloud Console > Firewalls: eingehend nur TCP 80, TCP 443, UDP 51820"
	frage "Hetzner-Firewall angeglichen?" || hinweis "bitte nachholen (zweite Schicht vor nftables)"
}

# --- WireGuard -------------------------------------------------------------

wg_server_schluessel() {
	[ -f /etc/wireguard/admin.key ] && return 0
	if trocken; then
		info "(Trockenlauf) würde den Server-Schlüssel erzeugen"
		return 0
	fi
	install -d -m 0700 -o root -g root /etc/wireguard
	(
		umask 077
		wg genkey >/etc/wireguard/admin.key
		wg pubkey </etc/wireguard/admin.key >/etc/wireguard/admin.pub
	)
	ok "Server-Schlüssel erzeugt (/etc/wireguard/admin.pub)"
}

wg_konfiguration() {
	if [ -f "$WG_CONF" ]; then
		grep -q '<' "$WG_CONF" && die "$WG_CONF enthält noch Platzhalter (<…>) aus der Vorlage"
		return 0
	fi
	if trocken; then
		info "(Trockenlauf) würde $WG_CONF anlegen"
		return 0
	fi
	(
		umask 077
		{
			echo "# /etc/wireguard/wg-admin.conf — Admin-Netz (deploy/rollout, Vorlage deploy/wireguard/wg-admin.conf.example)"
			echo "[Interface]"
			echo "Address = 10.9.0.1/24, fd10:9::1/64"
			echo "ListenPort = 51820"
			printf 'PrivateKey = %s\n' "$(cat /etc/wireguard/admin.key)"
		} >"$WG_CONF"
	)
	ok "$WG_CONF angelegt"
}

# Gerät anlegen: Schlüssel nur im Speicher, Konfiguration und QR-Code nur auf
# dem Terminal (nicht im Protokoll), auf dem Server bleibt der öffentliche
# Schlüssel mit PSK.
wg_geraet() {
	local name="$1" endpoint="$2" n priv pub psk cfg
	[[ "$name" =~ ^[a-z0-9][a-z0-9-]{0,30}$ ]] || die "Gerätename nur a–z, 0–9, -: $name"
	if [ -f "$WG_CONF" ] && grep -q "^# Gerät: $name " "$WG_CONF"; then
		ok "Gerät $name gibt es schon"
		return 0
	fi
	n="$(naechste_adresse "$WG_CONF")" || die "Admin-Netz voll"
	if trocken; then
		info "(Trockenlauf) würde Gerät $name mit 10.9.0.$n anlegen"
		return 0
	fi
	priv="$(wg genkey)"
	pub="$(printf '%s' "$priv" | wg pubkey)"
	psk="$(wg genpsk)"
	sichern "$WG_CONF"
	{
		echo
		echo "[Peer]"
		echo "# Gerät: $name (angelegt $(date +%F) von deploy/rollout)"
		echo "PublicKey = $pub"
		echo "PresharedKey = $psk"
		echo "AllowedIPs = 10.9.0.$n/32, fd10:9::$n/128"
	} >>"$WG_CONF"
	cfg="$(printf '[Interface]\nPrivateKey = %s\nAddress = 10.9.0.%s/32, fd10:9::%s/128\nDNS = 10.9.0.1\n\n[Peer]\nPublicKey = %s\nPresharedKey = %s\nEndpoint = %s:51820\nAllowedIPs = 10.9.0.0/24, fd10:9::/64\nPersistentKeepalive = 25\n' \
		"$priv" "$n" "$n" "$(cat /etc/wireguard/admin.pub)" "$psk" "$endpoint")"
	{
		printf '\n  ── WireGuard für „%s“ (nur jetzt sichtbar, nicht gespeichert) ──\n\n' "$name"
		printf '%s\n\n' "$cfg"
		printf '%s' "$cfg" | qrencode -t ansiutf8
		printf '\n  In der WireGuard-App: „Tunnel hinzufügen“ > QR-Code scannen\n'
		printf '  bzw. am Laptop als Datei %s.conf importieren.\n' "$name"
	} >/dev/tty
	unset priv cfg
	weiter "Importiert? Dann Enter (danach wird der Bildschirm geleert)"
	clear >/dev/tty 2>/dev/null || true
	[ -n "${TMUX:-}" ] && tmux clear-history 2>/dev/null || true
	NEUE_PEERS+=("$pub")
	ok "Gerät $name: 10.9.0.$n"
}

phase_wireguard() {
	titel "WireGuard-Admin-Netz (wg-admin)"
	local endpoint="${ENDPOINT:-}" geraet
	pakete wireguard-tools qrencode
	if [ -z "$endpoint" ]; then
		endpoint="$(oeffentliche_ip)"
		case "$endpoint" in
		10.* | 192.168.* | 172.1[6-9].* | 172.2[0-9].* | 172.3[01].* | "") die "öffentliche Adresse unklar ($endpoint): --endpoint <ip> angeben" ;;
		esac
	fi
	info "Endpunkt für die Geräte: $endpoint:51820"
	wg_server_schluessel
	wg_konfiguration
	NEUE_PEERS=()
	[ "${#GERAETE[@]}" -gt 0 ] || {
		grep -q '^\[Peer\]' "$WG_CONF" 2>/dev/null || die "kein Gerät: --geraet <name> angeben (z. B. laptop, handy)"
	}
	for geraet in "${GERAETE[@]}"; do wg_geraet "$geraet" "$endpoint"; done
	if ip link show wg-admin >/dev/null 2>&1; then
		trocken || wg syncconf wg-admin <(wg-quick strip wg-admin)
		ok "wg-admin neu geladen"
	else
		aendern systemctl enable --now wg-quick@wg-admin
	fi
	# Split-DNS im Tunnel: Konfiguration vor dem Paket, damit dnsmasq nie
	# öffentlich lauscht
	einspielen "$DEPLOY/dnsmasq/klick-admin.conf" /etc/dnsmasq.d/klick-admin.conf 0644
	pakete dnsmasq
	aendern systemctl enable dnsmasq
	aendern systemctl restart dnsmasq
	trocken && return 0
	systemctl is-active --quiet dnsmasq || hinweis "dnsmasq läuft nicht: journalctl -u dnsmasq -n 20"
	[ "${#NEUE_PEERS[@]}" -gt 0 ] || tunnel_verbunden || hinweis "noch kein Gerät verbunden"
	[ "${#NEUE_PEERS[@]}" -gt 0 ] || return 0
	info "Schalte den Tunnel auf dem Gerät ein; warte bis zu 10 Minuten auf die Verbindung …"
	local i
	for i in $(seq 1 120); do
		if tunnel_verbunden; then
			ok "Gerät verbunden; Test am Gerät: ping 10.9.0.1, curl -sI https://raza.work/api/health"
			return 0
		fi
		sleep 5
	done
	die "kein Gerät verbunden. Hetzner Cloud Console > Firewalls: UDP 51820 eingehend erlauben, dann Phase wireguard erneut (Geräte bleiben)"
}

# --- SSH -------------------------------------------------------------------

admin_konto() {
	local admin="$1" home
	if ! id "$admin" >/dev/null 2>&1; then
		frage "Admin-Konto „$admin“ anlegen (sudo, Schlüssel von root übernehmen)?" ||
			die "ohne Admin-Konto kein SSH mehr (root darf nicht)"
		aendern adduser --disabled-password --gecos "" "$admin"
		aendern usermod -aG sudo "$admin"
	fi
	id -nG "$admin" 2>/dev/null | tr ' ' '\n' | grep -qx sudo || aendern usermod -aG sudo "$admin"
	home="$(getent passwd "$admin" | cut -d: -f6)"
	[ -n "$home" ] || home="/home/$admin"
	if [ ! -s "$home/.ssh/authorized_keys" ]; then
		[ -s /root/.ssh/authorized_keys ] || die "keine SSH-Schlüssel für $admin und root"
		info "übernehme /root/.ssh/authorized_keys für $admin"
		aendern install -d -m 0700 -o "$admin" -g "$admin" "$home/.ssh"
		aendern install -m 0600 -o "$admin" -g "$admin" /root/.ssh/authorized_keys "$home/.ssh/authorized_keys"
	fi
	if [ "$(passwd -S "$admin" 2>/dev/null | awk '{print $2}')" != P ]; then
		info "$admin braucht ein Passwort für sudo"
		trocken || passwd "$admin" </dev/tty >/dev/tty
	fi
}

sshd_einspielen() {
	local mode="$1" admin="$2" ziel=/etc/ssh/sshd_config.d/10-klick.conf alt tmp
	GEAENDERT=0
	tmp="$(mktemp)"
	render_sshd "$mode" "$admin" >"$tmp" || die "Admin-Name ungültig: $admin"
	if [ -f "$ziel" ] && cmp -s "$tmp" "$ziel"; then
		rm -f "$tmp"
		ok "SSH ($mode) ist schon eingestellt"
		return 0
	fi
	[ -f /etc/ssh/ssh_host_ed25519_key ] || die "Host-Schlüssel Ed25519 fehlt"
	alt="$(gesichert "$ziel")"
	# Ubuntu 24.04 startet sshd über ssh.socket; ohne laufenden Dienst gilt
	# die Datei für jede neue Verbindung, ein Reload ist dann nicht nötig.
	rueckweg ssh "rm -f '$ziel'; [ -f '$alt' ] && cp -a '$alt' '$ziel'; systemctl is-active --quiet ssh && systemctl reload ssh; true"
	schreibe_inhalt "$ziel" 0644 root:root <"$tmp"
	rm -f "$tmp"
	install -d -m 0755 /run/sshd
	if ! trocken && ! sshd -t; then
		rm -f "$ziel"
		[ -f "$alt" ] && cp -a "$alt" "$ziel"
		die "sshd -t meldet einen Fehler; alte Einstellung wiederhergestellt"
	fi
	if systemctl is-active --quiet ssh; then aendern systemctl reload ssh; fi
	info "Host-Schlüssel (beim ersten Verbinden vergleichen): $(ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub 2>/dev/null)"
	bestaetigung_abwarten ssh tunnel "Neue Sitzung über den Tunnel: ssh $admin@10.9.0.1"
	rueckweg_aus ssh
}

phase_ssh() {
	titel "SSH nur im Tunnel (bisherige Schlüssel gelten weiter)"
	[ -n "$ADMIN" ] || die "--admin <name> fehlt (Konto für SSH, root darf nicht)"
	root_passwort_gesetzt || {
		hinweis "Rückweg bei Aussperren ist die Hetzner-Konsole; die braucht ein root-Passwort"
		trocken || passwd root </dev/tty >/dev/tty
	}
	trocken || tunnel_verbunden || die "kein Admin-Gerät im Tunnel verbunden (Phase wireguard)"
	admin_konto "$ADMIN"
	sshd_einspielen tunnel "$ADMIN"
}

phase_ssh_schluessel() {
	titel "SSH nur mit Sicherheitsschlüssel und PIN"
	[ -n "$ADMIN" ] || die "--admin <name> fehlt"
	local home
	home="$(getent passwd "$ADMIN" | cut -d: -f6)"
	grep -qE '(^|[ ,])sk-(ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com ' "$home/.ssh/authorized_keys" 2>/dev/null ||
		die "kein Sicherheitsschlüssel in $home/.ssh/authorized_keys (ssh-keygen -t ed25519-sk -O resident -O verify-required)"
	hinweis "Danach gehen nur noch Schlüssel vom Typ sk-…; zweiten Schlüssel als Ersatz eingetragen?"
	frage "Weiter?" || return 0
	sshd_einspielen schluessel "$ADMIN"
}

# Aus der neuen Sitzung: `sudo rollout.sh bestaetigen <wort>`
phase_bestaetigen() {
	local wort="${1:-}" quelle f erwartet art name treffer=0
	[[ "$wort" =~ ^[0-9a-f]{8}$ ]] || die "Aufruf: rollout.sh bestaetigen <wort>"
	quelle="$(sitzung_quelle)"
	for f in "$STATE_DIR"/erwartet-*; do
		[ -f "$f" ] || continue
		read -r erwartet art <"$f"
		[ "$erwartet" = "$wort" ] || continue
		name="${f##*/erwartet-}"
		if [ "$art" = tunnel ] && ! im_admin_netz "$quelle"; then
			die "diese Sitzung kommt von „${quelle:-unbekannt}“, nicht aus dem Tunnel (10.9.0.0/24)"
		fi
		printf '%s\n' "$wort" >"$STATE_DIR/bestaetigt-$name"
		ok "„$name“ bestätigt (Sitzung von ${quelle:-unbekannt})"
		treffer=1
	done
	[ "$treffer" = 1 ] || die "kein offener Schritt mit diesem Wort"
}
