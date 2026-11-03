import type { ReqCoverage } from "./coverage";
import type { OrgCatalog } from "./org-catalog";

// Register /controls (pure, Test `controls-register`): Zuständigkeit, Stand
// der Tests und Bezüge zu den Rahmenwerken je Control. Abgeleitet, nie
// gespeichert.

export type Assignment = "assigned" | "reassign" | "unassigned";

/**
 * Zuständigkeit eines Controls:
 * - ohne Verantwortliche:n = `unassigned`
 * - Funktion eingetragen, aber niemand hat sie bestellt inne, oder die
 *   Person ist kein Mitglied mehr = `reassign`
 * - sonst `assigned`
 */
export function assignmentState(
	row: { ownerUserId: string | null; ownerFunction: string | null },
	members: ReadonlySet<string>,
	filledFunctions: ReadonlySet<string>,
): Assignment {
	if (!row.ownerUserId && !row.ownerFunction) return "unassigned";
	if (row.ownerFunction && !filledFunctions.has(row.ownerFunction))
		return "reassign";
	if (row.ownerUserId && !members.has(row.ownerUserId)) return "reassign";
	if (!row.ownerUserId) return "reassign";
	return "assigned";
}

/** Letztes Ergebnis je Testart eines Controls, gezählt */
export type TestSummary = { pass: number; partial: number; fail: number };

export type TestOutcome = "passed" | "issues" | "none";

export function testTotal(s: TestSummary | undefined): number {
	return s ? s.pass + s.partial + s.fail : 0;
}

/** bestanden = jede Testart zuletzt bestanden; Mängel = eine nicht */
export function testOutcome(s: TestSummary | undefined): TestOutcome {
	if (testTotal(s) === 0) return "none";
	return s && s.partial + s.fail === 0 ? "passed" : "issues";
}

export type FrameworkRef = { framework: string; codes: string[] };

/**
 * Anforderungen, die ein Control in den gewählten Rahmenwerken trägt — nur
 * anwendbare, in der Reihenfolge der gewählten Rahmenwerke, Codes je
 * Rahmenwerk in Katalog-Reihenfolge.
 */
export function frameworkRefs(
	code: string,
	catalog: Pick<OrgCatalog, "edgesByControl">,
	byRequirement: ReadonlyMap<string, ReqCoverage>,
	frameworks: readonly string[],
): FrameworkRef[] {
	const byFw = new Map<string, string[]>();
	for (const e of catalog.edgesByControl.get(code) ?? []) {
		const status = byRequirement.get(e.requirement);
		if (!status || status === "not_applicable") continue;
		const i = e.requirement.indexOf(":");
		const fw = e.requirement.slice(0, i);
		const req = e.requirement.slice(i + 1);
		const list = byFw.get(fw);
		if (list) {
			if (!list.includes(req)) list.push(req);
		} else byFw.set(fw, [req]);
	}
	const out: FrameworkRef[] = [];
	for (const fw of frameworks) {
		const codes = byFw.get(fw);
		if (codes) out.push({ framework: fw, codes });
	}
	return out;
}
