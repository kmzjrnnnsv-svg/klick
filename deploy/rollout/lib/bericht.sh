#!/usr/bin/env bash
# pruefen (nur lesen, Stand jeder Phase) und abschluss (AIDE-Basis, Lynis,
# Bericht als Nachweis für CC-OPS-04 / ISO A.8.9).
set -euo pipefail

stand() { printf '  %-16s %s\n' "$1" "$2"; }
gleich() { [ -f "$2" ] && cmp -s "$1" "$2"; }

phase_pruefen() {
	titel "Prüfen (ändert nichts)"
	local mem swap rel
	rel="$(. /etc/os-release && echo "$PRETTY_NAME")"
	info "System: $rel, $(systemctl --version | head -1)"
	mem="$(speicher_kb MemTotal)"
	swap="$(speicher_kb SwapTotal)"
	info "RAM: $((mem / 1024)) MB, Swap: $((swap / 1024)) MB, frei auf /: $(df -h --output=avail / | tail -1 | tr -d ' ')"
	info "Virenscanner nach RAM: $(virenscanner_entscheidung "$mem") (clamd ab ≈ 7,5 GiB)"
	if [ -n "${TMUX:-}${STY:-}" ]; then ok "läuft in tmux/screen"; else hinweis "nicht in tmux: bei Verbindungsabbruch endet das Skript (sudo tmux new -s rollout)"; fi
	if root_passwort_gesetzt; then ok "root-Passwort gesetzt (Hetzner-Konsole)"; else hinweis "root-Passwort fehlt: Rückweg über die Hetzner-Konsole braucht es (passwd root)"; fi
	info "Öffentlich lauschend:"
	ss -tulnH 2>/dev/null | awk '{print $1, $5}' | grep -vE ' (127\.|\[::1\]|10\.9\.0\.1|\[fd10:9::1\])' | sort -u | sed 's/^/    /' || true

	printf '\n  Stand der Phasen:\n'
	local fw="offen"
	if [ -f /etc/nftables.conf ]; then
		if render_firewall final | cmp -s - /etc/nftables.conf; then fw="erledigt (endgültig)"
		elif render_firewall uebergang | cmp -s - /etc/nftables.conf; then fw="Übergang (SSH noch öffentlich)"; fi
	fi
	stand grundlage "$([ -d /var/log/klick ] && [ -f "$ANKER" ] && echo erledigt || echo offen)"
	stand firewall "$fw"
	stand wireguard "$(systemctl is-active --quiet wg-quick@wg-admin 2>/dev/null && echo "aktiv, $(grep -c '^\[Peer\]' "$WG_CONF" 2>/dev/null || echo 0) Gerät(e), $(tunnel_verbunden && echo verbunden || echo 'keins verbunden')" || echo offen)"
	local ssh=offen
	if [ -f /etc/ssh/sshd_config.d/10-klick.conf ]; then
		grep -q '^PubkeyAcceptedAlgorithms sk-' /etc/ssh/sshd_config.d/10-klick.conf && ssh="nur Sicherheitsschlüssel" || ssh="nur Tunnel"
	fi
	stand ssh "$ssh"
	stand system "$(gleich "$DEPLOY/sysctl/99-klick.conf" /etc/sysctl.d/99-klick.conf && echo erledigt || echo offen)"
	stand nginx "$(gleich "$DEPLOY/nginx/snippets/klick-admin-net.conf" /etc/nginx/snippets/klick-admin-net.conf && echo erledigt || echo offen)"
	stand crowdsec "$(systemctl is-active --quiet crowdsec 2>/dev/null && echo aktiv || echo offen)"
	local pgv
	pgv="$(ls /etc/postgresql 2>/dev/null | sort -n | tail -1)"
	stand postgres "$([ -n "$pgv" ] && gleich "$DEPLOY/postgres/klick.conf" "/etc/postgresql/$pgv/main/conf.d/klick.conf" && echo erledigt || echo offen)"
	local av="offen"
	systemctl is-active --quiet clamav-daemon 2>/dev/null && av="clamd aktiv"
	case ",$(env_wert /etc/klick/klick.env PROD_ACCEPT_RISKS)," in *,no_av,*) av="Risiko no_av hingenommen" ;; esac
	stand virenscanner "$av"
	local d u dir port
	for d in klick:"$KLICK_DIR":3000 both:"$BOTH_DIR":3010; do
		IFS=: read -r u dir port <<<"$d"
		if [ -d "$dir/.git" ]; then
			stand "$u" "$(runuser -u "$u" -- git -C "$dir" describe --tags --always 2>/dev/null || echo ?), $(curl -fsS --max-time 3 -o /dev/null "http://127.0.0.1:$port/api/ready" 2>/dev/null && echo bereit || echo 'nicht bereit')"
		else
			stand "$u" "nicht installiert"
		fi
	done
	stand signer "$([ -f /usr/local/lib/klick-signer/signer.mjs.sha256 ] && cut -c1-12 /usr/local/lib/klick-signer/signer.mjs.sha256 || echo 'nicht installiert')"
	stand ueberwachung "$(systemctl is-active --quiet klick-health.timer 2>/dev/null && echo aktiv || echo offen)"
	stand abschluss "$([ -f /var/lib/aide/aide.db ] && echo 'AIDE-Basis vorhanden' || echo offen)"
	stand release-anker "$(anker_schluessel "$ANKER") Schlüssel in $ANKER"
}

phase_abschluss() {
	titel "Abschluss: AIDE-Basis, Lynis, Bericht"
	local bericht="$SICHERUNG/bericht.md"
	if command -v aide >/dev/null; then
		if [ ! -f /var/lib/aide/aide.db ]; then
			info "AIDE-Basis anlegen (einige Minuten) …"
			aendern nice -n 10 aideinit -y -f
			aendern cp /var/lib/aide/aide.db.new /var/lib/aide/aide.db
		elif frage "AIDE-Basis neu schreiben (nur wenn alle Änderungen dieses Laufs gewollt sind)?"; then
			aendern nice -n 10 aide --config /etc/aide/aide.conf --update || true
			aendern cp /var/lib/aide/aide.db.new /var/lib/aide/aide.db
		fi
		aendern systemctl enable --now klick-aide.timer
	fi
	trocken && return 0
	install -d -m 0700 -o root -g root "$SICHERUNG"
	info "Lynis (einige Minuten) …"
	lynis audit system --quick --no-colors >"$SICHERUNG/lynis.txt" 2>&1 || true
	{
		printf '# Server-Rollout %s auf %s\n\n' "$RUN_ID" "$(hostname)"
		printf 'Erzeugt von deploy/rollout (Stand %s). Als Nachweis in Klick hochladen (CC-OPS-04).\n\n' \
			"$(git -C "$ROOT_DIR" describe --tags --always 2>/dev/null || echo ?)"
		abschnitt "Stand der Phasen" phase_pruefen
		abschnitt "Firewall (nft list ruleset)" nft list ruleset
		abschnitt "Lauschende Dienste (ss -tulpn)" ss -tulpn
		abschnitt "SSH (sshd -T, Auszug)" sh -c "sshd -T 2>/dev/null | grep -Ei '^(permitrootlogin|passwordauthentication|pubkeyacceptedalgorithms|pubkeyauthoptions|allowusers|authenticationmethods|kexalgorithms)'"
		abschnitt "WireGuard (nur öffentliche Schlüssel)" wg show wg-admin
		abschnitt "Sandbox der Dienste (systemd-analyze security)" sh -c 'for u in klick both klick-signer; do systemctl cat $u >/dev/null 2>&1 && systemd-analyze security --no-pager $u 2>/dev/null | tail -1 | sed "s/^/$u: /"; done; true'
		abschnitt "CrowdSec" sh -c 'cscli bouncers list 2>/dev/null; cscli metrics show appsec 2>/dev/null | head -20; true'
		abschnitt "Start-Prüfung Klick" sh -c "journalctl -u klick --since '-1day' --no-pager 2>/dev/null | grep -iE 'start-prüfung|prod_accept' | tail -5; grep -h '^PROD_ACCEPT_RISKS=' /etc/klick/klick.env 2>/dev/null | tail -1; true"
		abschnitt "OpenTimestamps-Kalender (https)" ots_erreichbar
		abschnitt "Verlauf: letzte Anker" runuser -u postgres -- psql -d klick -Atc \
			"select created_at, reason, status, bitcoin_height, coalesce(error, '') from ledger_anchors order by created_at desc limit 5"
		abschnitt "SAML-Anbieter ohne eigene Entity-ID (neu registrieren)" runuser -u postgres -- psql -d klick -Atc \
			"select provider_id, organization_id from sso_provider where saml_config is not null and (saml_config::jsonb -> 'spMetadata' ->> 'entityID') is null"
		abschnitt "Signer" sh -c 'command -v klick-signer-admin >/dev/null && klick-signer-admin status 2>&1 | head -40; true'
		abschnitt "Lynis" sh -c "grep -E 'Hardening index|Tests performed' '$SICHERUNG/lynis.txt'; true"
	} >"$bericht" 2>&1
	chmod 0600 "$bericht"
	ok "Bericht: $bericht (Lynis vollständig: $SICHERUNG/lynis.txt)"
	grep -E 'Hardening index' "$SICHERUNG/lynis.txt" | sed 's/^/    /' || true
	local saml
	saml="$(runuser -u postgres -- psql -d klick -Atc "select count(*) from sso_provider where saml_config is not null and (saml_config::jsonb -> 'spMetadata' ->> 'entityID') is null" 2>/dev/null || echo 0)"
	[ "${saml:-0}" = 0 ] || hinweis "$saml SAML-Anbieter vor A7 angelegt: in Einstellungen > SSO neu registrieren (eigene Entity-ID)"
}

abschnitt() {
	local t="$1"
	shift
	printf '\n## %s\n\n```\n' "$t"
	"$@" 2>&1 || true
	printf '```\n'
}

ots_erreichbar() {
	local h c
	for h in a.pool.opentimestamps.org b.pool.opentimestamps.org a.pool.eternitywall.com \
		alice.btc.calendar.opentimestamps.org bob.btc.calendar.opentimestamps.org \
		finney.calendar.eternitywall.com btc.calendar.catallaxy.com; do
		c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$h/" || true)"
		printf '%-42s %s\n' "$h" "$([ "${c:-000}" = 000 ] && echo 'nicht erreichbar' || echo "erreichbar (HTTP $c)")"
	done
}
