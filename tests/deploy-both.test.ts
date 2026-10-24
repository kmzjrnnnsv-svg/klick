import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Betrieb von both.money auf dem Klick-Server (Plan both.money, W3): eigener
// User, eigene Credentials (nie die von Klick), kleinere Speichergrenzen,
// nginx nur zum eigenen Port, Signer-Zugang über die Gruppe both.

const ROOT = resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const lines = (text: string) =>
	text
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith("#"));

describe("both.service", () => {
	const unit = lines(read("deploy/systemd/both.service"));

	it("eigener User, Sandbox, Grenzen, Adresse und Relying Party", () => {
		for (const d of [
			"User=both",
			"Group=both",
			"WorkingDirectory=/opt/both/current",
			"ExecStart=/opt/both/current/deploy/systemd/both-start.sh",
			"Environment=PORT=3010",
			"Environment=HOSTNAME=127.0.0.1",
			"Environment=WALLET_AUTH_URL=https://both.money",
			"Environment=WALLET_PASSKEY_RP_ID=both.money",
			"NoNewPrivileges=yes",
			"ProtectSystem=strict",
			"ProtectHome=yes",
			"PrivateDevices=yes",
			"CapabilityBoundingSet=",
			"SystemCallFilter=@system-service",
			"UMask=0077",
			"MemoryHigh=640M",
			"MemoryMax=896M",
		])
			expect(unit).toContain(d);
	});

	it("nur eigene Credentials (wallet_*), nie die von Klick", () => {
		const creds = unit.filter((l) => l.startsWith("LoadCredential"));
		expect(creds.length).toBeGreaterThan(0);
		for (const c of creds) expect(c).toMatch(/=wallet_[a-z0-9_]+:/);
	});

	it("Start-Skript: ausführbar, nur WALLET_*-Umgebung, startet apps/wallet", () => {
		const path = "deploy/systemd/both-start.sh";
		expect(statSync(resolve(ROOT, path)).mode & 0o111).not.toBe(0);
		const script = read(path);
		expect(script).toContain("set -euo pipefail");
		expect(script).toMatch(/next start apps\/wallet -p "\$\{PORT:-3010\}"/);
		const exported = [...script.matchAll(/export "?([A-Z_]+)(?:[=$"]|\^)/g)]
			.map((m) => m[1] as string)
			.filter((n) => n !== "WALLET_RPC_");
		for (const name of exported)
			expect(name).toMatch(/^(WALLET_[A-Z_]+|BREVO_API_KEY)$/);
		expect(script).not.toMatch(
			/\bDATABASE_URL=|\bVAULT_KEK_BASE64=|BETTER_AUTH_SECRET/,
		);
	});

	it("Signer-Anbindung über approve.both.money", () => {
		const signer = lines(
			read("deploy/systemd/both.service.d/signer.conf.example"),
		);
		expect(signer).toContain(
			"Environment=WALLET_SIGNER_SOCKET=/run/klick-signer/app.sock",
		);
		expect(signer).toContain(
			"Environment=WALLET_CONFIRM_ORIGIN=https://approve.both.money",
		);
	});

	it("Backup und Sanktionsliste mit eigenen Credentials", () => {
		const backup = lines(read("deploy/systemd/both-backup-db.service"));
		expect(backup).toContain("Environment=BACKUP_PREFIX=both");
		expect(backup).toContain(
			"LoadCredentialEncrypted=wallet_database_url_backup:/etc/credstore.encrypted/wallet_database_url_backup",
		);
		const sanctions = lines(read("deploy/systemd/both-sanctions.service"));
		expect(sanctions).toContain("User=both");
		expect(sanctions.join("\n")).toContain("pnpm wallet:sanctions --fetch");
	});
});

describe("nginx both.money", () => {
	const active = lines(read("deploy/nginx/both.money.conf")).join("\n");

	it("nur zum eigenen Port, nie zu Klick", () => {
		const targets = [...active.matchAll(/proxy_pass (\S+);/g)].map((m) => m[1]);
		expect(targets.length).toBeGreaterThan(0);
		for (const t of targets) expect(t).toBe("http://127.0.0.1:3010");
	});

	it("www und http leiten auf https://both.money um", () => {
		expect(active).toContain("return 301 https://both.money$request_uri;");
		expect(active).toMatch(/server_name both\.money;/);
	});
});
