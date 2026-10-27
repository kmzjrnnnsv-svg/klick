import { execFileSync, spawnSync } from "node:child_process";
import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// Rollout-Skript (deploy/rollout): führt das Runbook „Server härten“, die
// Releases und den Signer aus. Hier: Form der Dateien, Sicherheitsregeln
// (kein Geheimnis in argv/Protokoll, Rückweg vor Netz-Änderungen) und die
// reinen Hilfen in lib/rein.sh über bash.

const ROOT = resolve(import.meta.dirname, "..");
const DIR = "deploy/rollout";
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const files = [
	`${DIR}/rollout.sh`,
	...readdirSync(resolve(ROOT, DIR, "lib"))
		.filter((f) => f.endsWith(".sh"))
		.map((f) => `${DIR}/lib/${f}`),
];
const code = (text: string) =>
	text
		.split("\n")
		.filter((l) => !l.trim().startsWith("#"))
		.join("\n");

// Reine Hilfe aus lib/rein.sh in bash aufrufen
function rein(script: string): string {
	return execFileSync(
		"bash",
		["-c", `set -euo pipefail; source ${DIR}/lib/rein.sh; ${script}`],
		{ cwd: ROOT, encoding: "utf8", env: { ...process.env, DEPLOY: "deploy" } },
	);
}

const tmp = mkdtempSync(join(tmpdir(), "rollout-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("Dateien", () => {
	it("bash-Syntax, strikter Kopf, Einstieg ausführbar", () => {
		expect(files.length).toBeGreaterThanOrEqual(6);
		for (const f of files) {
			const text = read(f);
			expect(text.startsWith("#!/usr/bin/env bash\n"), f).toBe(true);
			expect(text, f).toContain("set -euo pipefail");
			execFileSync("bash", ["-n", resolve(ROOT, f)]);
		}
		expect(statSync(resolve(ROOT, DIR, "rollout.sh")).mode & 0o111).not.toBe(0);
	});

	it("kein set -x, kein eval, kein Skript aus dem Netz in eine Shell", () => {
		for (const f of files) {
			const c = code(read(f));
			expect(c, f).not.toMatch(/\bset -x\b|set -o xtrace/);
			expect(c, f).not.toMatch(/\beval\b/);
			expect(c, f).not.toMatch(/curl[^\n|]*\|\s*(ba)?sh\b/);
			expect(c, f).not.toMatch(/wget[^\n|]*\|\s*(ba)?sh\b/);
		}
	});

	it("jeder genannte deploy/-Pfad existiert", () => {
		const all = files.map(read).join("\n");
		const paths = new Set<string>();
		for (const m of all.matchAll(/\$DEPLOY\/([A-Za-z0-9_./@-]+)/g)) {
			const p = m[1].replace(/[.]$/, "");
			if (p.includes("*")) continue;
			paths.add(`deploy/${p}`);
		}
		for (const m of all.matchAll(/\$ROOT_DIR\/(scripts\/[A-Za-z0-9_.-]+)/g))
			paths.add(m[1]);
		expect(paths.size).toBeGreaterThan(20);
		for (const p of paths)
			expect(() => statSync(resolve(ROOT, p)), p).not.toThrow();
	});

	it("Netz-Änderungen stellen vorher einen Rückweg scharf", () => {
		const netz = read(`${DIR}/lib/netz.sh`);
		const fw = netz.slice(netz.indexOf("firewall_einspielen() {"));
		expect(fw.indexOf("rueckweg firewall")).toBeGreaterThan(0);
		expect(fw.indexOf("rueckweg firewall")).toBeLessThan(
			fw.indexOf("systemctl reload nftables"),
		);
		const ssh = netz.slice(netz.indexOf("sshd_einspielen() {"));
		expect(ssh.indexOf("rueckweg ssh")).toBeGreaterThan(0);
		expect(ssh.indexOf("rueckweg ssh")).toBeLessThan(
			ssh.indexOf("systemctl reload ssh"),
		);
		// Bestätigung für Tunnel-Schritte nur aus dem Admin-Netz
		expect(netz).toMatch(/bestaetigung_abwarten ssh tunnel/);
		expect(netz).toMatch(/bestaetigung_abwarten firewall tunnel/);
		expect(netz).toContain("im_admin_netz");
	});

	it("Geheimnisse: WireGuard-Geräte nur ans Terminal, Passwörter nie in argv", () => {
		const netz = read(`${DIR}/lib/netz.sh`);
		const geraet = netz.slice(
			netz.indexOf("wg_geraet() {"),
			netz.indexOf("phase_wireguard() {"),
		);
		expect(geraet).toContain("} >/dev/tty");
		expect(geraet).not.toMatch(/<<<\s*"\$cfg"/);
		const sys = read(`${DIR}/lib/system.sh`);
		// SQL mit Passwort über stdin, Anweisung nicht im Postgres-Log
		expect(sys).toContain("SET log_statement = \\x27none\\x27;");
		expect(sys).toContain("| pg_sql -f -");
		expect(sys).not.toMatch(/psql[^\n]*PASSWORD/);
		// Bouncer-Schlüssel über die Umgebung, nicht über sed/argv
		expect(sys).toContain('KV_WERT="$(cscli bouncers add klick-nginx -o raw)"');
		// Env-Dateien (Schlüssel wie BREVO_API_KEY) ohne diff ins Protokoll
		const envWrites = sys.match(/schreibe_inhalt "\$env"[^\n]*/g) ?? [];
		expect(envWrites.length).toBeGreaterThanOrEqual(2);
		for (const w of envWrites) expect(w).toMatch(/ geheim$/);
	});

	it("startet nur als root aus einem root-eigenen Checkout", () => {
		const main = read(`${DIR}/rollout.sh`);
		expect(main).toContain('[ "$(id -u)" = 0 ] || die');
		expect(main).toContain('pfad_sicher "$ROOT_DIR/deploy/rollout"');
		expect(main).toContain("! -user root -o -perm -g+w -o -perm -o+w");
		expect(main).toContain("flock -n 9");
		// Skripte für root kommen aus dem eigenen Checkout, nie aus dem App-Ordner
		const apps = read(`${DIR}/lib/apps.sh`);
		expect(apps).toContain('"$ROOT_DIR/scripts/backup-db.sh"');
		expect(apps).not.toMatch(/\$KLICK_DIR\/scripts\//);
		expect(apps).toContain('RELEASE_ALLOWED_SIGNERS="$ANKER"');
		expect(apps).toContain("gpg.ssh.program=ssh-keygen");
	});

	it("Phase klick räumt die Not-Freigabe nach der neuen Unit auf, mit Rückweg", () => {
		const apps = read(`${DIR}/lib/apps.sh`);
		const klick = apps.slice(
			apps.indexOf("phase_klick() {"),
			apps.indexOf("phase_both() {"),
		);
		const unit = klick.indexOf("units_einspielen klick.service");
		const auf = klick.indexOf("not_freigabe_aufraeumen");
		expect(unit).toBeGreaterThan(0);
		expect(auf).toBeGreaterThan(unit);
		expect(auf).toBeLessThan(klick.indexOf("systemctl restart klick"));
		// startet Klick nicht, kommt die alte Freigabe vor dem Abbruch zurück
		const zurueck = klick.indexOf("not_freigabe_zurueck");
		expect(zurueck).toBeGreaterThan(klick.indexOf("warte_bereit"));
		expect(zurueck).toBeLessThan(klick.indexOf("Klick startet nicht"));
		const fn = apps.slice(apps.indexOf("not_freigabe_aufraeumen() {"));
		expect(fn).toContain('risiken_nach_update "$env" "$NOTFREIGABE"');
		expect(fn).toContain('sichern "$NOTFREIGABE"');
		expect(fn).toContain('aendern rm -f "$NOTFREIGABE"');
		expect(fn).toMatch(/schreibe_inhalt "\$env" 0600 root:root geheim/);
		expect(read(`${DIR}/lib/common.sh`)).toContain(
			"NOTFREIGABE=/etc/systemd/system/klick.service.d/risiken.conf",
		);
		// Virenscanner rechnet vom wirksamen Wert aus, inklusive Not-Freigabe
		expect(read(`${DIR}/lib/system.sh`)).toContain(
			'dropin_wert "$NOTFREIGABE" PROD_ACCEPT_RISKS',
		);
	});

	it("CrowdSec-Paketquelle ohne Installationsskript, mit signed-by", () => {
		const sys = read(`${DIR}/lib/system.sh`);
		expect(code(sys)).not.toContain("install.crowdsec.net");
		expect(sys).toContain(
			"deb [signed-by=%s] https://packagecloud.io/crowdsec/crowdsec/ubuntu/",
		);
	});
});

describe("Aufruf", () => {
	const run = (...args: string[]) =>
		spawnSync(resolve(ROOT, DIR, "rollout.sh"), args, { encoding: "utf8" });

	it("--hilfe listet alle Phasen", () => {
		const r = run("--hilfe");
		expect(r.status).toBe(0);
		for (const p of [
			"pruefen",
			"grundlage",
			"firewall-final",
			"wireguard",
			"virenscanner",
			"klick",
			"both",
			"signer",
			"abschluss",
			"ssh-schluessel",
			"bestaetigen",
		])
			expect(r.stdout).toContain(p);
	});

	it("Bedienfehler enden mit 2", () => {
		expect(run("quatsch").status).toBe(2);
		expect(run().status).toBe(2);
		expect(run("pruefen", "--admin", "Root Name").status).toBe(2);
		expect(run("alles", "--ab", "nix").status).toBe(2);
		expect(run("klick", "--ref", "a b").status).toBe(2);
	});
});

describe("reine Hilfen", () => {
	it("Virenscanner nach Arbeitsspeicher", () => {
		expect(rein("virenscanner_entscheidung 3900000").trim()).toBe("no_av");
		expect(rein("virenscanner_entscheidung 7900000").trim()).toBe("clamd");
		expect(rein("virenscanner_entscheidung 16000000").trim()).toBe("clamd");
	});

	it("PROD_ACCEPT_RISKS zusammenführen", () => {
		expect(rein('risks_merge "" add no_av').trim()).toBe("no_av");
		expect(rein('risks_merge "mail_us, no_av" add no_av').trim()).toBe(
			"mail_us,no_av",
		);
		expect(
			rein('risks_merge "no_av,parser_in_app,no_av" remove no_av').trim(),
		).toBe("parser_in_app");
	});

	it("Not-Freigabe lesen und nach dem Update ohne admin_anywhere übernehmen", () => {
		const dropin = join(tmp, "risiken.conf");
		const env = join(tmp, "klick-notfall.env");
		const fehlt = join(tmp, "fehlt.conf");
		writeFileSync(
			dropin,
			"[Service]\nEnvironment=PROD_ACCEPT_RISKS=no_av,admin_anywhere\n",
		);
		expect(rein(`dropin_wert ${dropin} PROD_ACCEPT_RISKS`)).toBe(
			"no_av,admin_anywhere",
		);
		expect(rein(`dropin_wert ${fehlt} PROD_ACCEPT_RISKS`)).toBe("");
		writeFileSync(
			join(tmp, "mehr.conf"),
			'[Service]\n# Environment=PROD_ACCEPT_RISKS=mail_us\nEnvironment="LOG_LEVEL=debug" "PROD_ACCEPT_RISKS=no_av"\n',
		);
		expect(
			rein(`dropin_wert ${join(tmp, "mehr.conf")} PROD_ACCEPT_RISKS`),
		).toBe("no_av");
		writeFileSync(
			join(tmp, "leer.conf"),
			"[Service]\nEnvironment=PROD_ACCEPT_RISKS=no_av\nEnvironment=\n",
		);
		expect(
			rein(`dropin_wert ${join(tmp, "leer.conf")} PROD_ACCEPT_RISKS`),
		).toBe("");
		expect(
			rein('risks_union "mail_us,no_av" "no_av, admin_anywhere"').trim(),
		).toBe("mail_us,no_av,admin_anywhere");
		expect(rein('risks_union "" ""').trim()).toBe("");

		// Störung vom 27.10.: Drop-in und angehängte Zeile in klick.env
		writeFileSync(
			env,
			"BREVO_API_KEY=x\nPROD_ACCEPT_RISKS=no_av,admin_anywhere\n",
		);
		expect(rein(`risiken_nach_update ${env} ${dropin}`).trim()).toBe("no_av");
		expect(rein(`risiken_nach_update ${fehlt} ${dropin}`).trim()).toBe("no_av");
		writeFileSync(env, "PROD_ACCEPT_RISKS=mail_us\n");
		expect(rein(`risiken_nach_update ${env} ${fehlt}`).trim()).toBe("mail_us");
		expect(rein(`risiken_nach_update ${env} ${dropin}`).trim()).toBe(
			"mail_us,no_av",
		);
		// klick.env leert das Admin-Netz ausdrücklich: Freigabe bleibt
		writeFileSync(env, "ADMIN_NETWORKS=\n");
		expect(rein(`risiken_nach_update ${env} ${dropin}`).trim()).toBe(
			"no_av,admin_anywhere",
		);
		// eigenes Admin-Netz in klick.env: admin_anywhere fällt weg
		writeFileSync(env, "ADMIN_NETWORKS=10.20.0.0/24\n");
		expect(rein(`risiken_nach_update ${env} ${dropin}`).trim()).toBe("no_av");
	});

	it("verwalteter Env-Block: idempotent, fremde Zeilen bleiben, ein Wert gilt", () => {
		const env = join(tmp, "klick.env");
		writeFileSync(env, "BREVO_API_KEY=x\nPROD_ACCEPT_RISKS=no_av\n# Notiz\n");
		const eins = rein(
			`env_block_render ${env} PROD_ACCEPT_RISKS=mail_us CLAMD_HOST=127.0.0.1`,
		);
		expect(eins).toContain("BREVO_API_KEY=x\n");
		expect(eins).toContain("# rollout: PROD_ACCEPT_RISKS=no_av\n");
		expect(eins).toContain("# Notiz\n");
		expect(eins.match(/^PROD_ACCEPT_RISKS=/gm)).toHaveLength(1);
		writeFileSync(env, eins);
		expect(rein(`env_wert ${env} PROD_ACCEPT_RISKS`)).toBe("mail_us");
		expect(
			rein(
				`env_block_render ${env} PROD_ACCEPT_RISKS=mail_us CLAMD_HOST=127.0.0.1`,
			),
		).toBe(eins);
		const ohne = rein(`env_block_render ${env} CLAMD_HOST=`);
		expect(ohne).not.toMatch(/^CLAMD_HOST=/m);
		expect(ohne).toMatch(/^PROD_ACCEPT_RISKS=mail_us$/m);
		expect(() => rein(`env_block_render ${env} 'kaputt=1'`)).toThrow();
	});

	it("nächste freie Adresse im Admin-Netz", () => {
		const conf = join(tmp, "wg-admin.conf");
		writeFileSync(conf, "[Interface]\nAddress = 10.9.0.1/24\n");
		expect(rein(`naechste_adresse ${conf}`).trim()).toBe("10");
		writeFileSync(
			conf,
			"[Peer]\nAllowedIPs = 10.9.0.10/32, fd10:9::10/128\n[Peer]\nAllowedIPs = 10.9.0.23/32\n",
		);
		expect(rein(`naechste_adresse ${conf}`).trim()).toBe("24");
		expect(rein(`naechste_adresse ${join(tmp, "fehlt")}`).trim()).toBe("10");
	});

	it("Firewall: öffentliches SSH nur im Übergang", () => {
		const ueber = rein("render_firewall uebergang");
		const final = rein("render_firewall final");
		const sshOffen = /^\s*tcp dport 22 ct state new limit rate/m;
		expect(ueber).toMatch(sshOffen);
		expect(final).not.toMatch(sshOffen);
		expect(final).toBe(read("deploy/firewall.nft"));
		// sonst unverändert
		expect(ueber.split("\n").filter((l) => !l.includes("@rollout"))).toEqual(
			final.split("\n").filter((l) => !l.includes("@rollout")),
		);
	});

	it("sshd: Tunnel-Modus ohne Sicherheitsschlüssel-Pflicht, Admin eingesetzt", () => {
		const tunnel = rein("render_sshd tunnel alice");
		const voll = rein("render_sshd schluessel alice");
		expect(tunnel).toMatch(
			/^AllowUsers alice@10\.9\.0\.0\/24 alice@fd10:9::\/64$/m,
		);
		expect(tunnel).not.toContain("<admin>");
		expect(tunnel).not.toMatch(/^PubkeyAcceptedAlgorithms /m);
		expect(tunnel).not.toMatch(/^PubkeyAuthOptions /m);
		expect(tunnel).toMatch(/^PermitRootLogin no$/m);
		expect(tunnel).toMatch(/^PasswordAuthentication no$/m);
		expect(voll).toMatch(
			/^PubkeyAcceptedAlgorithms sk-ssh-ed25519@openssh\.com/m,
		);
		expect(() => rein("render_sshd tunnel 'root; rm'")).toThrow();
	});

	it("Admin-Netz erkennen", () => {
		expect(rein("im_admin_netz 10.9.0.10 && echo ja").trim()).toBe("ja");
		expect(rein("im_admin_netz fd10:9::12 && echo ja").trim()).toBe("ja");
		expect(rein("im_admin_netz 203.0.113.5 || echo nein").trim()).toBe("nein");
		expect(rein("im_admin_netz 10.9.1.10 || echo nein").trim()).toBe("nein");
	});
});
