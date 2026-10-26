import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// nginx (Plan Härtung, H6): echte Client-IP an die Apps (Grundlage für
// Admin-Netz und IP-Listen je Org), Admin-Pfade nur aus dem Admin-Netz,
// unbekannte Hosts ohne Antwort, kein OCSP-Stapling mehr.

const ROOT = resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const DIR = "deploy/nginx";
const confs = readdirSync(resolve(ROOT, DIR)).filter((f) =>
	f.endsWith(".conf"),
);
const code = (text: string) =>
	text
		.split("\n")
		.map((l) => l.replace(/#.*$/, "").trim())
		.filter(Boolean)
		.join("\n");

/** Inhalt eines location-Blocks (ohne verschachtelte Blöcke). */
function locationBody(text: string, head: string): string {
	const i = text.indexOf(head);
	if (i < 0) return "";
	const open = text.indexOf("{", i);
	const close = text.indexOf("}", open);
	return text.slice(open + 1, close);
}

describe("alle vHosts", () => {
	for (const file of confs) {
		const text = code(read(`${DIR}/${file}`));
		it(`${file}: kein OCSP-Stapling, server_tokens off`, () => {
			expect(text).not.toMatch(/ssl_stapling\s+on/);
			const servers = text.split(/\bserver\s*\{/).length - 1;
			const tokens = (text.match(/server_tokens off;/g) ?? []).length;
			expect(tokens).toBe(servers);
		});
		if (/proxy_pass/.test(text)) {
			it(`${file}: echte Client-IP für die App (X-Real-IP = $remote_addr)`, () => {
				expect(text).toContain("proxy_set_header X-Real-IP $remote_addr;");
				// nie einen Header vom Client durchreichen
				expect(text).not.toMatch(/X-Real-IP \$http_/);
			});
			it(`${file}: App nur über localhost`, () => {
				for (const m of text.matchAll(/proxy_pass\s+([^;]+);/g))
					expect(m[1]).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
			});
		}
	}
});

describe("raza.work", () => {
	const text = code(read(`${DIR}/raza.work.conf`));

	it("Admin-Pfade nur aus dem Admin-Netz", () => {
		for (const head of [
			"location = /admin {",
			"location ^~ /admin/ {",
			"location ^~ /api/admin/ {",
			"location ^~ /api/auth/admin/ {",
		]) {
			const body = locationBody(text, head);
			expect(body, head).toContain(
				"include /etc/nginx/snippets/klick-admin-net.conf;",
			);
			expect(body).toContain("proxy_pass http://127.0.0.1:3000;");
		}
	});

	it("öffentliche Formulare eng begrenzt", () => {
		expect(text).toMatch(
			/limit_req_zone \$binary_remote_addr zone=klick_forms:10m rate=10r\/m;/,
		);
		expect(text).toContain(
			"location ~ ^/(api/anfrage|api/vertrauen/anfrage|portal/[^/]+/(code|anmelden))$ {",
		);
	});

	it("HSTS mit preload", () => {
		expect(text).toContain(
			'add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;',
		);
	});
});

describe("Admin-Netz und Standard-Server", () => {
	it("Snippet erlaubt nur das WireGuard-Admin-Netz", () => {
		const snippet = code(read(`${DIR}/snippets/klick-admin-net.conf`)).split(
			"\n",
		);
		expect(snippet).toEqual([
			"allow 10.9.0.0/24;",
			"allow fd10:9::/64;",
			"deny all;",
		]);
	});

	it("unbekannte Hosts: 444 bzw. TLS-Abbruch ohne Zertifikat", () => {
		const text = code(read(`${DIR}/00-default.conf`));
		expect(text).toContain("listen 80 default_server;");
		expect(text).toContain("listen [::]:443 ssl default_server;");
		expect(text).toContain("return 444;");
		expect(text).toContain("ssl_reject_handshake on;");
		expect(text).not.toContain("ssl_certificate");
	});

	it("nur ein vHost ist default_server", () => {
		const defaults = confs.filter((f) =>
			/default_server/.test(code(read(`${DIR}/${f}`))),
		);
		expect(defaults).toEqual(["00-default.conf"]);
	});
});

describe("CrowdSec", () => {
	it("WAF lauscht nur lokal, Admin-Netz nie gesperrt", () => {
		const appsec = read("deploy/crowdsec/acquis.d/appsec.yaml");
		expect(appsec).toContain("listen_addr: 127.0.0.1:7422");
		expect(appsec).toContain("source: appsec");
		const wl = read("deploy/crowdsec/parsers/s02-enrich/klick-whitelist.yaml");
		for (const net of ["10.9.0.0/24", "fd10:9::/64", "127.0.0.1/32"])
			expect(wl).toContain(`"${net}"`);
		const bouncer = read(
			"deploy/crowdsec/bouncers/crowdsec-nginx-bouncer.conf.example",
		);
		expect(bouncer).toContain("APPSEC_URL=http://127.0.0.1:7422");
	});

	it("eigene Szenarien für Anmeldung und Formulare", () => {
		const s = read("deploy/crowdsec/scenarios/klick-auth-bf.yaml");
		expect(s).toContain("name: klick/auth-bf");
		expect(s).toContain("name: klick/forms-bf");
		expect(s).toContain("remediation: true");
	});
});
