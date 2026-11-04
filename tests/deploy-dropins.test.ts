import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Drop-in-Vorlagen für klick.service (Teams, Push, Identität): Jedes
// Credential, das eine Vorlage lädt, liest klick-start.sh auch ein; jede
// Variable aus Environment= kennt lib/env.ts; Geheimnisse stehen nie als
// Environment=; jede Vorlage nennt ein Runbook, das es in deploy/README.md
// gibt. Sonst lädt systemd ein Credential, das niemand liest, oder die App
// startet mit einem Schalter, den sie nicht kennt.

const DIR = "deploy/systemd/klick.service.d";
const read = (p: string) => readFileSync(p, "utf8");
const start = read("deploy/systemd/klick-start.sh");
const envTs = read("lib/env.ts");
const readme = read("deploy/README.md");

const templates = readdirSync(DIR)
	.filter((f) => f.endsWith(".conf.example"))
	.map((f) => ({ name: f, text: read(join(DIR, f)) }));

const directives = (text: string, key: string) =>
	text
		.split("\n")
		.filter((l) => l.startsWith(`${key}=`))
		.map((l) => l.slice(key.length + 1));

describe("Drop-in-Vorlagen für klick.service", () => {
	it("gibt es für Teams, Push und Identität", () => {
		expect(templates.map((t) => t.name).sort()).toEqual(
			expect.arrayContaining([
				"identity.conf.example",
				"push.conf.example",
				"teams.conf.example",
			]),
		);
	});

	for (const t of templates) {
		it(`${t.name}: Credentials liest klick-start.sh, Ablage verschlüsselt`, () => {
			const creds = directives(t.text, "LoadCredentialEncrypted");
			for (const c of creds) {
				const [name, path] = c.split(":") as [string, string];
				expect(name, c).toMatch(/^[a-z][a-z0-9_]+$/);
				expect(path, c).toBe(`/etc/credstore.encrypted/${name}`);
				expect(
					start.includes(`\${CREDENTIALS_DIRECTORY:-}/${name}"`) ||
						start.includes(`cred ${name}`),
					`${name} wird in klick-start.sh nie gelesen`,
				).toBe(true);
			}
		});

		it(`${t.name}: Environment= nur bekannte Schalter, keine Geheimnisse`, () => {
			for (const e of directives(t.text, "Environment")) {
				const key = e.slice(0, e.indexOf("="));
				expect(envTs, key).toMatch(new RegExp(`\\b${key}:`));
				expect(key, e).not.toMatch(/SECRET|PRIVATE|PASSWORD|TOKEN/);
			}
		});

		it(`${t.name}: nennt ein vorhandenes Runbook`, () => {
			const m = /Runbook „([^“]+)“/.exec(t.text);
			expect(m?.[1], t.name).toBeTruthy();
			expect(readme).toContain(`## ${m?.[1]}`);
		});
	}

	it("Identität: Credentials landen in den Schaltern, die die App liest", () => {
		expect(start).toContain(
			'export IDENTITY_MS_CERT_FILE="${CREDENTIALS_DIRECTORY}/identity_ms_cert"',
		);
		expect(start).toContain(
			'export IDENTITY_GOOGLE_SA_FILE="${CREDENTIALS_DIRECTORY}/identity_google_sa"',
		);
		expect(start).toContain(
			'export IDENTITY_MS_CLIENT_SECRET="$(cred identity_ms_client_secret || true)"',
		);
		// Start-Skript endet mit exec (set -e bricht an optionalen Zeilen nicht ab)
		expect(start.trim().split("\n").at(-1)).toMatch(/^exec /);
	});
});
