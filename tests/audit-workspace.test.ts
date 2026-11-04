import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	auditorLanding,
	auditorMayComment,
	auditPackageAllowed,
	auditPhases,
	matchesRequest,
	myAuditId,
	requestCounterparts,
	requestCounts,
	requestOverdue,
	requestViewOf,
	viewCount,
} from "@/lib/compliance/audit-workspace";

// Audit-Arbeitsplatz (Teil 6): Zeitleiste aus den Daten des Audits, Stand
// und Filter der Anfragen, Gegenseite für Kommentare, Kommentarrecht und
// Einstieg der Prüfer:innen.

const labels = {
	periodStart: "Prüfzeitraum beginnt",
	periodEnd: "Prüfzeitraum endet",
	planned: "Audit-Termin",
	performed: "Audit begonnen",
	requestsDue: (n: number) => `${n} fällig`,
};

describe("Anfragen", () => {
	const rows = [
		{
			status: "open" as const,
			title: "Backup-Protokoll",
			description: null,
			controlCode: "CC-OPS-04",
			dueAt: "2026-10-30",
		},
		{
			status: "rejected" as const,
			title: "Zugangsliste",
			description: "Stand Q3",
			controlCode: null,
			dueAt: "2026-11-20",
		},
		{
			status: "answered" as const,
			title: "Schulungsnachweis",
			description: null,
			controlCode: "CC-HR-02",
			dueAt: null,
		},
		{
			status: "accepted" as const,
			title: "Leitlinie",
			description: null,
			controlCode: null,
			dueAt: null,
		},
	];

	it("zählt je Stand und je Ansicht", () => {
		const c = requestCounts(rows);
		expect(c).toEqual({ open: 1, answered: 1, accepted: 1, rejected: 1 });
		expect(viewCount("offen", c)).toBe(2);
		expect(viewCount("alle", c)).toBe(4);
	});

	it("Ansicht aus der Adresse, sonst offen solange etwas offen ist", () => {
		const c = requestCounts(rows);
		expect(requestViewOf("beantwortet", c)).toBe("beantwortet");
		expect(requestViewOf("quatsch", c)).toBe("offen");
		expect(requestViewOf(undefined, c)).toBe("offen");
		expect(
			requestViewOf(undefined, {
				open: 0,
				answered: 2,
				accepted: 0,
				rejected: 0,
			}),
		).toBe("alle");
	});

	it("Suche über Titel, Beschreibung und Control", () => {
		expect(rows.filter((r) => matchesRequest(r, "backup"))).toHaveLength(1);
		expect(rows.filter((r) => matchesRequest(r, "q3"))).toHaveLength(1);
		expect(rows.filter((r) => matchesRequest(r, "cc-hr"))).toHaveLength(1);
		expect(rows.filter((r) => matchesRequest(r, " "))).toHaveLength(4);
	});

	it("überfällig nur offen oder abgelehnt mit Frist vor heute", () => {
		expect(requestOverdue(rows[0] as never, "2026-11-03")).toBe(true);
		expect(requestOverdue(rows[1] as never, "2026-11-03")).toBe(false);
		expect(
			requestOverdue({ status: "answered", dueAt: "2026-10-01" }, "2026-11-03"),
		).toBe(false);
	});

	it("Gegenseite einer Anfrage ohne die kommentierende Person", () => {
		expect(
			requestCounterparts({ requestedByUserId: "p", assigneeUserId: "o" }, "p"),
		).toEqual(["o"]);
		expect(
			requestCounterparts({ requestedByUserId: "p", assigneeUserId: "p" }, "x"),
		).toEqual(["p"]);
		expect(
			requestCounterparts(
				{ requestedByUserId: null, assigneeUserId: null },
				"x",
			),
		).toEqual([]);
	});
});

describe("Zeitleiste des Audits", () => {
	it("Prüfzeitraum, Termin, Beginn und Fristen je Tag", () => {
		const { start, end, items } = auditPhases(
			{
				periodStart: "2026-01-01",
				periodEnd: "2026-12-31",
				plannedAt: "2026-11-20",
				performedAt: null,
				status: "planned",
			},
			[
				{ status: "open", dueAt: "2026-10-30" },
				{ status: "rejected", dueAt: "2026-10-30" },
				{ status: "open", dueAt: "2026-11-06" },
				{ status: "open", dueAt: "2026-12-15" },
				{ status: "accepted", dueAt: "2026-10-01" },
			],
			"2026-11-03",
			labels,
			() => "/audits/a?tab=anfragen",
		);
		expect(items.map((i) => [i.key, i.tone])).toEqual([
			["period-start", "muted"],
			["due-2026-10-30", "destructive"],
			["due-2026-11-06", "warning"],
			["planned", "primary"],
			["due-2026-12-15", "primary"],
			["period-end", "muted"],
		]);
		expect(items.find((i) => i.key === "due-2026-10-30")?.label).toBe(
			"2 fällig",
		);
		expect(items.find((i) => i.key === "due-2026-10-30")?.href).toBe(
			"/audits/a?tab=anfragen",
		);
		expect(start <= "2026-01-01").toBe(true);
		expect(end >= "2026-12-31").toBe(true);
	});

	it("ohne Daten: Rahmen um heute, keine Marken", () => {
		const r = auditPhases(
			{
				periodStart: null,
				periodEnd: null,
				plannedAt: null,
				performedAt: null,
				status: "planned",
			},
			[],
			"2026-11-03",
			labels,
		);
		expect(r.items).toEqual([]);
		expect(r.start < "2026-11-03" && r.end > "2026-11-03").toBe(true);
	});
});

describe("Prüfer:innen", () => {
	it("kommentieren nur am Audit, an Anfragen und Findings", () => {
		expect(auditorMayComment("auditor", "audit_request")).toBe(true);
		expect(auditorMayComment("auditor", "audit")).toBe(true);
		expect(auditorMayComment("auditor", "audit_finding")).toBe(true);
		expect(auditorMayComment("auditor", "control")).toBe(false);
		expect(auditorMayComment("auditor", "document")).toBe(false);
		// alle anderen Rollen wie bisher
		expect(auditorMayComment("editor", "control")).toBe(true);
		expect(auditorMayComment("consultant", "document")).toBe(true);
	});

	it("die Action prüft das Kommentarrecht vor dem Schreiben", () => {
		const src = readFileSync("app/actions/comments.ts", "utf8");
		const check = src.indexOf("auditorMayComment(c.orgRole");
		const write = src.indexOf("mutateOrg(toOrgCtx(c)");
		expect(check).toBeGreaterThan(0);
		expect(check).toBeLessThan(write);
	});

	it("Einstieg: das eine laufende Audit, sonst die Liste", () => {
		const a = (
			id: string,
			status: "planned" | "in_progress",
			who: string[],
		) => ({
			id,
			status,
			auditorMemberIds: who,
			auditorUserId: null,
		});
		expect(
			auditorLanding(
				[a("1", "in_progress", ["u"]), a("2", "planned", ["u"])],
				"u",
			),
		).toBe("/audits/1");
		expect(auditorLanding([a("1", "planned", ["u"])], "u")).toBe("/audits/1");
		expect(
			auditorLanding(
				[a("1", "in_progress", ["u"]), a("2", "in_progress", ["u"])],
				"u",
			),
		).toBe("/audits");
		expect(auditorLanding([a("1", "in_progress", ["x"])], "u")).toBe("/audits");
		expect(
			auditorLanding(
				[
					{
						id: "9",
						status: "in_progress",
						auditorMemberIds: [],
						auditorUserId: "u",
					},
				],
				"u",
			),
		).toBe("/audits/9");
	});
});

describe("Prüfer:innen (E): Paket und „Mein Audit“", () => {
	const audit = (
		id: string,
		status: "planned" | "in_progress" | "closed",
		members: string[],
		lead: string | null = null,
	) => ({ id, status, auditorMemberIds: members, auditorUserId: lead });

	it("Paket: mit Export-Recht immer, sonst nur Prüfer:innen des Audits", () => {
		const a = audit("1", "in_progress", ["u"], "lead");
		expect(auditPackageAllowed(true, null, "x")).toBe(true);
		expect(auditPackageAllowed(false, a, "u")).toBe(true);
		expect(auditPackageAllowed(false, a, "lead")).toBe(true);
		// andere Prüfer:in, Lesende ohne Export, kein Audit
		expect(auditPackageAllowed(false, a, "x")).toBe(false);
		expect(auditPackageAllowed(false, null, "u")).toBe(false);
	});

	it("Mein Audit: genau ein laufendes, sonst das einzige, sonst keins", () => {
		expect(
			myAuditId(
				[audit("1", "closed", ["u"]), audit("2", "in_progress", ["u"])],
				"u",
			),
		).toBe("2");
		expect(myAuditId([audit("1", "planned", [], "u")], "u")).toBe("1");
		expect(
			myAuditId(
				[audit("1", "in_progress", ["u"]), audit("2", "in_progress", ["u"])],
				"u",
			),
		).toBeNull();
		expect(myAuditId([audit("1", "in_progress", ["x"])], "u")).toBeNull();
	});
});
