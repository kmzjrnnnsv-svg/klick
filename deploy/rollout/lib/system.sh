#!/usr/bin/env bash
# System-Phasen: grundlage, system, nginx, crowdsec, postgres, virenscanner,
# ueberwachung. Dateien kommen aus dem root-eigenen Checkout ($DEPLOY).
set -euo pipefail

phase_grundlage() {
	titel "Grundlage (Pakete, Ordner, Swap, Release-Schlüssel)"
	aendern env DEBIAN_FRONTEND=noninteractive apt-get update -q
	pakete wireguard-tools nftables auditd audispd-plugins aide lynis unattended-upgrades \
		needrestart qrencode chrony git curl ca-certificates gnupg
	# klick.service schreibt Logs nach /var/log/klick (ReadWritePaths, sonst
	# startet der Dienst nicht); certbot legt Nachweise in /var/www/letsencrypt
	if id klick >/dev/null 2>&1; then
		[ -d /var/log/klick ] || aendern install -d -m 0750 -o klick -g klick /var/log/klick
	fi
	[ -d /var/www/letsencrypt ] || aendern install -d -m 0755 -o root -g root /var/www/letsencrypt
	aendern install -d -m 0700 -o root -g root "$STATE_DIR"
	ok "Ordner geprüft"

	# Swap für Builds und clamd (nur ohne Swap, bis 16 GB RAM, mit Platz)
	local mem frei
	mem="$(speicher_kb MemTotal)"
	frei="$(df --output=avail -k / | tail -1 | tr -d ' ')"
	if [ -n "$(swapon --show --noheadings 2>/dev/null)" ]; then
		ok "Swap vorhanden ($(swapon --show --noheadings --bytes | awk '{s += $3} END {printf "%.1f GB", s / 1e9}'))"
	elif [ "$mem" -lt 16000000 ] && [ "$frei" -gt 8000000 ]; then
		info "kein Swap: lege 4 GB /swapfile an"
		aendern fallocate -l 4G /swapfile
		aendern chmod 0600 /swapfile
		aendern mkswap /swapfile
		aendern swapon /swapfile
		grep -q '^/swapfile ' /etc/fstab || {
			trocken && info "(Trockenlauf) würde /etc/fstab ergänzen" ||
				{ sichern /etc/fstab && echo '/swapfile none swap sw 0 0' >>/etc/fstab; }
		}
	else
		hinweis "kein Swap und zu wenig Platz oder genug RAM: übersprungen"
	fi

	# Release-Schlüssel: root-eigene Kopie außerhalb jedes Checkouts
	local repo="$DEPLOY/release/allowed_signers" n
	n="$(anker_schluessel "$repo")"
	if [ ! -f "$ANKER" ]; then
		info "Release-Schlüssel im Repo: $n"
		if [ "$n" -gt 0 ]; then
			grep -vE '^[[:space:]]*(#|$)' "$repo" | while read -r who _ typ key _; do
				printf '    %s %s\n' "$who" "$(printf '%s %s\n' "$typ" "$key" | ssh-keygen -lf - 2>/dev/null | awk '{print $2}')"
			done
			frage "Diese Schlüssel als Release-Schlüssel festlegen?" || die "ohne Festlegung keine signierten Releases"
		fi
		aendern install -d -m 0755 -o root -g root "$(dirname "$ANKER")"
		einspielen "$repo" "$ANKER" 0644 root:root
	elif ! cmp -s "$repo" "$ANKER"; then
		hinweis "$ANKER weicht vom Repo ab (das Repo ändert den Anker nie von selbst):"
		diff -u "$ANKER" "$repo" | sed 's/^/    /' || true
		if frage "Repo-Fassung übernehmen?"; then einspielen "$repo" "$ANKER" 0644 root:root; fi
	else
		ok "$ANKER aktuell ($(anker_schluessel "$ANKER") Schlüssel)"
	fi
}

phase_system() {
	titel "Kernel, Updates, Protokoll, Integrität"
	GEAENDERT=0
	einspielen "$DEPLOY/sysctl/99-klick.conf" /etc/sysctl.d/99-klick.conf
	[ "$GEAENDERT" = 1 ] && aendern sysctl --system -q
	einspielen "$DEPLOY/apt/50unattended-upgrades" /etc/apt/apt.conf.d/50unattended-upgrades
	einspielen "$DEPLOY/apt/20auto-upgrades" /etc/apt/apt.conf.d/20auto-upgrades
	einspielen "$DEPLOY/apt/needrestart-klick.conf" /etc/needrestart/conf.d/klick.conf
	GEAENDERT=0
	einspielen "$DEPLOY/audit/klick.rules" /etc/audit/rules.d/klick.rules 0640
	if [ "$GEAENDERT" = 1 ]; then
		if auditctl -s 2>/dev/null | grep -q 'enabled 2'; then
			hinweis "auditd ist gesperrt (enabled 2): die neuen Regeln gelten nach dem nächsten Neustart"
		else
			aendern augenrules --load
		fi
	fi
	auditctl -s 2>/dev/null | grep -q 'enabled 2' && ok "auditd gesperrt (enabled 2)" ||
		hinweis "auditd noch nicht gesperrt (nach Neustart prüfen: auditctl -s)"
	if aa-status --enabled 2>/dev/null; then ok "AppArmor aktiv"; else hinweis "AppArmor nicht aktiv (aa-status)"; fi
	# AIDE: Regeln und Units jetzt, die Basis erst in `abschluss` (nach allen
	# Installationen, sonst meldet der erste Lauf jede neue Datei)
	einspielen "$DEPLOY/aide/99_aide_klick" /etc/aide/aide.conf.d/99_aide_klick
	einspielen "$DEPLOY/systemd/klick-aide.service" /etc/systemd/system/klick-aide.service
	einspielen "$DEPLOY/systemd/klick-aide.timer" /etc/systemd/system/klick-aide.timer
	aendern systemctl daemon-reload
}

phase_nginx() {
	titel "nginx (Admin-Netz, Standard-Server, vHosts)"
	command -v nginx >/dev/null || die "nginx fehlt"
	local f andere pub neu_link=0
	einspielen "$DEPLOY/nginx/snippets/klick-admin-net.conf" /etc/nginx/snippets/klick-admin-net.conf
	einspielen "$DEPLOY/logrotate/nginx" /etc/logrotate.d/nginx
	andere="$(grep -rlE 'default_server' /etc/nginx/sites-enabled/ 2>/dev/null | grep -v '00-default' || true)"
	if [ -n "$andere" ]; then
		hinweis "default_server steht schon in: $andere — 00-default.conf übersprungen"
	else
		einspielen "$DEPLOY/nginx/00-default.conf" /etc/nginx/sites-available/00-default.conf
		if [ ! -e /etc/nginx/sites-enabled/00-default.conf ]; then
			aendern ln -s /etc/nginx/sites-available/00-default.conf /etc/nginx/sites-enabled/00-default.conf
			neu_link=1
		fi
		# Ubuntu-Standardseite trägt default_server und sperrt sonst den Start
		if [ -L /etc/nginx/sites-enabled/default ] || [ -e /etc/nginx/sites-enabled/default ]; then
			sichern /etc/nginx/sites-enabled/default
			aendern rm /etc/nginx/sites-enabled/default
		fi
	fi
	# vHosts nur aktualisieren, nie neu anlegen (ohne Zertifikat bräche nginx -t)
	for f in raza.work.conf both.money.conf approve.both.money.conf; do
		if [ ! -f "/etc/nginx/sites-available/$f" ]; then
			hinweis "$f nicht installiert: übersprungen (Zertifikat zuerst, Runbook)"
			continue
		fi
		if cmp -s "$DEPLOY/nginx/$f" "/etc/nginx/sites-available/$f"; then
			ok "$f aktuell"
			continue
		fi
		diff -u "/etc/nginx/sites-available/$f" "$DEPLOY/nginx/$f" | sed -n '1,80p' | sed 's/^/    /' || true
		if frage "$f aus dem Repo übernehmen?"; then einspielen "$DEPLOY/nginx/$f" "/etc/nginx/sites-available/$f"; fi
	done
	trocken && return 0
	if ! nginx -t 2>/dev/null; then
		nginx -t || true
		hinweis "nginx -t schlägt fehl: Dateien aus $SICHERUNG zurück"
		[ "$neu_link" = 0 ] || rm -f /etc/nginx/sites-enabled/00-default.conf
		if [ -d "$SICHERUNG/etc/nginx" ]; then cp -a "$SICHERUNG/etc/nginx/." /etc/nginx/; fi
		nginx -t && die "zurückgesetzt; Ursache prüfen (meist Zertifikatspfade im vHost)"
		die "nginx -t schlägt auch zurückgesetzt fehl: von Hand prüfen"
	fi
	aendern systemctl reload nginx
	pub="$(oeffentliche_ip)"
	local c
	c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve "raza.work:443:$pub" https://raza.work/admin || true)"
	[ "$c" = 403 ] && ok "/admin von außen: 403" || hinweis "/admin von außen: $c (erwartet 403)"
	if ip link show wg-admin >/dev/null 2>&1; then
		c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve raza.work:443:10.9.0.1 https://raza.work/admin || true)"
		[ "$c" != 403 ] && ok "/admin über den Tunnel: $c" || hinweis "/admin über den Tunnel: 403"
	fi
	c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -H 'Host: x.example' "http://$pub/" || true)"
	[ "$c" = 000 ] && ok "unbekannter Host: keine Antwort" || hinweis "unbekannter Host: $c (erwartet keine Antwort)"
}

# Wert in einer KEY=WERT-Datei setzen; der Wert kommt über die Umgebung
# (nie in argv, z. B. der Bouncer-Schlüssel).
setze_kv() {
	local file="$1" key="$2" tmp
	tmp="$(mktemp)"
	awk -v k="$key" '
		BEGIN { v = ENVIRON["KV_WERT"] }
		index($0, k "=") == 1 { print k "=" v; done = 1; next }
		{ print }
		END { if (!done) print k "=" v }
	' "$file" >"$tmp"
	cat "$tmp" >"$file"
	rm -f "$tmp"
}

phase_crowdsec() {
	titel "CrowdSec mit WAF"
	local keyring=/etc/apt/keyrings/crowdsec_crowdsec-archive-keyring.gpg tmp fpr c codename
	codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
	if [ ! -f "$keyring" ]; then
		# Paketquelle von Hand (nie install.crowdsec.net | sh); den
		# Fingerprint beim ersten Mal vergleichen (docs.crowdsec.net)
		tmp="$(mktemp -d)"
		curl -fsSL --max-time 30 https://packagecloud.io/crowdsec/crowdsec/gpgkey -o "$tmp/key.asc" ||
			die "Schlüssel der CrowdSec-Paketquelle nicht ladbar"
		fpr="$(gpg --show-keys --with-colons "$tmp/key.asc" 2>/dev/null | awk -F: '/^fpr/ { print $10; exit }')"
		[ -n "$fpr" ] || die "Schlüssel der Paketquelle unlesbar"
		if [ -n "${CROWDSEC_KEY_FPR:-}" ]; then
			[ "$fpr" = "$CROWDSEC_KEY_FPR" ] || die "Fingerprint $fpr ≠ CROWDSEC_KEY_FPR"
		else
			info "Fingerprint der Paketquelle: $fpr"
			frage "Stimmt er mit docs.crowdsec.net überein?" || die "abgebrochen"
		fi
		aendern install -d -m 0755 /etc/apt/keyrings
		trocken || gpg --dearmor <"$tmp/key.asc" >"$keyring"
		rm -rf "$tmp"
		printf 'deb [signed-by=%s] https://packagecloud.io/crowdsec/crowdsec/ubuntu/ %s main\n' "$keyring" "$codename" |
			schreibe_inhalt /etc/apt/sources.list.d/crowdsec_crowdsec.list
		aendern apt-get update -q
	fi
	pakete crowdsec crowdsec-firewall-bouncer-nftables crowdsec-nginx-bouncer
	trocken && { info "(Trockenlauf) Collections, Regeln, Bouncer"; return 0; }
	cscli hub update >/dev/null
	cscli collections install crowdsecurity/nginx crowdsecurity/base-http-scenarios crowdsecurity/http-cve \
		crowdsecurity/linux crowdsecurity/sshd crowdsecurity/appsec-virtual-patching crowdsecurity/appsec-generic-rules >/dev/null
	ok "Collections installiert"
	for f in "$DEPLOY"/crowdsec/acquis.d/*.yaml; do einspielen "$f" "/etc/crowdsec/acquis.d/${f##*/}"; done
	einspielen "$DEPLOY/crowdsec/scenarios/klick-auth-bf.yaml" /etc/crowdsec/scenarios/klick-auth-bf.yaml
	einspielen "$DEPLOY/crowdsec/parsers/s02-enrich/klick-whitelist.yaml" /etc/crowdsec/parsers/s02-enrich/klick-whitelist.yaml
	local conf=/etc/crowdsec/bouncers/crowdsec-nginx-bouncer.conf key line
	[ -f "$conf" ] || die "$conf fehlt (Paket crowdsec-nginx-bouncer)"
	sichern "$conf"
	if ! grep -qE '^API_KEY=[A-Za-z0-9+/=_-]{16,}$' "$conf"; then
		cscli bouncers delete klick-nginx >/dev/null 2>&1 || true
		KV_WERT="$(cscli bouncers add klick-nginx -o raw)" setze_kv "$conf" API_KEY
		ok "Bouncer-Schlüssel angelegt (klick-nginx)"
	fi
	# übrige Werte aus der Vorlage (ohne API_KEY)
	while IFS= read -r line; do
		key="${line%%=*}"
		[ "$key" = API_KEY ] && continue
		KV_WERT="${line#*=}" setze_kv "$conf" "$key"
	done < <(grep -E '^[A-Z_]+=' "$DEPLOY/crowdsec/bouncers/crowdsec-nginx-bouncer.conf.example")
	systemctl restart crowdsec
	nginx -t >/dev/null 2>&1 || die "nginx -t nach dem Bouncer fehlerhaft (alte Datei: $(gesichert "$conf"))"
	systemctl reload nginx
	ok "CrowdSec und Bouncer neu geladen"
	sleep 5
	c="$(curl -s -g -o /dev/null -w '%{http_code}' --max-time 10 --resolve "raza.work:443:$(oeffentliche_ip)" \
		'https://raza.work/?x=%3Cscript%3Ealert(1)%3C/script%3E' || true)"
	[ "$c" = 403 ] && ok "WAF-Probe: 403" || hinweis "WAF-Probe: $c (erwartet 403; cscli metrics prüfen)"
	cscli decisions add --ip 198.51.100.7 --duration 5m --reason rollout-probe >/dev/null
	sleep 12
	if nft list ruleset 2>/dev/null | grep -q 198.51.100.7; then ok "Bann-Probe: Firewall-Bouncer sperrt"; else hinweis "Bann-Probe: Adresse nicht in nftables"; fi
	cscli decisions delete --ip 198.51.100.7 >/dev/null || true
	hinweis "Community-Signale teilt CrowdSec nur, wenn die Datenschutzerklärung es nennt (sonst: cscli capi unregister)"
}

# Postgres: SCRAM, nur localhost, Anmelde-Regeln (Runbook Schritt 7).
pg_sql() { runuser -u postgres -- psql -v ON_ERROR_STOP=1 -qAt -d postgres "$@"; }

phase_postgres() {
	titel "Postgres (SCRAM, nur localhost, pg_hba)"
	local ver dir rolle cname hash fehlt=0 user neu_conf=0
	ver="$(ls /etc/postgresql 2>/dev/null | sort -n | tail -1)"
	[ -n "$ver" ] || die "kein Postgres unter /etc/postgresql"
	dir="/etc/postgresql/$ver/main"
	grep -qE "^include_dir[[:space:]]*=[[:space:]]*'conf.d'" "$dir/postgresql.conf" ||
		die "$dir/postgresql.conf bindet conf.d nicht ein"
	# Rollen der Apps (aus den Credentials) müssen in der Vorlage stehen
	for cname in database_url database_url_migrate database_url_backup wallet_database_url \
		wallet_database_url_migrate wallet_database_url_backup; do
		[ -f "$CREDSTORE/$cname" ] || continue
		user="$(URL="$(cred "$cname")" python3 -I -c 'import os,urllib.parse as u; print(u.urlsplit(os.environ["URL"]).username or "")')"
		grep -qE "[ ,]$user[ ,]" "$DEPLOY/postgres/pg_hba.conf.example" ||
			die "Rolle $user (aus $cname) fehlt in deploy/postgres/pg_hba.conf.example"
	done
	GEAENDERT=0
	[ -f "$dir/conf.d/klick.conf" ] || neu_conf=1
	einspielen "$DEPLOY/postgres/klick.conf" "$dir/conf.d/klick.conf" 0644 postgres:postgres
	# Passwörter als SCRAM neu setzen — dasselbe Passwort aus dem Credential,
	# SQL über stdin (nie argv), ohne Protokoll der Anweisung
	for pair in klick_app:database_url klick_migrator:database_url_migrate klick_backup:database_url_backup \
		wallet_app:wallet_database_url wallet_migrator:wallet_database_url_migrate wallet_backup:wallet_database_url_backup; do
		rolle="${pair%%:*}"
		cname="${pair#*:}"
		hash="$(pg_sql -c "select coalesce(left(rolpassword, 13), '-') from pg_authid where rolname = '$rolle'")"
		[ -n "$hash" ] || continue
		if [ "$hash" = SCRAM-SHA-256 ]; then
			ok "$rolle: SCRAM"
			continue
		fi
		if [ ! -f "$CREDSTORE/$cname" ]; then
			hinweis "$rolle: kein SCRAM und kein Credential $cname: Passwort von Hand neu setzen (\\password $rolle)"
			fehlt=1
			continue
		fi
		if trocken; then
			info "(Trockenlauf) würde das Passwort von $rolle als SCRAM neu setzen"
			continue
		fi
		URL="$(cred "$cname")" ROLLE="$rolle" python3 -I -c '
import os, urllib.parse as u
pw = u.unquote(u.urlsplit(os.environ["URL"]).password or "")
if not pw: raise SystemExit("kein Passwort im Credential")
q = lambda s: "\x27" + s.replace("\x27", "\x27\x27") + "\x27"
print("SET log_statement = \x27none\x27;")
print("SET password_encryption = \x27scram-sha-256\x27;")
print("ALTER ROLE \"%s\" PASSWORD %s;" % (os.environ["ROLLE"], q(pw)))
' | pg_sql -f -
		ok "$rolle: Passwort als SCRAM neu gesetzt (Credential unverändert)"
	done
	[ "$fehlt" = 0 ] || die "erst die Rollen ohne SCRAM von Hand setzen, dann Phase postgres erneut"
	einspielen "$DEPLOY/postgres/pg_hba.conf.example" "$dir/pg_hba.conf" 0640 postgres:postgres
	[ "$GEAENDERT" = 1 ] || { ok "Postgres unverändert"; return 0; }
	trocken && return 0
	systemctl restart postgresql
	local u
	for u in klick both; do systemctl is-active --quiet "$u" && systemctl restart "$u"; done
	if ! warte_bereit http://127.0.0.1:3000/api/ready 120 ||
		{ systemctl is-enabled --quiet both 2>/dev/null && ! warte_bereit http://127.0.0.1:3010/api/ready 120; }; then
		hinweis "Apps erreichen die Datenbank nicht: alte Einstellungen zurück"
		if [ -d "$SICHERUNG$dir" ]; then cp -a "$SICHERUNG$dir/." "$dir/"; fi
		[ "$neu_conf" = 0 ] || rm -f "$dir/conf.d/klick.conf"
		systemctl restart postgresql
		for u in klick both; do systemctl is-active --quiet "$u" && systemctl restart "$u"; done
		die "Postgres zurückgesetzt; journalctl -u klick -n 40 prüfen"
	fi
	ss -tlnH 'sport = :5432' | awk '{print $4}' | grep -vqE '^(127\.0\.0\.1|\[::1\]):5432$' &&
		hinweis "Postgres lauscht nicht nur auf localhost" || ok "Postgres nur auf localhost"
}

phase_virenscanner() {
	titel "Virenscanner (nach Arbeitsspeicher)"
	local mem wahl risks env=/etc/klick/klick.env i
	mem="$(speicher_kb MemTotal)"
	wahl="$(virenscanner_entscheidung "$mem")"
	risks="$(env_wert "$env" PROD_ACCEPT_RISKS)"
	info "Arbeitsspeicher: $((mem / 1024)) MB → $wahl"
	if [ "$wahl" = no_av ]; then
		hinweis "zu wenig Arbeitsspeicher für clamd (ab 8 GB, z. B. Hetzner CX32/CPX31): Risiko no_av wird hingenommen"
		env_block_render "$env" "PROD_ACCEPT_RISKS=$(risks_merge "$risks" add no_av)" "CLAMD_HOST=" |
			schreibe_inhalt "$env" 0600 root:root geheim
		return 0
	fi
	pakete clamav-daemon clamav-freshclam clamdscan
	local conf=/etc/clamav/clamd.conf
	trocken || [ -f "$conf" ] || die "$conf fehlt"
	if ! trocken; then
		sichern "$conf"
		local kv
		for kv in "TCPSocket 3310" "TCPAddr 127.0.0.1" "StreamMaxLength 30M" "ConcurrentDatabaseReload no"; do
			KV_WERT="${kv#* }" awk -v k="${kv%% *}" '
				BEGIN { v = ENVIRON["KV_WERT"] }
				$1 == k { print k " " v; done = 1; next }
				{ print }
				END { if (!done) print k " " v }
			' "$conf" >"$conf.neu" && cat "$conf.neu" >"$conf" && rm -f "$conf.neu"
		done
		ok "clamd.conf: nur 127.0.0.1:3310, 30 MB, Signaturen ohne doppelten Speicher"
	fi
	einspielen "$DEPLOY/systemd/clamav-daemon.service.d/klick.conf" /etc/systemd/system/clamav-daemon.service.d/klick.conf
	aendern systemctl daemon-reload
	aendern systemctl enable --now clamav-freshclam
	if ! trocken; then
		info "warte auf die Signaturen (erster Abruf bis zu 10 Minuten) …"
		for i in $(seq 1 120); do
			ls /var/lib/clamav/main.c?d /var/lib/clamav/daily.c?d >/dev/null 2>&1 && break
			sleep 5
		done
		ls /var/lib/clamav/main.c?d >/dev/null 2>&1 || die "keine Signaturen: journalctl -u clamav-freshclam"
	fi
	aendern systemctl enable clamav-daemon
	aendern systemctl restart clamav-daemon
	if ! trocken; then
		for i in $(seq 1 60); do
			ss -tlnH 'sport = :3310' | grep -q 127.0.0.1 && break
			sleep 3
		done
		# EICAR-Testmuster in zwei Teilen, damit diese Datei selbst keinen Treffer auslöst
		local e1='X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR' e2='-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' out
		out="$(printf '%s%s' "$e1" "$e2" | clamdscan --no-summary - 2>&1 || true)"
		grep -q FOUND <<<"$out" && ok "EICAR-Probe erkannt" || die "clamd erkennt die EICAR-Probe nicht: $out"
	fi
	env_block_render "$env" "PROD_ACCEPT_RISKS=$(risks_merge "$risks" remove no_av)" "CLAMD_HOST=127.0.0.1" |
		schreibe_inhalt "$env" 0600 root:root geheim
}

phase_ueberwachung() {
	titel "Zustand überwachen (klick-health)"
	einspielen "$ROOT_DIR/scripts/host-health.sh" /usr/local/lib/klick-health/host-health.sh 0755
	local u
	for u in klick-health.service klick-health.timer klick-alert@.service; do
		einspielen "$DEPLOY/systemd/$u" "/etc/systemd/system/$u"
	done
	aendern systemctl daemon-reload
	aendern systemctl enable --now klick-health.timer
	trocken && return 0
	if systemctl start klick-health.service; then ok "klick-health ohne Befund"; else
		hinweis "klick-health meldet Abweichungen:"
		journalctl -u klick-health -n 20 --no-pager | sed 's/^/    /'
	fi
	[ -n "$(env_wert /etc/klick/backup.env ALERT_MAIL)" ] || hinweis "ALERT_MAIL fehlt in /etc/klick/backup.env: Alarme nur im Journal"
}
