import { describe, expect, it } from "vitest";
import { EgressMonitor } from "@/lib/dlp/egress";
import { findOrphans, purgeAfter } from "@/lib/jobs/storage";
import { parseTombstone, tombstoneKey } from "@/lib/storage/tombstones";

const ORG = "11111111-1111-4111-8111-111111111111";
const EV = "22222222-2222-4222-8222-222222222222";

describe("Purge-Frist und Waisen", () => {
	it("Frist = Backup-Aufbewahrung", () => {
		const now = new Date("2026-10-16T12:00:00Z");
		expect(purgeAfter(now, 30).toISOString()).toBe("2026-11-15T12:00:00.000Z");
	});

	it("Waisen: nicht referenziert, nicht eingereiht, älter als die Schonfrist", () => {
		const now = new Date("2026-10-16T12:00:00Z");
		const old = new Date("2026-10-10T00:00:00Z");
		const fresh = new Date("2026-10-16T11:00:00Z");
		const objects = [
			{ key: "org/a/nachweise/1", lastModified: old },
			{ key: "org/a/nachweise/2", lastModified: old },
			{ key: "org/a/nachweise/3", lastModified: old },
			{ key: "org/a/nachweise/4", lastModified: fresh },
		];
		expect(
			findOrphans(
				objects,
				new Set(["org/a/nachweise/1"]),
				new Set(["org/a/nachweise/2"]),
				now,
			),
		).toEqual(["org/a/nachweise/3"]);
	});
});

describe("Tombstones", () => {
	it("Schlüssel und Roundtrip", () => {
		const t = {
			kind: "evidence" as const,
			orgId: ORG,
			id: EV,
			deletedAt: "2026-10-16T12:00:00.000Z",
		};
		expect(tombstoneKey(t)).toBe(`tombstones/evidence/${ORG}/${EV}.json`);
		expect(parseTombstone(JSON.stringify(t))).toEqual(t);
		expect(
			tombstoneKey({ kind: "organization", orgId: ORG, deletedAt: "x" }),
		).toBe(`tombstones/organization/${ORG}.json`);
	});

	it("ungültige Inhalte werden verworfen", () => {
		expect(parseTombstone("{")).toBeNull();
		expect(
			parseTombstone(JSON.stringify({ kind: "evidence", orgId: ORG })),
		).toBeNull();
		expect(
			parseTombstone(
				JSON.stringify({ kind: "organization", orgId: "../x", deletedAt: "y" }),
			),
		).toBeNull();
	});
});

describe("Abfluss-Überwachung", () => {
	it("drosselt über der Schwelle und alarmiert einmal je Fenster", () => {
		const m = new EgressMonitor();
		const t0 = 1_000_000;
		for (let i = 0; i < 3; i++)
			expect(m.record("org:u", 3, 60_000, t0 + i).allowed).toBe(true);
		const first = m.record("org:u", 3, 60_000, t0 + 10);
		expect(first).toMatchObject({ allowed: false, alert: true });
		expect(m.record("org:u", 3, 60_000, t0 + 20)).toMatchObject({
			allowed: false,
			alert: false,
		});
		// andere Person unberührt
		expect(m.record("org:v", 3, 60_000, t0 + 20).allowed).toBe(true);
		// nach dem Fenster wieder frei
		expect(m.record("org:u", 3, 60_000, t0 + 70_000).allowed).toBe(true);
	});
});
