import { execFileSync, spawnSync } from "node:child_process";
import {
	mkdirSync,
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

	it("Firewall: eigene und Sperrtabellen von CrowdSec/fail2ban sind nie „fremd“", () => {
		const bekannt = (fam: string, name: string) =>
			rein(`tabelle_bekannt ${fam} ${name} && echo ja || echo nein`).trim();
		expect(bekannt("inet", "klick")).toBe("ja");
		expect(bekannt("ip", "crowdsec")).toBe("ja");
		expect(bekannt("ip6", "crowdsec6")).toBe("ja");
		expect(bekannt("inet", "f2b-table")).toBe("ja");
		expect(bekannt("inet", "filter")).toBe("nein");
		expect(bekannt("ip", "nat")).toBe("nein");
		expect(read(`${DIR}/lib/netz.sh`)).toContain("tabelle_bekannt");
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

	it("gescheiterter Build: Phasen sichern .next vorher und spielen es zurück", () => {
		const apps = read(`${DIR}/lib/apps.sh`);
		const phase = (name: string, next: string) =>
			apps.slice(apps.indexOf(`${name}() {`), apps.indexOf(`${next}() {`));
		for (const [p, app, ordner] of [
			["phase_klick", "klick", '"$KLICK_DIR/.next"'],
			["phase_both", "both", '"$BOTH_DIR/apps/wallet/.next"'],
		] as const) {
			const body = phase(
				p,
				p === "phase_klick" ? "not_freigabe_aufraeumen" : "phase_signer",
			);
			const sichern = body.indexOf(`build_sichern ${ordner} "$alt"`);
			const release = body.indexOf("pnpm release");
			expect(sichern, p).toBeGreaterThan(0);
			expect(sichern, p).toBeLessThan(release);
			expect(body, p).toContain(`local alt="$SICHERUNG/next-${app}"`);
			expect(body, p).toMatch(
				new RegExp(
					`\\) \\|\\| build_gescheitert ${app} ${ordner.replace(/[$.]/g, "\\$&")} "\\$alt" http://127\\.0\\.0\\.1:30[01]0/api/ready`,
				),
			);
			// Sicherung liegt außerhalb des Checkouts (release-guard)
			expect(body, p).not.toMatch(/alt="\$(KLICK|BOTH)_DIR/);
		}
		const fn = apps.slice(apps.indexOf("build_gescheitert() {"));
		expect(fn.indexOf("build_zurueck")).toBeLessThan(
			fn.indexOf("systemctl restart"),
		);
		expect(fn).toContain("warte_bereit");
		expect(fn).toContain("die ");
	});

	it("Build-Sicherung: zurück kommt der alte Stand, cache bleibt", () => {
		const d = join(tmp, "next-probe");
		const next = join(d, ".next");
		const alt = join(d, "sicherung", "next-klick");
		const run = (s: string) =>
			execFileSync(
				"bash",
				[
					"-c",
					`set -euo pipefail; source ${DIR}/lib/rein.sh; source ${DIR}/lib/common.sh; ${s}`,
				],
				{
					cwd: ROOT,
					encoding: "utf8",
					env: { ...process.env, DEPLOY: "deploy", TROCKEN: "0" },
				},
			);
		run(
			`mkdir -p "${next}/static/chunks" "${next}/cache/images" "${next}/server" && echo alt > "${next}/static/chunks/a.js" && echo id1 > "${next}/BUILD_ID" && echo c > "${next}/cache/images/x"`,
		);
		run(`build_sichern "${next}" "${alt}"`);
		expect(readdirSync(alt).sort()).toEqual(["BUILD_ID", "server", "static"]);
		// so sieht .next nach einem abgebrochenen Build aus
		run(
			`rm -rf "${next}/static" "${next}/BUILD_ID" && mkdir -p "${next}/halb" && echo neu > "${next}/halb/b.js"`,
		);
		run(`build_zurueck "${next}" "${alt}"`);
		expect(readdirSync(next).sort()).toEqual([
			"BUILD_ID",
			"cache",
			"server",
			"static",
		]);
		expect(readFileSync(join(next, "static/chunks/a.js"), "utf8")).toBe(
			"alt\n",
		);
		expect(readFileSync(join(next, "cache/images/x"), "utf8")).toBe("c\n");
		// ohne Sicherung: Hinweis und Fehlerstatus, nichts gelöscht
		const r = spawnSync(
			"bash",
			[
				"-c",
				`set -euo pipefail; source ${DIR}/lib/rein.sh; source ${DIR}/lib/common.sh; build_zurueck "${next}" "${join(d, "fehlt")}"`,
			],
			{
				cwd: ROOT,
				encoding: "utf8",
				env: { ...process.env, DEPLOY: "deploy" },
			},
		);
		expect(r.status).toBe(1);
		expect(readdirSync(next)).toContain("static");
	});

	it("Sicherheits-Updates: früh im Lauf, sofort und danach täglich", () => {
		const main = read(`${DIR}/rollout.sh`);
		const phasen = main.slice(
			main.indexOf("PHASEN=("),
			main.indexOf(")", main.indexOf("PHASEN=(")),
		);
		expect(phasen).toMatch(/grundlage updates firewall/);
		const sys = read(`${DIR}/lib/system.sh`);
		const upd = sys.slice(
			sys.indexOf("phase_updates() {"),
			sys.indexOf("phase_system() {"),
		);
		expect(upd).toContain("$DEPLOY/apt/50unattended-upgrades");
		expect(upd).toContain("apt-daily-upgrade.timer");
		expect(upd).toMatch(/aendern unattended-upgrade -v \|\|/);
		expect(upd).toContain("/var/run/reboot-required");
		// die Apps startet needrestart nie selbst neu
		const nr = read("deploy/apt/needrestart-klick.conf");
		expect(nr).toContain("klick\\.service");
		expect(nr).toContain("both\\.service");
	});

	it("CrowdSec-Paketquelle ohne Installationsskript, mit signed-by", () => {
		const sys = read(`${DIR}/lib/system.sh`);
		expect(code(sys)).not.toContain("install.crowdsec.net");
		expect(sys).toContain(
			"deb [signed-by=%s] https://packagecloud.io/crowdsec/crowdsec/ubuntu/",
		);
	});

	it("Standorte: Agent aus dem root-eigenen Checkout, Units, Werte in klick.env", () => {
		const st = read(`${DIR}/lib/standorte.sh`);
		const phase = code(st.slice(st.indexOf("phase_standorte()")));
		expect(phase).toContain('cd "$ROOT_DIR"');
		expect(phase).toContain("pnpm -s build:netz-agent");
		expect(phase).toContain(
			'install -m 0444 -o root -g root "$ROOT_DIR/dist/netz-agent.mjs" /usr/local/lib/klick-netz/netz-agent.mjs',
		);
		expect(phase).not.toContain("/opt/klick/current");
		expect(phase).toContain(
			"units_einspielen klick-netz.socket klick-netz.service",
		);
		for (const k of [
			"SITE_AGENT_SOCKET=",
			"SITE_PUBLIC_IP=",
			"SITE_WG_PUBLIC_KEY=",
		])
			expect(phase).toContain(k);
		expect(phase).toContain("/etc/modules-load.d/klick-sites.conf");
		const main = read(`${DIR}/rollout.sh`);
		expect(main).toContain('. "$LIB/standorte.sh"');
		expect(main).toMatch(/EINZELN=\([^)]*standorte/);
	});

	it("Überwachung legt den Ordner der Statusdatei an (root schreibt, klick liest)", () => {
		const sys = read(`${DIR}/lib/system.sh`);
		const phase = sys.slice(sys.indexOf("phase_ueberwachung()"));
		expect(phase).toContain(
			"install -d -m 2750 -o root -g klick /var/lib/klick-health",
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
			"updates",
			"firewall-final",
			"wireguard",
			"virenscanner",
			"klick",
			"both",
			"signer",
			"abschluss",
			"ssh-schluessel",
			"standorte",
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
	it("öffentliche Ports mit Programm und Wirkung der Härtung", () => {
		// Ausgabe von `ss -tulnpH` auf raza.work (27.10.), gekürzt
		const ss = join(tmp, "ss.txt");
		writeFileSync(
			ss,
			[
				'tcp LISTEN 0 511 0.0.0.0:443 0.0.0.0:* users:(("nginx",pid=900,fd=8))',
				'tcp LISTEN 0 4096 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=800,fd=3))',
				'tcp LISTEN 0 511 *:3001 *:* users:(("node /home/nrpl",pid=1078,fd=26))',
				'tcp LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("next-server",pid=1100,fd=20))',
				"udp UNCONN 0 0 0.0.0.0:45426 0.0.0.0:*",
				'udp UNCONN 0 0 178.104.89.45%eth0:68 0.0.0.0:* users:(("systemd-network",pid=600,fd=22))',
				'tcp LISTEN 0 4096 10.9.0.1:22 0.0.0.0:* users:(("sshd",pid=800,fd=4))',
			].join("\n"),
		);
		const out = rein(`ports_bewerten < ${ss}`);
		expect(out).toContain("tcp 0.0.0.0:443 (nginx): bleibt offen (nginx)");
		expect(out).toContain(
			"tcp 0.0.0.0:22 (sshd): nach Phase ssh nur im Tunnel",
		);
		expect(out).toContain(
			"tcp *:3001 (node /home/nrpl): nach Phase firewall von außen zu",
		);
		expect(out).toContain(
			"udp 0.0.0.0:45426 (Kernel): nach Phase firewall von außen zu",
		);
		expect(out).toContain("(systemd-network): DHCP, bleibt");
		// localhost und Admin-Netz sind nicht öffentlich
		expect(out).not.toContain("3000");
		expect(out).not.toContain("10.9.0.1");
	});

	it("nginx: default_server auch hinter den Links in sites-enabled finden", () => {
		const sys = read(`${DIR}/lib/system.sh`);
		const fn = sys.slice(sys.indexOf("phase_nginx() {"));
		expect(fn).toContain(
			"grep -RlE 'default_server' /etc/nginx/sites-enabled/",
		);
		expect(fn).not.toMatch(/grep -rl/);
	});

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

	it("GitHub-Repo aus der origin-Adresse", () => {
		for (const url of [
			"https://github.com/kmzjrnnnsv-svg/klick.git",
			"https://github.com/kmzjrnnnsv-svg/klick",
			"git@github.com:kmzjrnnnsv-svg/klick.git",
		])
			expect(rein(`release_repo "${url}"`), url).toBe("kmzjrnnnsv-svg/klick");
		for (const url of [
			"https://gitlab.com/a/b.git",
			"https://github.com/a/b/c",
			"https://github.com/a;rm/b",
			"",
		])
			expect(rein(`release_repo "${url}"`), url).toBe("");
	});
});

describe("Release-Artefakt (ADR-034)", () => {
	const apps = read(`${DIR}/lib/apps.sh`);
	const fn = (name: string) => {
		const start = apps.indexOf(`${name}() {`);
		return apps.slice(start, apps.indexOf("\n}\n", start));
	};
	const phase = (name: string, next: string) =>
		apps.slice(apps.indexOf(`${name}() {`), apps.indexOf(`${next}() {`));

	it("Phasen holen zuerst das Artefakt, bauen nur als Rückfall", () => {
		for (const [p, next, app, ordner, rel] of [
			["phase_klick", "not_freigabe_aufraeumen", "klick", "KLICK_DIR", ".next"],
			["phase_both", "phase_signer", "both", "BOTH_DIR", "apps/wallet/.next"],
		] as const) {
			const body = phase(p, next);
			const holen = body.indexOf(
				`artefakt_holen ${app} "$${ordner}" "$quelle" && artefakt=1`,
			);
			expect(holen, p).toBeGreaterThan(0);
			expect(holen, p).toBeLessThan(body.indexOf("build_sichern"));
			expect(holen, p).toBeLessThan(body.indexOf("pnpm release"));
			expect(body, p).toContain(
				`release_vorbereiten ${app} "$${ordner}" release:${app === "both" ? "wallet:" : ""}prepare`,
			);
			expect(body, p).toContain(
				`artefakt_einsetzen ${app} "$${ordner}" "$quelle" ${rel}`,
			);
			// Rückfall: Build-Cache danach weg (≈ 1 GB)
			expect(body, p).toContain(`build_cache_weg "$${ordner}/${rel}"`);
			// startet der neue Stand nicht, kommt der alte zurück
			const zurueck = body.indexOf(`artefakt_zurueck "$${ordner}" ${rel}`);
			expect(zurueck, p).toBeGreaterThan(body.indexOf("warte_bereit"));
			expect(body, p).toContain("artefakt_aufraeumen");
		}
		expect(phase("phase_klick", "not_freigabe_aufraeumen")).toContain(
			'"$quelle" .next dist/parse-worker.mjs',
		);
		// Klick hält both.money nur für einen Build auf dem Server an
		const klick = phase("phase_klick", "not_freigabe_aufraeumen");
		expect(klick.indexOf("platz_fuer_build")).toBeGreaterThan(
			klick.indexOf("artefakt_holen"),
		);
	});

	it("rote oder laufende CI bricht ab, nur ein fehlendes Artefakt fragt nach", () => {
		const f = fn("artefakt_holen");
		expect(f).toContain('--token-datei "$GITHUB_TOKEN_DATEI"');
		expect(f).toMatch(/4\) die "CI für .* ist rot/);
		expect(f).toMatch(/5\) die "CI für .* läuft noch/);
		expect(f).toMatch(/\*\) die "Artefakt für .* nicht bestanden/);
		// gefragt wird nur bei fehlendem Token oder fehlendem Artefakt
		expect(f.match(/frage "/g)).toHaveLength(2);
		// der Token wird nie gelesen oder weitergegeben, nur der Pfad
		expect(code(f)).not.toMatch(
			/cat\s+"?\$GITHUB_TOKEN_DATEI|<\s*"?\$GITHUB_TOKEN_DATEI/,
		);
		expect(read(`${DIR}/lib/common.sh`)).toContain(
			"GITHUB_TOKEN_DATEI=/etc/klick-release/github-token",
		);
		expect(read(`${DIR}/rollout.sh`)).toContain("--bauen) BAUEN=1 ;;");
	});

	it("Löschen nur mit geschützten Pfaden", () => {
		for (const name of [
			"artefakt_holen",
			"artefakt_einsetzen",
			"artefakt_zurueck",
			"artefakt_aufraeumen",
			"build_cache_weg",
		])
			for (const m of code(fn(name)).matchAll(/rm -rf -- ([^\n;]+)/g))
				for (const target of m[1]?.trim().split(/\s+/) ?? [])
					expect(target, `${name}: ${target}`).toMatch(/^"\$\{[A-Za-z_]+:\?\}/);
	});

	it("Einsetzen tauscht .next, behält den Cache, und zurück geht es auch", () => {
		const d = join(tmp, "einsetzen");
		const app = join(d, "app");
		const quelle = join(d, "quelle");
		const sh = (s: string) =>
			execFileSync(
				"bash",
				[
					"-c",
					`set -euo pipefail; source ${DIR}/lib/rein.sh; source ${DIR}/lib/common.sh; source ${DIR}/lib/apps.sh; ${s}`,
				],
				{
					cwd: ROOT,
					encoding: "utf8",
					env: { ...process.env, DEPLOY: "deploy", TROCKEN: "0" },
				},
			);
		sh(
			`mkdir -p "${app}/.next/cache/images" "${quelle}/.next/static" "${quelle}/dist" && echo alt > "${app}/.next/BUILD_ID" && echo bild > "${app}/.next/cache/images/x" && echo neu > "${quelle}/.next/BUILD_ID" && echo p > "${quelle}/dist/parse-worker.mjs"`,
		);
		const out = sh(
			`artefakt_einsetzen "$(id -un)" "${app}" "${quelle}" .next dist/parse-worker.mjs; printf '%s' "$ARTEFAKT_ALT" > "${d}/alt"; artefakt_zurueck "${app}" .next && echo zurueck`,
		);
		expect(out).toContain("zurueck");
		// nach dem Zurückspielen: alter Stand, Cache liegt beim abgelösten neuen
		expect(readFileSync(join(app, ".next/BUILD_ID"), "utf8")).toBe("alt\n");
		expect(readFileSync(join(app, ".next.neu/BUILD_ID"), "utf8")).toBe("neu\n");
		expect(readFileSync(join(app, "dist/parse-worker.mjs"), "utf8")).toBe(
			"p\n",
		);
		expect(readFileSync(join(d, "alt"), "utf8")).toBe(join(app, ".next.alt"));
		expect(() => statSync(quelle)).toThrow();
		// erneut einsetzen, dann aufräumen: neu bleibt, Cache wandert mit
		sh(
			`mkdir -p "${quelle}/.next" "${quelle}/dist" && echo neu2 > "${quelle}/.next/BUILD_ID" && echo p2 > "${quelle}/dist/parse-worker.mjs"`,
		);
		sh(
			`mkdir -p "${app}/.next/cache/images" && echo bild > "${app}/.next/cache/images/x"; artefakt_einsetzen "$(id -un)" "${app}" "${quelle}" .next dist/parse-worker.mjs; artefakt_aufraeumen`,
		);
		expect(readFileSync(join(app, ".next/BUILD_ID"), "utf8")).toBe("neu2\n");
		expect(readFileSync(join(app, ".next/cache/images/x"), "utf8")).toBe(
			"bild\n",
		);
		expect(() => statSync(join(app, ".next.alt"))).toThrow();
		// ohne BUILD_ID im Artefakt: Abbruch, nichts getauscht
		mkdirSync(join(quelle, ".next"), { recursive: true });
		const r = spawnSync(
			"bash",
			[
				"-c",
				`set -euo pipefail; source ${DIR}/lib/rein.sh; source ${DIR}/lib/common.sh; source ${DIR}/lib/apps.sh; artefakt_einsetzen "$(id -un)" "${app}" "${quelle}" .next`,
			],
			{
				cwd: ROOT,
				encoding: "utf8",
				env: { ...process.env, DEPLOY: "deploy" },
			},
		);
		expect(r.status).toBe(1);
		expect(readFileSync(join(app, ".next/BUILD_ID"), "utf8")).toBe("neu2\n");
	});
});
