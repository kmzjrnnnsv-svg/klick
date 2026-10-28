import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_NAV, activeAdminHref, adminNavItems } from "@/lib/admin/nav";
import {
	ANCHOR_STALE_MS,
	buildOverview,
	type OverviewInput,
} from "@/lib/admin/overview";
import type { GrantLike } from "@/lib/platform-access/rules";
import de from "@/messages/de.json";

const NOW = new Date("2026-10-28T12:00:00Z");
const H = 60 * 60 * 1000;

const base = (over: Partial<OverviewInput> = {}): OverviewInput => ({
	now: NOW,
	counts: { organizations: 3, users: 7 },
	newInquiries: 0,
	grants: [],
	jobs: { failed24h: 0 },
	anchor: { createdAt: new Date(NOW.getTime() - 2 * H), status: "confirmed" },
	acceptedRisks: [],
	...over,
});

const grant = (over: Partial<GrantLike>): GrantLike => ({
	scope: "view",
	targetUserId: null,
	status: "approved",
	requestedBy: "u1",
	requestedAt: new Date(NOW.getTime() - H),
	applyAfter: null,
	expiresAt: new Date(NOW.getTime() + H),
	revokedAt: null,
	emergencyCategory: null,
	reportDueAt: null,
	reportedAt: null,
	...over,
});

describe("Admin-Übersicht", () => {
	it("alles ruhig: nichts braucht dich, Ampeln grün", () => {
		const o = buildOverview(base());
		expect(o.todos).toEqual([]);
		for (const tile of o.tiles) expect(tile.level).toBe("ok");
	});

	it("Anfragen, Anträge, überfällige Berichte, Fehler: dringendes zuerst", () => {
		const o = buildOverview(
			base({
				newInquiries: 2,
				jobs: { failed24h: 3 },
				grants: [
					grant({ status: "requested", expiresAt: null }),
					grant({
						status: "emergency",
						emergencyCategory: "security_incident",
						reportDueAt: new Date(NOW.getTime() - H),
					}),
				],
			}),
		);
		expect(o.todos.map((t) => t.key)).toEqual([
			"reports",
			"jobs",
			"inquiries",
			"requests",
		]);
		expect(o.todos.find((t) => t.key === "jobs")?.n).toBe(3);
		expect(o.tiles.find((t) => t.key === "access")?.level).toBe("bad");
	});

	it("Verlauf ohne Anker seit über 36 h: handeln", () => {
		const o = buildOverview(
			base({
				anchor: {
					createdAt: new Date(NOW.getTime() - ANCHOR_STALE_MS - H),
					status: "confirmed",
				},
			}),
		);
		expect(o.todos.map((t) => t.key)).toEqual(["anchor"]);
		const tile = o.tiles.find((t) => t.key === "anchor");
		expect(tile?.level).toBe("bad");
	});

	it("noch kein Anker: ansehen, aber kein To-do", () => {
		const o = buildOverview(base({ anchor: null }));
		expect(o.todos).toEqual([]);
		expect(o.tiles.find((t) => t.key === "anchor")?.level).toBe("warn");
	});

	it("Jobs nicht lesbar: unbekannt statt grün", () => {
		const o = buildOverview(base({ jobs: null }));
		expect(o.tiles.find((t) => t.key === "jobs")?.level).toBe("unknown");
	});

	it("hingenommene Risiken erscheinen als To-do", () => {
		const o = buildOverview(base({ acceptedRisks: ["no_av"] }));
		expect(o.todos.map((t) => t.key)).toEqual(["risks"]);
	});
});

describe("Admin-Navigation", () => {
	it("jeder Eintrag hat eine Seite und einen Text", () => {
		const admin = de.Admin as Record<string, string>;
		for (const group of ADMIN_NAV) {
			expect(admin[group.labelKey], group.labelKey).toBeTruthy();
			for (const item of group.items) {
				expect(admin[item.labelKey], item.labelKey).toBeTruthy();
				const rel = item.href.replace(/^\/admin/, "");
				const page = resolve(
					import.meta.dirname,
					"..",
					"app/(admin)/admin",
					`.${rel}`,
					"page.tsx",
				);
				expect(existsSync(page), page).toBe(true);
			}
		}
	});

	it("aktiver Eintrag: längster Pfad, Übersicht nur exakt", () => {
		expect(activeAdminHref("/admin")).toBe("/admin");
		expect(activeAdminHref("/admin/orgs")).toBe("/admin/orgs");
		expect(activeAdminHref("/admin/orgs/abc")).toBe("/admin/orgs");
		expect(activeAdminHref("/admin/orgsx")).toBeNull();
		expect(adminNavItems().length).toBeGreaterThanOrEqual(8);
	});
});
