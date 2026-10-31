import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	HOST_STATUS_MAX_BYTES,
	hostChecks,
	hostLevel,
	parseHostStatus,
	WATCHED_SERVICES,
	WATCHED_UNITS,
} from "@/lib/admin/host-status";
import de from "@/messages/de.json";

const raw = readFileSync("tests/fixtures/host-status.json", "utf8");
const now = new Date("2026-10-31T12:30:00Z");
const by = (s: NonNullable<ReturnType<typeof parseHostStatus>>, d = now) =>
	new Map(hostChecks(s, d).map((c) => [c.key, c]));

describe("Server-Status (klick-health)", () => {
	it("liest die Beispieldatei, alles in Ordnung", () => {
		const s = parseHostStatus(raw);
		expect(s).not.toBeNull();
		if (!s) return;
		const c = by(s);
		expect(c.get("fresh")?.level).toBe("ok");
		expect(c.get("disk")?.values).toEqual({ mount: "/var", pct: 63 });
		expect(c.get("services")?.level).toBe("ok");
		// nicht installierte oder abgeschaltete Dienste zählen nicht
		expect(c.get("services")?.values.total).toBe(6);
		expect(c.get("certs")?.values.name).toBe("both.money");
		expect(c.get("backup")?.level).toBe("ok");
		expect(hostLevel(s, now)).toBe("ok");
	});

	it("lehnt Unsinn ab: kein JSON, falsche Version, zu groß, Felder außerhalb der Grenzen", () => {
		const json = JSON.parse(raw) as Record<string, unknown>;
		const variant = (patch: Record<string, unknown>) =>
			JSON.stringify({ ...json, ...patch });
		expect(parseHostStatus("nicht json")).toBeNull();
		expect(parseHostStatus(variant({ version: 2 }))).toBeNull();
		expect(parseHostStatus(" ".repeat(HOST_STATUS_MAX_BYTES + 1))).toBeNull();
		expect(
			parseHostStatus(variant({ disks: [{ mount: "/", usedPct: 400 }] })),
		).toBeNull();
		expect(parseHostStatus(variant({ checkedAt: "gestern" }))).toBeNull();
		expect(
			parseHostStatus(variant({ problems: ["x".repeat(301)] })),
		).toBeNull();
	});

	it("alte Datei, volle Platte, Dienst aus, Zertifikat bald ab, Sicherung alt", () => {
		const s = parseHostStatus(raw);
		if (!s) throw new Error("fixture");
		const bad = {
			...s,
			checkedAt: new Date("2026-10-31T03:00:00Z"),
			disks: [{ mount: "/", usedPct: 92 }],
			services: [{ name: "klick", active: "failed", enabled: "enabled" }],
			certs: [
				{ name: "raza.work", notAfter: new Date("2026-11-05T00:00:00Z") },
			],
			units: [
				{
					name: "klick-backup-db",
					result: "success",
					at: new Date("2026-10-29T02:00:00Z"),
				},
			],
			rebootRequired: true,
		};
		const c = by(bad);
		expect(c.get("fresh")?.level).toBe("bad");
		expect(c.get("disk")?.level).toBe("bad");
		expect(c.get("services")?.values.down).toBe("klick");
		expect(c.get("certs")?.level).toBe("bad");
		expect(c.get("backup")?.level).toBe("bad");
		expect(c.get("reboot")?.level).toBe("warn");
		expect(hostLevel(bad, now)).toBe("bad");
	});

	it("gemeldete Probleme machen den Stand rot", () => {
		const s = parseHostStatus(raw);
		if (!s) throw new Error("fixture");
		expect(hostLevel({ ...s, problems: ["auditd läuft nicht"] }, now)).toBe(
			"bad",
		);
		expect(hostLevel(null, now)).toBe("unknown");
	});

	it("Skript und App kennen dieselben Dienste und Läufe", () => {
		const sh = readFileSync("scripts/host-health.sh", "utf8");
		for (const name of WATCHED_SERVICES) expect(sh).toContain(name);
		for (const name of Object.keys(WATCHED_UNITS)) expect(sh).toContain(name);
		expect(sh).toContain('{"version":1,');
		expect(sh).toContain("chmod 0640");
		expect(sh).toContain('mv -f "$tmp" "$STATUS_FILE"');
	});

	it("jede Prüfung hat einen Text", () => {
		const s = parseHostStatus(raw);
		if (!s) throw new Error("fixture");
		const keys = Object.keys(de.AdminOps);
		for (const c of hostChecks(s, now))
			expect(keys).toContain(`check_${c.key}`);
	});
});
