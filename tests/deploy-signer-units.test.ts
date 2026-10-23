import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { systemdSockets } from "@/signer/server";

// Betrieb des Signers und der Bestätigungsseite: Units ohne Netz und mit
// Sandbox, Sockets mit festen Rechten, nginx nur TLS 1.3 ohne proxy_pass,
// install.sh baut aus dem Tag und vergleicht die Prüfsumme.

const ROOT = resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const lines = (text: string) =>
	text
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith("#"));

describe("systemd", () => {
	const service = lines(read("deploy/systemd/klick-signer.service"));
	const app = lines(read("deploy/systemd/klick-signer-app.socket"));
	const admin = lines(read("deploy/systemd/klick-signer-admin.socket"));

	it("Dienst: kein Netz, kein JIT, Sandbox, KEK als Credential", () => {
		for (const d of [
			"PrivateNetwork=yes",
			"IPAddressDeny=any",
			"RestrictAddressFamilies=AF_UNIX",
			"MemoryDenyWriteExecute=yes",
			"LimitCORE=0",
			"NoNewPrivileges=yes",
			"ProtectSystem=strict",
			"ProtectHome=yes",
			"PrivateDevices=yes",
			"CapabilityBoundingSet=",
			"SystemCallFilter=@system-service",
			"StateDirectoryMode=0700",
			"UMask=0077",
			"User=klick-signer",
			"LoadCredentialEncrypted=signer_kek:/etc/credstore.encrypted/signer_kek",
			"Sockets=klick-signer-app.socket klick-signer-admin.socket",
			"OnFailure=klick-alert@%n.service",
		])
			expect(service).toContain(d);
		const exec = service.find((l) => l.startsWith("ExecStart="));
		expect(exec).toMatch(/^ExecStart=\/usr\/local\/bin\/node /);
		for (const flag of [
			"--jitless",
			"--disallow-code-generation-from-strings",
			"--disable-proto=delete",
		])
			expect(exec).toContain(flag);
		expect(exec).toMatch(/\/usr\/local\/lib\/klick-signer\/signer\.mjs$/);
		expect(service.some((l) => l.startsWith("ReadWritePaths"))).toBe(false);
	});

	it("Sockets: app 0660 Gruppe klick, admin 0600 nur root, Namen für LISTEN_FDNAMES", () => {
		expect(app).toEqual(
			expect.arrayContaining([
				"ListenStream=/run/klick-signer/app.sock",
				"FileDescriptorName=app",
				"SocketGroup=klick",
				"SocketMode=0660",
				"Service=klick-signer.service",
			]),
		);
		expect(admin).toEqual(
			expect.arrayContaining([
				"ListenStream=/run/klick-signer/admin.sock",
				"FileDescriptorName=admin",
				"SocketUser=root",
				"SocketGroup=root",
				"SocketMode=0600",
			]),
		);
		// so liest der Signer sie aus
		expect(
			systemdSockets(
				{ LISTEN_PID: "42", LISTEN_FDS: "2", LISTEN_FDNAMES: "admin:app" },
				42,
			),
		).toEqual({ app: { fd: 4 }, admin: { fd: 3 } });
		expect(
			systemdSockets({ LISTEN_PID: "41", LISTEN_FDS: "2" }, 42),
		).toBeNull();
	});

	it("Backup: nur das Journal, nie seeds.json", () => {
		const backup = read("deploy/systemd/klick-signer-backup.service");
		expect(backup).toContain("journal.log");
		expect(lines(backup).join("\n")).not.toContain("seeds.json");
	});
});

describe("nginx freigabe.raza.work", () => {
	const conf = read("deploy/nginx/freigabe.raza.work.conf");
	const active = lines(conf).join("\n");

	it("nur TLS 1.3, nie proxy_pass, nur GET/HEAD", () => {
		expect(active).toMatch(/ssl_protocols TLSv1\.3;/);
		expect(active).not.toMatch(/TLSv1\.2|proxy_pass|fastcgi_pass|uwsgi_pass/);
		expect(active).toMatch(/limit_except GET HEAD \{\s*deny all;/);
		expect(active).toMatch(
			/location = \/\.well-known\/webauthn \{\s*return 404;/,
		);
	});

	it("CSP und Rahmen-Schutz", () => {
		const csp = active.match(/Content-Security-Policy "([^"]+)"/)?.[1] ?? "";
		for (const d of [
			"default-src 'none'",
			"script-src 'self'",
			"style-src 'self'",
			"connect-src https://raza.work",
			"frame-ancestors 'none'",
			"base-uri 'none'",
			"form-action 'none'",
			"require-trusted-types-for 'script'",
			"trusted-types 'none'",
		])
			expect(csp).toContain(d);
		expect(active).toContain('X-Frame-Options "DENY"');
		expect(active).toContain('Referrer-Policy "no-referrer"');
		// add_header nur im server-Block, sonst gehen sie in location verloren
		const locations = active.split(/location [^{]+\{/).slice(1);
		for (const l of locations)
			expect(l.split("}")[0]).not.toContain("add_header");
	});
});

describe("install.sh", () => {
	const script = read("deploy/signer/install.sh");

	it("ausführbar, strikt, baut aus dem Tag ohne Lifecycle-Skripte", () => {
		expect(
			statSync(resolve(ROOT, "deploy/signer/install.sh")).mode & 0o111,
		).not.toBe(0);
		expect(script).toContain("set -euo pipefail");
		expect(script).toMatch(/git clone --quiet --depth 1 --branch "\$TAG"/);
		expect(script).toContain("--frozen-lockfile --ignore-scripts");
		expect(script).toMatch(/\[ "\$ACTUAL" = "\$EXPECTED" \] \|\| die/);
		expect(script).toContain("install -m 0444 -o root -g root");
		expect(script).toContain("systemd-creds encrypt --name=signer_kek");
		// Verwaltung als root nur aus dem root-eigenen Checkout
		expect(script).toContain("cd /usr/local/src/klick-signer/current");
		expect(script).toContain('chown -R root:root "$SRC"');
	});
});
