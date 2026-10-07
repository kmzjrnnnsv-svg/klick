// Abweichungen / Korrekturmaßnahmen (CAPA): ISO 27001 10.1/10.2, DORA Art. 13
// (Lessons Learned), ZAG-MaRisk AT 4.4.3 (Follow-up). Reine Ableitungen —
// Schreiben erledigen die Actions.

export const NC_DUE_DAYS = 30;
export const NC_EFFECTIVENESS_DAYS = 90;

export type NonconformitySource =
	| "audit"
	| "incident"
	| "control_test"
	| "complaint"
	| "management_review"
	| "self_identified";

export type NonconformityDraft = {
	source: NonconformitySource;
	sourceRefId: string | null;
	title: string;
	description: string | null;
	rootCause: string | null;
	ownerUserId: string | null;
	dueAt: string; // ISO-Datum
	effectivenessCheckAt: string;
};

function isoDay(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function plusDays(d: Date, days: number): string {
	return isoDay(new Date(d.getTime() + days * 86_400_000));
}

// Code NC-<Jahr>-<lfd>.
export function nextNonconformityCode(
	existing: readonly string[],
	now = new Date(),
): string {
	const prefix = `NC-${now.getFullYear()}-`;
	const max = existing
		.filter((c) => c.startsWith(prefix))
		.map((c) => Number.parseInt(c.slice(prefix.length), 10))
		.filter((n) => Number.isFinite(n))
		.reduce((m, n) => Math.max(m, n), 0);
	return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

// Jeder schwerwiegende Vorfall erzeugt beim Schließen eine Abweichung (DORA Art. 13).
export function nonconformityFromIncident(
	incident: {
		id: string;
		code: string;
		title: string;
		rootCause: string | null;
		ownerUserId: string | null;
		classification: string | null;
	},
	now = new Date(),
): NonconformityDraft | null {
	if (incident.classification !== "major") return null;
	return {
		source: "incident",
		sourceRefId: incident.id,
		title: `Lessons Learned ${incident.code}: ${incident.title}`,
		description: `Schwerwiegender Vorfall ${incident.code} geschlossen — Ursachenanalyse, Korrektur und Wirksamkeitsprüfung dokumentieren (DORA Art. 13).`,
		rootCause: incident.rootCause,
		ownerUserId: incident.ownerUserId,
		dueAt: plusDays(now, NC_DUE_DAYS),
		effectivenessCheckAt: plusDays(now, NC_EFFECTIVENESS_DAYS),
	};
}

// Nicht bestandener Wirksamkeitstest → Abweichung (ISO 9.1/10.2).
export function nonconformityFromTest(
	test: {
		id: string;
		controlCode: string;
		controlTitle: string;
		method: string;
		notes: string | null;
		ownerUserId: string | null;
		result: string | null;
	},
	now = new Date(),
): NonconformityDraft | null {
	if (test.result !== "fail") return null;
	return {
		source: "control_test",
		sourceRefId: test.id,
		title: `${test.controlCode}: Wirksamkeitstest nicht bestanden`,
		description: `${test.controlTitle} — Test (${test.method}) ergab „nicht wirksam".${test.notes ? ` Befund: ${test.notes}` : ""}`,
		rootCause: null,
		ownerUserId: test.ownerUserId,
		dueAt: plusDays(now, NC_DUE_DAYS),
		effectivenessCheckAt: plusDays(now, NC_EFFECTIVENESS_DAYS),
	};
}

// Audit-Finding übernehmen (major/critical als Abweichung).
export function nonconformityFromFinding(
	finding: {
		id: string;
		title: string;
		description: string | null;
		severity: string;
		ownerUserId: string | null;
	},
	now = new Date(),
): NonconformityDraft {
	return {
		source: "audit",
		sourceRefId: finding.id,
		title: finding.title,
		description: finding.description,
		rootCause: null,
		ownerUserId: finding.ownerUserId,
		dueAt: plusDays(now, finding.severity === "critical" ? 14 : NC_DUE_DAYS),
		effectivenessCheckAt: plusDays(now, NC_EFFECTIVENESS_DAYS),
	};
}

export type CapaState = {
	overdue: boolean;
	effectivenessDue: boolean;
	// Abschluss nur mit Wirksamkeitsergebnis
	canClose: boolean;
};

export function capaState(
	nc: {
		status: string;
		dueAt: string | Date | null;
		effectivenessCheckAt: string | Date | null;
		effectivenessResult: string | null;
	},
	now = new Date(),
): CapaState {
	const open = nc.status === "open" || nc.status === "in_progress";
	const due = nc.dueAt ? new Date(nc.dueAt) : null;
	const eff = nc.effectivenessCheckAt
		? new Date(nc.effectivenessCheckAt)
		: null;
	return {
		overdue: Boolean(open && due && due.getTime() < now.getTime()),
		effectivenessDue: Boolean(
			nc.status !== "closed" &&
				!nc.effectivenessResult &&
				eff &&
				eff.getTime() <= now.getTime(),
		),
		canClose: nc.effectivenessResult === "effective",
	};
}
