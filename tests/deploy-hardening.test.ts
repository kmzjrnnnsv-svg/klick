import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Server-Härtung (Plan Härtung, Teil H): jede systemd-Unit mit Sandbox, die
// Apps sehen einander nicht, SSH und DNS nur im Admin-Tunnel, Kernel-, Audit-
// und Update-Vorgaben liegen im Repo.

const ROOT = resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const lines = (text: string) =>
	text
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith("#"));

const UNIT_DIR = "deploy/systemd";
const services = readdirSync(resolve(ROOT, UNIT_DIR)).filter((f) =>
	f.endsWith(".service"),
);

// Für alle Dienste
const BASE = [
	"ProtectHome=",
	"PrivateTmp=yes",
	"ProtectKernelTunables=yes",
	"ProtectKernelModules=yes",
	"ProtectKernelLogs=yes",
	"ProtectControlGroups=yes",
	"ProtectClock=yes",
	"ProtectHostname=yes",
	"RestrictNamespaces=yes",
	"RestrictRealtime=yes",
	"LockPersonality=yes",
	"SystemCallArchitectures=native",
	"RestrictAddressFamilies=",
];
// Zusätzlich für alle außer dem Alarm (root, sendmail mit setgid, /dev/log)
const STRICT = [
	"NoNewPrivileges=yes",
	"ProtectSystem=strict",
	"PrivateDevices=yes",
	"RestrictSUIDSGID=yes",
	"CapabilityBoundingSet=",
	"SystemCallFilter=@system-service",
	"UMask=0077",
];
const LOOSE = new Set(["klick-alert@.service"]);

describe("systemd-Units", () => {
	it("gibt es (Liste nicht leer)", () => {
		expect(services.length).toBeGreaterThan(10);
	});

	for (const file of services) {
		it(`${file}: Pflichtsatz der Sandbox`, () => {
			const unit = lines(read(`${UNIT_DIR}/${file}`));
			const need = LOOSE.has(file) ? BASE : [...BASE, ...STRICT];
			const missing = need.filter((d) => !unit.some((l) => l.startsWith(d)));
			expect(missing, file).toEqual([]);
		});
	}

	it("Rechte nur, wo begründet (root-Dienste mit engem Bounding-Set)", () => {
		for (const file of services) {
			const unit = lines(read(`${UNIT_DIR}/${file}`));
			const caps = unit.find((l) => l.startsWith("CapabilityBoundingSet="));
			if (!caps || caps === "CapabilityBoundingSet=") continue;
			expect(
				[
					"klick-signer-backup.service",
					"klick-aide.service",
					"klick-health.service",
				],
				`${file} hat Rechte: ${caps}`,
			).toContain(file);
			expect(caps).not.toMatch(/CAP_SYS_ADMIN|CAP_SYS_PTRACE|CAP_SETUID/);
		}
	});

	it("Klick und both.money sehen einander nicht", () => {
		const klick = lines(read(`${UNIT_DIR}/klick.service`));
		const both = lines(read(`${UNIT_DIR}/both.service`));
		const hidden = (u: string[]) =>
			(u.find((l) => l.startsWith("InaccessiblePaths=")) ?? "")
				.slice("InaccessiblePaths=".length)
				.split(/\s+/)
				.map((p) => p.replace(/^-/, ""));
		expect(hidden(klick)).toEqual(
			expect.arrayContaining([
				"/opt/both",
				"/etc/both",
				"/var/lib/klick-signer",
			]),
		);
		expect(hidden(both)).toEqual(
			expect.arrayContaining([
				"/opt/klick",
				"/etc/klick",
				"/var/lib/klick-signer",
			]),
		);
		for (const u of [klick, both])
			expect(u).toContain("SystemCallErrorNumber=EPERM");
	});

	it("Prüf-Units: Fehler lösen den Alarm aus, Timer zeigen auf echte Dienste", () => {
		for (const name of ["klick-aide", "klick-health"]) {
			const svc = lines(read(`${UNIT_DIR}/${name}.service`));
			expect(svc).toContain("OnFailure=klick-alert@%n.service");
			expect(svc).toContain("Type=oneshot");
			const timer = lines(read(`${UNIT_DIR}/${name}.timer`));
			expect(timer.some((l) => l.startsWith("OnCalendar="))).toBe(true);
			expect(timer).toContain("Persistent=true");
		}
		const health = lines(read(`${UNIT_DIR}/klick-health.service`));
		// root-eigene Kopie, nie aus dem App-Checkout (den klick beschreiben kann)
		expect(health).toContain(
			"ExecStart=/usr/local/lib/klick-health/host-health.sh",
		);
		// Statusdatei für Admin > Betrieb: nur dieser Ordner schreibbar, die
		// App liest ihn nur (Gruppe klick)
		expect(health).toContain("ReadWritePaths=-/var/lib/klick-health");
		const app = lines(read(`${UNIT_DIR}/klick.service`));
		expect(app).toContain("ReadOnlyPaths=-/var/lib/klick-health");
		expect(app.join("\n")).not.toMatch(/ReadWritePaths=.*klick-health/);
	});
});

describe("nftables (App-Server)", () => {
	const nft = read("deploy/firewall.nft");
	const rules = lines(nft);

	it("eigene Tabelle, kein flush ruleset (CrowdSec-Tabellen bleiben)", () => {
		expect(rules).not.toContain("flush ruleset");
		expect(rules).toContain("add table inet klick");
		expect(rules).toContain("delete table inet klick");
	});

	it("Eingang standardmäßig zu, Weiterleiten aus", () => {
		expect(nft).toMatch(/hook input priority 0; policy drop;/);
		expect(nft).toMatch(/hook forward priority 0; policy drop;/);
	});

	it("öffentlich nur 80/443 und WireGuard; SSH und DNS nur im Admin-Tunnel", () => {
		const accepts = rules.filter((l) => l.endsWith("accept"));
		for (const l of accepts.filter((l) => /dport/.test(l))) {
			const ports = l.match(/dport\s+(\{[^}]+\}|\d+)/)?.[1] ?? "";
			const list = ports
				.replace(/[{}]/g, "")
				.split(",")
				.map((p) => p.trim());
			const admin = l.startsWith('iifname "wg-admin"');
			for (const port of list) {
				if (admin) expect(["22", "53"]).toContain(port);
				else expect(["80", "443", "51820"], l).toContain(port);
			}
		}
		expect(rules).toContain('iifname "wg-admin" tcp dport 22 accept');
	});

	it("Knoten-Server: SSH nur aus dem Tunnel vom App-Server", () => {
		const nodes = lines(read("deploy/wireguard/firewall-nodes.nft"));
		const ssh = nodes.filter((l) => /dport 22\b/.test(l));
		expect(ssh).toEqual([
			'iifname "wg0" ip saddr 10.8.0.1 tcp dport 22 accept',
		]);
	});
});

describe("SSH", () => {
	const conf = lines(read("deploy/ssh/sshd_config.d/10-klick.conf"));

	it("nur Sicherheitsschlüssel mit PIN, kein root, keine Passwörter", () => {
		for (const d of [
			"PermitRootLogin no",
			"PasswordAuthentication no",
			"KbdInteractiveAuthentication no",
			"AuthenticationMethods publickey",
			"PubkeyAcceptedAlgorithms sk-ssh-ed25519@openssh.com,sk-ecdsa-sha2-nistp256@openssh.com",
			"PubkeyAuthOptions verify-required touch-required",
			"X11Forwarding no",
			"AllowAgentForwarding no",
			"PermitTunnel no",
			"MaxAuthTries 3",
		])
			expect(conf).toContain(d);
	});

	it("nur aus dem Admin-Netz, Weiterleitung nur zum Knoten-Server", () => {
		const allow = conf.find((l) => l.startsWith("AllowUsers "));
		expect(allow).toBeDefined();
		for (const entry of allow?.split(/\s+/).slice(1) ?? [])
			expect(entry).toMatch(/@(10\.9\.0\.0\/24|fd10:9::\/64)$/);
		expect(conf).toContain("AllowTcpForwarding local");
		expect(conf).toContain("PermitOpen 10.8.0.2:22");
	});
});

describe("Kernel, Audit, Updates", () => {
	it("sysctl: kein Routing, Kernel-Zeiger und ptrace gesperrt", () => {
		const sysctl = lines(read("deploy/sysctl/99-klick.conf")).map((l) =>
			l.replace(/\s*=\s*/, "="),
		);
		for (const d of [
			"net.ipv4.ip_forward=0",
			"net.ipv6.conf.all.forwarding=0",
			"net.ipv4.conf.all.rp_filter=1",
			"net.ipv4.conf.all.accept_redirects=0",
			"net.ipv4.tcp_syncookies=1",
			"kernel.kptr_restrict=2",
			"kernel.dmesg_restrict=1",
			"kernel.yama.ptrace_scope=2",
			"kernel.unprivileged_bpf_disabled=1",
			"fs.suid_dumpable=0",
			"fs.protected_symlinks=1",
		])
			expect(sysctl).toContain(d);
	});

	it("auditd: Geheimnisse, Signer und Code bewacht, Regeln gesperrt", () => {
		const rules = lines(read("deploy/audit/klick.rules"));
		for (const key of [
			"credentials",
			"signer_state",
			"signer_code",
			"klick_code",
			"both_code",
			"sshd",
			"sudoers",
			"firewall",
		])
			expect(
				rules.some((l) => l.endsWith(`-k ${key}`)),
				key,
			).toBe(true);
		expect(rules.at(-1)).toBe("-e 2");
	});

	it("unattended-upgrades: nur Sicherheitsquellen, Neustart nachts", () => {
		const uu = read("deploy/apt/50unattended-upgrades");
		// biome-ignore lint/suspicious/noTemplateCurlyInString: apt-Variablen, kein JS-Template
		expect(uu).toContain('"${distro_id}:${distro_codename}-security";');
		expect(uu).not.toMatch(/codename}-updates"/);
		expect(uu).toContain('Unattended-Upgrade::Automatic-Reboot "true";');
		expect(read("deploy/apt/20auto-upgrades")).toContain(
			'APT::Periodic::Unattended-Upgrade "1";',
		);
	});

	it("Zustandsprüfung: ausführbar, prüft Platte, Zertifikate, Audit, Firewall, CrowdSec", () => {
		const path = "scripts/host-health.sh";
		expect(statSync(resolve(ROOT, path)).mode & 0o111).not.toBe(0);
		const sh = read(path);
		for (const s of [
			"df -P",
			"openssl x509 -checkend",
			"auditctl -s",
			"nft list table inet klick",
			"cscli decisions list",
			"list-units --state=failed",
		])
			expect(sh).toContain(s);
	});
});

describe("Postgres", () => {
	it("nur localhost, SCRAM, keine Parameter im Log", () => {
		const conf = lines(read("deploy/postgres/klick.conf"));
		for (const d of [
			"listen_addresses = 'localhost'",
			"password_encryption = scram-sha-256",
			"log_connections = on",
			"log_statement = 'ddl'",
			"log_parameter_max_length = 0",
		])
			expect(conf).toContain(d);
	});

	it("pg_hba: Apps nur über localhost mit SCRAM, Rest abgelehnt", () => {
		const hba = lines(read("deploy/postgres/pg_hba.conf.example")).map((l) =>
			l.split(/\s+/),
		);
		for (const row of hba) {
			const method = row.at(-1);
			if (row[0] === "host" && method !== "reject") {
				expect(["127.0.0.1/32", "::1/128"]).toContain(row[3]);
				expect(method).toBe("scram-sha-256");
			}
			if (row[0] === "local" && method !== "reject") {
				expect(row[2]).toBe("postgres");
				expect(method).toBe("peer");
			}
			expect(method).not.toMatch(/^(trust|md5|password)$/);
		}
		expect(hba.at(-1)?.at(-1)).toBe("reject");
	});
});
