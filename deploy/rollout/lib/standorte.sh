#!/usr/bin/env bash
# Phase „standorte“ (Standort-Tunnel, ADR-033): Netz-Agent klick-netz,
# strongSwan (swanctl, IKEv2) und WireGuard-Schnittstelle wg-sites. Einzeln
# aufrufbar, nicht Teil von „alles“: nur, wenn Kund:innen ihr Büro verbinden.
# Der Agent läuft als root (nur CAP_NET_ADMIN); gebaut wird er deshalb aus
# diesem root-eigenen Checkout, nie aus /opt/klick/current.
set -euo pipefail

phase_standorte() {
	titel "Standort-Tunnel (klick-netz)"
	local ip pub
	ip="${ENDPOINT:-$(oeffentliche_ip)}"
	[[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
		die "öffentliche IPv4 nicht erkannt: --endpoint <ip> angeben"
	info "öffentliche Adresse für die Gegenstellen: $ip"

	aendern apt-get install -y --no-install-recommends strongswan-swanctl charon-systemd wireguard-tools
	# Module beim Start laden: der Agent darf keine nachladen (ProtectKernelModules)
	printf 'wireguard\ndummy\n' | schreibe_inhalt /etc/modules-load.d/klick-sites.conf 0644 root:root
	aendern modprobe wireguard
	aendern modprobe dummy
	aendern install -d -m 0755 -o root -g root /etc/swanctl/conf.d

	# Agent bündeln und root-eigen ablegen (nur erlaubte Quellen, Test netz-agent)
	if ! trocken; then
		(
			cd "$ROOT_DIR"
			pnpm install --frozen-lockfile --ignore-scripts --prefer-offline >/dev/null
			pnpm -s build:netz-agent
		) || die "Netz-Agent ließ sich nicht bauen"
	fi
	aendern install -d -m 0755 -o root -g root /usr/local/lib/klick-netz
	aendern install -m 0444 -o root -g root "$ROOT_DIR/dist/netz-agent.mjs" /usr/local/lib/klick-netz/netz-agent.mjs
	aendern install -d -m 0700 -o root -g root /etc/klick-netz
	printf 'SITE_PUBLIC_IP=%s\n' "$ip" | schreibe_inhalt /etc/klick-netz/agent.env 0600 root:root

	units_einspielen klick-netz.socket klick-netz.service
	aendern systemctl daemon-reload
	aendern systemctl enable --now klick-netz.socket
	aendern systemctl enable klick-netz.service
	aendern systemctl restart klick-netz.service
	trocken && return 0

	# Firewall-Mengen kommen mit deploy/firewall.nft (Phase firewall-final)
	if ! nft list set inet klick site_peers >/dev/null 2>&1; then
		hinweis "nftables kennt site_peers noch nicht: Phase firewall-final erneut ausführen"
	fi
	# öffentlicher Schlüssel von wg-sites (der Agent legt ihn beim Start an)
	for _ in $(seq 1 15); do
		pub="$(wg show wg-sites public-key 2>/dev/null || true)"
		[ -n "$pub" ] && break
		sleep 1
	done
	[ -n "$pub" ] || die "wg-sites fehlt (journalctl -u klick-netz)"
	env_block_render /etc/klick/klick.env \
		"SITE_AGENT_SOCKET=/run/klick-netz/app.sock" \
		"SITE_PUBLIC_IP=$ip" \
		"SITE_WG_PUBLIC_KEY=$pub" | schreibe_inhalt /etc/klick/klick.env 0600 root:root geheim
	aendern systemctl restart klick
	warte_bereit http://127.0.0.1:3000/api/ready 180 || die "Klick startet nicht (journalctl -u klick)"
	ok "Netz-Agent läuft, Klick kennt ihn (Admin > Organisationen > Standort verbinden)"
	hinweis "Hetzner-Firewall eingehend ergänzen: UDP 500, UDP 4500, UDP 51821 und ESP (Protokoll 50)"
}
