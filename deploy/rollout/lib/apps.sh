#!/usr/bin/env bash
# App-Phasen: klick, both, signer. Git und Build laufen als Dienst-User
# (klick bzw. both) in dessen Checkout; root kopiert nur Units und Bündel
# hinein — Skripte für root kommen aus dem root-eigenen Checkout ($ROOT_DIR).
set -euo pipefail

# Dienste, die platz_fuer_build für den Build angehalten hat
ANGEHALTEN=()

# Checkout eines App-Ordners auf --ref bringen (als Dienst-User).
#   app_checkout <user> <ordner>
app_checkout() {
	local user="$1" dir="$2" ref="${REF:-main}" schluessel
	g() { runuser -u "$user" -- git -C "$dir" "$@"; }
	[ -d "$dir/.git" ] || die "$dir ist kein Git-Checkout"
	[ -z "$(g status --porcelain)" ] || die "$dir hat geänderte Dateien (git status); der Release-Wächter bricht sonst ab"
	schluessel="$(anker_schluessel "$ANKER")"
	aendern runuser -u "$user" -- git -C "$dir" fetch --quiet --tags origin
	if g rev-parse -q --verify "refs/tags/$ref" >/dev/null 2>&1; then
		# Signatur gegen den root-eigenen Anker; gpg.ssh.program fest, damit
		# keine Einstellung aus dem Checkout ein Programm unterschiebt
		if [ "$schluessel" -gt 0 ]; then
			g -c gpg.format=ssh -c gpg.ssh.program=ssh-keygen -c "gpg.ssh.allowedSignersFile=$ANKER" \
				verify-tag "$ref" >/dev/null 2>&1 || die "Tag $ref ist nicht gültig signiert ($ANKER)"
			ok "Tag $ref signiert"
		fi
		aendern runuser -u "$user" -- git -C "$dir" checkout --quiet --detach "refs/tags/$ref"
	else
		[ "$schluessel" -eq 0 ] || die "$ANKER enthält Schlüssel: nur signierte Tags (--ref <tag>)"
		aendern runuser -u "$user" -- git -C "$dir" checkout --quiet "$ref"
		aendern runuser -u "$user" -- git -C "$dir" pull --quiet --ff-only origin "$ref"
	fi
	ok "$dir auf $(g describe --tags --always 2>/dev/null || g rev-parse --short HEAD)"
	local eigen
	eigen="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || true)"
	[ "$eigen" = "$(g rev-parse HEAD)" ] ||
		hinweis "das Rollout-Skript steht auf einem anderen Stand als $dir (Dateien aus deploy/ passen evtl. nicht)"
}

# Vor dem Build: unter 3 GB frei → erst both, dann (nach Rückfrage) die App
# selbst anhalten, statt den Kernel Prozesse beenden zu lassen.
platz_fuer_build() {
	local app="$1"
	ANGEHALTEN=()
	[ "$(speicher_kb MemAvailable)" -ge 3000000 ] && return 0
	if [ "$app" != both ] && systemctl is-active --quiet both; then
		hinweis "wenig freier Speicher: both.money hält für den Build an"
		aendern systemctl stop both
		ANGEHALTEN+=(both)
	fi
	if [ "$(speicher_kb MemAvailable)" -lt 3000000 ] && systemctl is-active --quiet "$app"; then
		if frage "Immer noch unter 3 GB frei: $app während des Builds anhalten (kurze Auszeit)?"; then
			aendern systemctl stop "$app"
			ANGEHALTEN+=("$app")
		fi
	fi
	return 0
}

# Nach einem gescheiterten Build: gesicherten Stand zurück, Dienste wieder
# an, dann Abbruch. Die Migrationen sind dann schon eingespielt; sie sind
# additiv, der alte Stand läuft damit.
#   build_gescheitert <unit> <.next> <sicherung> <ready-url>
build_gescheitert() {
	local unit="$1" next="$2" alt="$3" url="$4" u
	hinweis "Build fehlgeschlagen: der alte Build-Stand kommt zurück"
	if build_zurueck "$next" "$alt"; then
		systemctl restart "$unit" || true
		for u in "${ANGEHALTEN[@]}"; do
			[ "$u" = "$unit" ] || systemctl start "$u" || true
		done
		if warte_bereit "$url" 180; then
			ok "$unit läuft wieder mit dem alten Stand"
		else
			hinweis "$unit startet nicht: journalctl -u $unit"
		fi
	fi
	die "Build fehlgeschlagen (Ausgabe oben). Migrationen sind eingespielt (additiv); Backup von eben und Runbook „Rollback“, falls nötig"
}

# Release-Artefakt aus CI (ADR-034): der Server baut nicht mehr selbst,
# sondern holt das fertige .next des grünen CI-Laufs für genau diesen Commit.
# deploy/rollout/artefakt.mjs liest den Token aus $GITHUB_TOKEN_DATEI selbst
# (nie argv) und prüft Lauf, Digest, Commit, Lockfile, Node und Manifest.
#   artefakt_holen <app> <ordner> <ziel>
# 0 = geprüft und nach <ziel> ausgepackt; 1 = auf dem Server bauen (nach
# Rückfrage); bricht ab bei roter oder laufender CI und bei jeder Abweichung.
artefakt_holen() {
	local app="$1" dir="$2" ziel="${3:?Ziel fehlt}" commit repo origin rc=0
	if [ "$BAUEN" = 1 ]; then
		info "--bauen: $app wird auf dem Server gebaut"
		return 1
	fi
	if [ ! -s "$GITHUB_TOKEN_DATEI" ]; then
		hinweis "kein GitHub-Token in $GITHUB_TOKEN_DATEI (Runbook „Release“): Artefakt aus CI nicht abrufbar"
		frage "$app auf dem Server bauen (braucht 1,5–3 GB RAM)?" && return 1
		die "abgebrochen"
	fi
	commit="$(runuser -u "$app" -- git -C "$dir" rev-parse HEAD 2>/dev/null || true)"
	[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || die "Commit von $dir nicht lesbar"
	repo="$(release_repo "$(runuser -u "$app" -- git -C "$dir" remote get-url origin 2>/dev/null || true)")"
	[ -n "$repo" ] || die "GitHub-Repo aus origin von $dir nicht erkannt"
	origin="$(
		app_env "$app"
		if [ "$app" = both ]; then printf '%s' "${WALLET_AUTH_URL:-}"; else printf '%s' "${BETTER_AUTH_URL:-}"; fi
	)"
	if trocken; then
		info "(Trockenlauf) würde Artefakt $app-${commit:0:7} aus CI ($repo) holen und prüfen"
		return 0
	fi
	rm -rf -- "${ziel:?}"
	install -d -m 0700 "$(dirname "$ziel")"
	node "$ROOT_DIR/deploy/rollout/artefakt.mjs" holen --app "$app" --commit "$commit" --repo "$repo" \
		--token-datei "$GITHUB_TOKEN_DATEI" --lockfile "$dir/pnpm-lock.yaml" --origin "$origin" --ziel "$ziel" || rc=$?
	case "$rc" in
	0)
		ok "Artefakt aus CI geprüft, kein Build auf dem Server"
		return 0
		;;
	3)
		hinweis "kein Artefakt für ${commit:0:7} (CI-Lauf abgebrochen, älter als 30 Tage oder vor dem Umstieg gebaut)"
		frage "$app auf dem Server bauen (braucht 1,5–3 GB RAM)?" && return 1
		die "abgebrochen"
		;;
	4) die "CI für ${commit:0:7} ist rot: kein Release (AGENTS.md)" ;;
	5) die "CI für ${commit:0:7} läuft noch: in ein paar Minuten erneut starten" ;;
	*) die "Artefakt für ${commit:0:7} hat die Prüfung nicht bestanden (Ausgabe oben): nicht einspielen, Ursache klären" ;;
	esac
}

# Wächter, Abhängigkeiten und Migrationen ohne Build (pnpm release:prepare
# bzw. release:wallet:prepare); der laufende Stand bleibt dabei an.
#   release_vorbereiten <app> <ordner> <skript>
release_vorbereiten() {
	local app="$1" dir="$2" skript="$3"
	if trocken; then
		info "(Trockenlauf) würde pnpm $skript als $app ausführen (Wächter, Abhängigkeiten, Migrationen)"
		return 0
	fi
	(
		app_env "$app"
		export RELEASE_ALLOWED_SIGNERS="$ANKER"
		cd "$dir" || exit 1
		runuser -u "$app" -- pnpm "$skript"
	) || die "pnpm $skript fehlgeschlagen (Ausgabe oben); der alte Stand läuft weiter"
	ok "Wächter, Abhängigkeiten und Migrationen eingespielt"
}

# Geprüftes .next neben das alte legen und umbenennen; Bild-Cache bleibt.
#   artefakt_einsetzen <user> <ordner> <quelle> <.next relativ> [datei…]
# Merkt das alte .next in ARTEFAKT_ALT (artefakt_zurueck, nach Erfolg weg).
ARTEFAKT_ALT=""
artefakt_einsetzen() {
	local user="$1" dir="${2:?Ordner fehlt}" quelle="${3:?Quelle fehlt}" rel="${4:?Pfad fehlt}" f grp
	shift 4
	# Hauptgruppe des Dienst-Users (auf dem Server klick bzw. both)
	grp="$(id -gn "$user")" || die "User $user fehlt"
	local ziel="$dir/$rel" neu="$dir/$rel.neu" alt="$dir/$rel.alt"
	if trocken; then
		info "(Trockenlauf) würde $ziel durch das Artefakt ersetzen"
		return 0
	fi
	[ -f "$quelle/$rel/BUILD_ID" ] || die "Artefakt ohne $rel/BUILD_ID"
	rm -rf -- "${neu:?}" "${alt:?}"
	cp -a "$quelle/$rel" "$neu"
	if [ -d "$ziel/cache" ]; then mv "$ziel/cache" "$neu/cache"; fi
	chown -R "$user:$grp" "$neu"
	for f in "$@"; do
		install -d -o "$user" -g "$grp" -m 0755 "$(dirname "$dir/$f")"
		install -o "$user" -g "$grp" -m 0644 "$quelle/$f" "$dir/$f.neu"
	done
	if [ -d "$ziel" ]; then mv "$ziel" "$alt"; fi
	mv "$neu" "$ziel"
	for f in "$@"; do mv -f "$dir/$f.neu" "$dir/$f"; done
	ARTEFAKT_ALT="$alt"
	rm -rf -- "${quelle:?}"
	ok "$rel aus dem Artefakt eingesetzt"
}

# Startet der neue Stand nicht: altes .next zurück (vor dem Neustart).
#   artefakt_zurueck <ordner> <.next relativ>
artefakt_zurueck() {
	local dir="${1:?Ordner fehlt}" rel="${2:?Pfad fehlt}"
	[ -n "$ARTEFAKT_ALT" ] && [ -d "$ARTEFAKT_ALT" ] || return 1
	hinweis "neuer Stand startet nicht: alter Build-Stand zurück"
	rm -rf -- "${dir:?}/${rel:?}.neu"
	mv "$dir/$rel" "$dir/$rel.neu"
	mv "$ARTEFAKT_ALT" "$dir/$rel"
	ARTEFAKT_ALT=""
	return 0
}

# Nach Erfolg: das alte .next wird nicht mehr gebraucht
artefakt_aufraeumen() {
	if [ -n "$ARTEFAKT_ALT" ] && [ -d "$ARTEFAKT_ALT" ]; then rm -rf -- "${ARTEFAKT_ALT:?}"; fi
	ARTEFAKT_ALT=""
}

# Nach einem Build auf dem Server: Turbopack-Cache weg (≈ 1 GB, braucht nur
# der nächste Build; der Rest von .next/cache gehört der laufenden App)
build_cache_weg() {
	local next="${1:?.next fehlt}"
	[ -d "$next/cache/turbopack" ] || return 0
	aendern rm -rf -- "${next:?}/cache/turbopack"
	ok "Build-Cache entfernt ($next/cache/turbopack)"
}

units_einspielen() {
	local u
	for u in "$@"; do
		einspielen "$DEPLOY/systemd/$u" "/etc/systemd/system/$u"
	done
}
# Units, die es auf dem Server schon gibt, aktualisieren (Backup-Timer u. a.
# brauchen eigene Einrichtung, siehe Runbook)
units_wenn_da() {
	local u
	for u in "$@"; do
		[ -f "/etc/systemd/system/$u" ] && units_einspielen "$u"
	done
	return 0
}

app_ordner() {
	local user="$1" d
	shift
	for d in "$@"; do
		[ -d "$d" ] || [ ! -d "$(dirname "$d")" ] || aendern install -d -m 0750 -o "$user" -g "$user" "$d"
	done
	return 0
}

backup_vorher() {
	local unit="$1"
	if systemctl cat "$unit" >/dev/null 2>&1; then
		info "Backup: $unit"
		aendern systemctl start "$unit" || die "$unit fehlgeschlagen: journalctl -u $unit"
		ok "Backup erstellt"
	else
		hinweis "$unit nicht eingerichtet (Runbook „Backup & Restore“)"
		frage "Ohne Backup weiter?" || die "abgebrochen"
	fi
}

phase_klick() {
	titel "Klick: Backup, Release (Migrationen), Units, Neustart"
	id klick >/dev/null 2>&1 || die "User klick fehlt"
	backup_vorher klick-backup-db.service
	app_checkout klick "$KLICK_DIR"
	local quelle="$SICHERUNG/artefakt-klick" artefakt=0
	artefakt_holen klick "$KLICK_DIR" "$quelle" && artefakt=1
	if [ "$artefakt" = 1 ]; then
		release_vorbereiten klick "$KLICK_DIR" release:prepare
		artefakt_einsetzen klick "$KLICK_DIR" "$quelle" .next dist/parse-worker.mjs
	else
		platz_fuer_build klick
		local alt="$SICHERUNG/next-klick"
		build_sichern "$KLICK_DIR/.next" "$alt"
		if trocken; then
			info "(Trockenlauf) würde pnpm release als klick bauen"
		else
			(
				app_env klick
				export RELEASE_ALLOWED_SIGNERS="$ANKER"
				cd "$KLICK_DIR" || exit 1
				runuser -u klick -- pnpm release
			) || build_gescheitert klick "$KLICK_DIR/.next" "$alt" http://127.0.0.1:3000/api/ready
			ok "Release gebaut, Migrationen eingespielt"
			rm -rf "$alt"
		fi
		build_cache_weg "$KLICK_DIR/.next"
	fi
	# Parser-Bündel root-eigen (klick-parse@ liest nur von dort); das
	# Backup-Skript aus dem root-eigenen Checkout, nie aus dem App-Ordner
	trocken || [ -f "$KLICK_DIR/dist/parse-worker.mjs" ] || die "dist/parse-worker.mjs fehlt nach dem Build"
	[ -f "$KLICK_DIR/dist/parse-worker.mjs" ] &&
		einspielen "$KLICK_DIR/dist/parse-worker.mjs" /usr/local/lib/klick-parse/parse-worker.mjs 0644
	if [ -d /usr/local/lib/klick-backup ]; then
		einspielen "$ROOT_DIR/scripts/backup-db.sh" /usr/local/lib/klick-backup/scripts/backup-db.sh 0755
	fi
	# ReadWritePaths der Unit müssen bestehen, sonst startet der Dienst nicht
	app_ordner klick /var/log/klick /opt/klick/.cache "$KLICK_DIR/.next/cache"
	units_einspielen klick.service klick-parse.socket klick-parse@.service klick-parse.slice
	units_wenn_da klick-backup-db.service klick-backup-db.timer klick-backup-objects.service \
		klick-backup-objects.timer klick-backup-verify.service klick-backup-verify.timer klick-alert@.service
	not_freigabe_aufraeumen
	aendern systemctl daemon-reload
	aendern systemctl enable --now klick-parse.socket
	aendern systemctl enable klick
	aendern systemctl restart klick
	local u
	for u in "${ANGEHALTEN[@]}"; do [ "$u" = klick ] || aendern systemctl start "$u"; done
	trocken && return 0
	if ! warte_bereit http://127.0.0.1:3000/api/ready 180; then
		journalctl -u klick -n 40 --no-pager | sed 's/^/    /'
		if artefakt_zurueck "$KLICK_DIR" .next; then
			systemctl restart klick || true
			warte_bereit http://127.0.0.1:3000/api/ready 180 && hinweis "Klick läuft wieder mit dem alten Stand"
		fi
		not_freigabe_zurueck
		die "Klick startet nicht (Start-Prüfung oben; PROD_ACCEPT_RISKS in /etc/klick/klick.env, Runbook „Klick startet nach einem Update nicht“)"
	fi
	artefakt_aufraeumen
	journalctl -u klick --since "-5min" --no-pager 2>/dev/null | grep -iE 'start-prüfung|prod_accept|risiko' | tail -5 | sed 's/^/    /' || true
	systemctl is-active --quiet wg-quick@wg-admin 2>/dev/null ||
		hinweis "Admin-Bereich (/admin) geht ab jetzt nur aus dem Admin-Netz: Phase wireguard einrichten"
}

# Die Not-Freigabe (Drop-in $NOTFREIGABE) aus einer Störung nach dem Update
# entfernen, sobald die neue Unit mit ADMIN_NETWORKS liegt: admin_anywhere
# fällt weg, übrige Risiken (z. B. no_av) wandern in den verwalteten Block
# von klick.env. NOTFREIGABE_ENTFERNT=1 merkt sich das für den Rückweg.
NOTFREIGABE_ENTFERNT=0
not_freigabe_aufraeumen() {
	local env=/etc/klick/klick.env risks
	NOTFREIGABE_ENTFERNT=0
	risks="$(risiken_nach_update "$env" "$NOTFREIGABE")"
	[ -f "$NOTFREIGABE" ] || [ "$risks" != "$(env_wert "$env" PROD_ACCEPT_RISKS)" ] || return 0
	sichern "$env"
	sichern "$NOTFREIGABE"
	env_block_render "$env" "PROD_ACCEPT_RISKS=$risks" | schreibe_inhalt "$env" 0600 root:root geheim
	[ -f "$NOTFREIGABE" ] && aendern rm -f "$NOTFREIGABE"
	if trocken; then
		info "(Trockenlauf) würde die Not-Freigabe entfernen, hingenommen bliebe: ${risks:-nichts}"
		return 0
	fi
	NOTFREIGABE_ENTFERNT=1
	ok "Not-Freigabe entfernt (Admin-Netz jetzt in der Unit), hingenommen bleibt: ${risks:-nichts}"
}

# Startet Klick danach nicht, Drop-in und klick.env aus der Sicherung zurück
# und mit der alten Freigabe neu starten; die Ursache steht im Journal oben.
not_freigabe_zurueck() {
	[ "$NOTFREIGABE_ENTFERNT" = 1 ] || return 0
	local env=/etc/klick/klick.env
	hinweis "Not-Freigabe und klick.env aus $SICHERUNG zurück"
	if [ -f "$(gesichert "$env")" ]; then cp -a "$(gesichert "$env")" "$env"; fi
	if [ -f "$(gesichert "$NOTFREIGABE")" ]; then
		install -d -m 0755 "$(dirname "$NOTFREIGABE")"
		cp -a "$(gesichert "$NOTFREIGABE")" "$NOTFREIGABE"
	fi
	systemctl daemon-reload
	systemctl restart klick
	if warte_bereit http://127.0.0.1:3000/api/ready 180; then
		hinweis "Klick läuft wieder mit der Not-Freigabe; Start-Prüfung oben lesen, Ursache beheben, Phase klick erneut"
	fi
}

phase_both() {
	titel "both.money: Backup, Release (Migrationen), Units, Neustart"
	id both >/dev/null 2>&1 || {
		hinweis "User both fehlt: both.money nicht eingerichtet, übersprungen"
		return 0
	}
	backup_vorher both-backup-db.service
	app_checkout both "$BOTH_DIR"
	local quelle="$SICHERUNG/artefakt-both" artefakt=0
	artefakt_holen both "$BOTH_DIR" "$quelle" && artefakt=1
	if [ "$artefakt" = 1 ]; then
		release_vorbereiten both "$BOTH_DIR" release:wallet:prepare
		artefakt_einsetzen both "$BOTH_DIR" "$quelle" apps/wallet/.next
	else
		local alt="$SICHERUNG/next-both"
		build_sichern "$BOTH_DIR/apps/wallet/.next" "$alt"
		# Build braucht den Speicher des Dienstes (Runbook)
		aendern systemctl stop both
		if trocken; then
			info "(Trockenlauf) würde pnpm release:wallet als both bauen"
		else
			(
				app_env both
				export RELEASE_ALLOWED_SIGNERS="$ANKER" NODE_OPTIONS=--max-old-space-size=1536
				cd "$BOTH_DIR" || exit 1
				runuser -u both -- pnpm release:wallet
			) || build_gescheitert both "$BOTH_DIR/apps/wallet/.next" "$alt" http://127.0.0.1:3010/api/ready
			ok "Release gebaut, Migrationen eingespielt"
			rm -rf "$alt"
		fi
		build_cache_weg "$BOTH_DIR/apps/wallet/.next"
	fi
	app_ordner both /opt/both/.cache "$BOTH_DIR/apps/wallet/.next/cache"
	units_einspielen both.service
	units_wenn_da both-sanctions.service both-sanctions.timer both-backup-db.service both-backup-db.timer
	aendern systemctl daemon-reload
	aendern systemctl restart both
	trocken && return 0
	if ! warte_bereit http://127.0.0.1:3010/api/ready 180; then
		journalctl -u both -n 40 --no-pager | sed 's/^/    /'
		if artefakt_zurueck "$BOTH_DIR" apps/wallet/.next; then
			systemctl restart both || true
			warte_bereit http://127.0.0.1:3010/api/ready 180 && hinweis "both.money läuft wieder mit dem alten Stand"
		fi
		die "both.money startet nicht"
	fi
	artefakt_aufraeumen
}

phase_signer() {
	titel "Signer und Bestätigungsseite"
	if [ -z "$SIGNER_TAG" ] || [ -z "$SIGNER_SHA" ]; then
		hinweis "übersprungen: --signer-tag <tag> --signer-sha <sha256 aus der CI-Zusammenfassung „Signer bündeln“> angeben"
		return 0
	fi
	[[ "$SIGNER_SHA" =~ ^[0-9a-f]{64}$ ]] || die "--signer-sha hat nicht das Format von CI"
	aendern env KLICK_ALLOWED_SIGNERS="$ANKER" "$DEPLOY/signer/install.sh" "$SIGNER_TAG" "$SIGNER_SHA"
	trocken && return 0
	info "Stand des Signers:"
	klick-signer-admin status 2>&1 | sed -n '1,40p' | sed 's/^/    /' || true
	if id both >/dev/null 2>&1 && [ -d "$BOTH_DIR" ]; then
		info "wallet:check (Knoten, Signer, erlaubte Assets ↔ Signer-Grenzen):"
		(
			app_env both
			cd "$BOTH_DIR"
			runuser -u both -- pnpm -s wallet:check
		) 2>&1 | sed 's/^/    /' || hinweis "wallet:check meldet Abweichungen (oben)"
	fi
	hinweis "Die Signer-Richtlinie ändert das Skript nie: klick-signer-admin policy <datei> (Runbook)"
}
