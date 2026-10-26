#!/usr/bin/env bash
# Signer und Bestätigungsseite installieren (Plan Wallet, Phase 2; seit
# both.money für https://both.money und approve.both.money) — als root.
#
#   sudo deploy/signer/install.sh <tag> <sha256 von dist/signer.mjs aus CI> [api-origin]
#
# Baut aus einem root-eigenen Checkout des Tags (nie aus dem Arbeitsordner der
# App), ohne Lifecycle-Skripte, vergleicht den SHA-256 mit dem Wert aus CI und
# installiert nur lesbar:
#   /usr/local/lib/klick-signer/signer.mjs   (root, 0444)
#   /var/www/approve/*                       (root, 0444; Ordner 0555; CONFIRM_ROOT)
#   /etc/systemd/system/klick-signer*        (Units)
# Legt beim ersten Mal den Dienst-User und den KEK (systemd-creds) an.
# Runbook: deploy/README.md, „Wallet: Signer und Bestätigungsseite“.
set -euo pipefail

TAG="${1:?Tag fehlt (z. B. signer-2026-10-24)}"
EXPECTED="${2:?SHA-256 aus CI fehlt}"
API="${3:-https://both.money}"
# Ablage der Bestätigungsseite (nginx: deploy/nginx/approve.both.money.conf)
CONFIRM_ROOT="${CONFIRM_ROOT:-/var/www/approve}"
REPO="${KLICK_REPO:-https://github.com/kmzjrnnnsv-svg/klick.git}"
# Release-Schlüssel, root-eigen (deploy/rollout legt die Datei an)
SIGNERS="${KLICK_ALLOWED_SIGNERS:-/etc/klick-release/allowed_signers}"
SRC_BASE=/usr/local/src/klick-signer
SRC="$SRC_BASE/$TAG"

die() { echo "install.sh: $*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "nur als root"
[[ "$EXPECTED" =~ ^[0-9a-f]{64}$ ]] || die "SHA-256 hat nicht das Format von CI"
[[ "$API" =~ ^https://[a-z0-9.-]+$ ]] || die "api-origin muss https://<host> sein"
[[ "$CONFIRM_ROOT" =~ ^/var/www/[a-z]+$ ]] || die "CONFIRM_ROOT muss /var/www/<name> sein"
command -v pnpm >/dev/null || die "pnpm fehlt"
command -v systemd-creds >/dev/null || die "systemd-creds fehlt (systemd ≥ 250)"

# 1. Quelltext: frischer, root-eigener Checkout genau dieses Tags
install -d -m 0755 -o root -g root "$SRC_BASE"
rm -rf -- "$SRC"
git clone --quiet --depth 1 --branch "$TAG" "$REPO" "$SRC"
# Signatur gegen den root-eigenen Anker außerhalb des Checkouts (nie gegen
# deploy/release/allowed_signers aus dem Tag selbst). Steht dort ein Schlüssel,
# ist die Prüfung Pflicht; ohne Schlüssel nur ein Hinweis (Übergang).
if [ -r "$SIGNERS" ] && grep -qvE '^[[:space:]]*(#|$)' "$SIGNERS"; then
	git -C "$SRC" -c gpg.format=ssh -c "gpg.ssh.allowedSignersFile=$SIGNERS" \
		verify-tag "$TAG" >/dev/null 2>&1 || die "Tag $TAG ist nicht gültig signiert ($SIGNERS)"
	echo "Tag $TAG: Signatur gültig"
else
	echo "Hinweis: $SIGNERS ohne Schlüssel, Tag $TAG wird nicht auf Signatur geprüft"
fi
chown -R root:root "$SRC"

# 2. Bauen ohne Lifecycle-Skripte, Prüfsumme vergleichen
(
	cd "$SRC"
	pnpm install --frozen-lockfile --ignore-scripts --prefer-offline >/dev/null
	pnpm -s build:signer
)
ACTUAL="$(sha256sum "$SRC/dist/signer.mjs" | cut -d' ' -f1)"
[ "$ACTUAL" = "$EXPECTED" ] || die "SHA-256 weicht ab: gebaut $ACTUAL, CI $EXPECTED"

# 3. Dienst-User
if ! id klick-signer >/dev/null 2>&1; then
	useradd --system --no-create-home --home-dir /nonexistent \
		--shell /usr/sbin/nologin klick-signer
fi

# 4. Signer installieren (nur lesbar)
install -d -m 0755 -o root -g root /usr/local/lib/klick-signer
install -m 0444 -o root -g root "$SRC/dist/signer.mjs" /usr/local/lib/klick-signer/signer.mjs
printf '%s  signer.mjs\n' "$ACTUAL" > /usr/local/lib/klick-signer/signer.mjs.sha256
chmod 0444 /usr/local/lib/klick-signer/signer.mjs.sha256

# 5. Bestätigungsseite (API-Herkunft im <meta> eintragen)
STAGE="$(mktemp -d)"
trap 'rm -rf -- "$STAGE"' EXIT
cp "$SRC"/deploy/confirm/{index.html,enrol.html,canonical.js,confirm.js,enrol.js,style.css} "$STAGE/"
sed -i "s#<meta name=\"klick-api\" content=\"[^\"]*\">#<meta name=\"klick-api\" content=\"$API\">#" \
	"$STAGE/index.html" "$STAGE/enrol.html"
install -d -m 0555 -o root -g root "$CONFIRM_ROOT"
for f in "$STAGE"/*; do
	install -m 0444 -o root -g root "$f" "$CONFIRM_ROOT/$(basename "$f")"
done
if [ "$API" != "https://both.money" ]; then
	echo "Hinweis: connect-src in deploy/nginx/approve.both.money.conf auf $API anpassen."
fi

# 6. Verwaltung am Terminal nur aus diesem root-eigenen Checkout — nie aus
#    dem Arbeitsordner der App (den kann der Dienst-User klick verändern)
ln -sfn "$SRC" "$SRC_BASE/current"
cat > /usr/local/sbin/klick-signer-admin <<'WRAP'
#!/bin/sh
# Signer verwalten (admin.sock) — Code aus /usr/local/src/klick-signer/current
[ "$(id -u)" = 0 ] || { echo "nur als root" >&2; exit 1; }
cd /usr/local/src/klick-signer/current || exit 1
exec ./node_modules/.bin/tsx scripts/signer-admin.ts "$@"
WRAP
chmod 0755 /usr/local/sbin/klick-signer-admin
chown root:root /usr/local/sbin/klick-signer-admin

# 7. Units
for u in klick-signer.service klick-signer-app.socket klick-signer-admin.socket \
	klick-signer-backup.service klick-signer-backup.timer; do
	install -m 0644 -o root -g root "$SRC/deploy/systemd/$u" "/etc/systemd/system/$u"
done

# 8. KEK beim ersten Mal (32 Byte, verschlüsselt an diese Maschine/TPM)
install -d -m 0700 -o root -g root /etc/credstore.encrypted
if [ ! -f /etc/credstore.encrypted/signer_kek ]; then
	head -c 32 /dev/urandom | systemd-creds encrypt --name=signer_kek - \
		/etc/credstore.encrypted/signer_kek
	echo "KEK angelegt: /etc/credstore.encrypted/signer_kek"
fi

systemctl daemon-reload
systemctl enable --now klick-signer-app.socket klick-signer-admin.socket klick-signer-backup.timer
# laufenden Dienst neu starten, damit der neue Code gilt
if systemctl is-active --quiet klick-signer.service; then
	systemctl restart klick-signer.service
fi

echo "Signer $TAG installiert, sha256 $ACTUAL"
echo "Weiter: klick-signer-admin status (Runbook deploy/README.md)"
