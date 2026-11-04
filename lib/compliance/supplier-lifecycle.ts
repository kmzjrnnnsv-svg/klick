import type { PROVIDER_STATUSES } from "@/db/schema/enums";
import type { ContractClauses, DueDiligence } from "@/db/schema/registers";
import { ART30_CLAUSES } from "@/lib/compliance/catalog/art30-clauses";

// Lebenszyklus eines Dienstleisters (L1): Bedarf → Einstufung → Prüfung →
// Freigabe → Vertrag → Onboarding → Betrieb → Ausstieg. Die Stufe wird aus
// dem Datensatz abgeleitet, nie gespeichert: aktuell ist die erste Stufe mit
// einem offenen Pflichtpunkt. Grundlagen: ISO 27001 A.5.19–5.22, DORA
// Art. 28–30, MaRisk AT 9, DSGVO Art. 28. Pure, ohne Datenbank.

export const PROVIDER_STAGES = [
	"request",
	"classify",
	"review",
	"approve",
	"contract",
	"onboard",
	"operate",
	"exit",
] as const;
export type ProviderStage = (typeof PROVIDER_STAGES)[number];

export type LifecycleItemKey =
	| "need"
	| "category"
	| "substitutability"
	| "owner"
	| "due_diligence"
	| "risk_analysis"
	| "approved"
	| "contract"
	| "dpa"
	| "clauses"
	| "notice"
	| "data_locations"
	| "subcontractors"
	| "exit_strategy"
	| "targets"
	| "next_review"
	| "contract_valid"
	| "exit_test";

export type LifecycleItem = {
	key: LifecycleItemKey;
	stage: ProviderStage;
	// Pflicht für diesen Dienstleister (sonst Empfehlung)
	required: boolean;
	done: boolean;
};

export type LifecycleInput = {
	status: (typeof PROVIDER_STATUSES)[number];
	serviceDescription: string | null;
	category: string | null;
	substitutability: string | null;
	ownerUserId: string | null;
	criticality: "critical" | "important" | "standard";
	isIct: boolean;
	isOutsourcing: boolean;
	isMaterial: boolean;
	processesPersonalData: boolean;
	dueDiligence: DueDiligence | null;
	riskAnalysisAt: string | null;
	contractRef: string | null;
	contractStart: string | null;
	contractEnd: string | null;
	noticePeriodDays: number | null;
	dpaSignedAt: string | null;
	contractClauses: ContractClauses | null;
	dataLocations: readonly string[];
	subcontractors: readonly unknown[] | null;
	exitStrategy: string | null;
	exitPlanTestedAt: string | null;
	rtoHours: number | null;
	nextAssessmentAt: string | null;
};

export type LifecycleOptions = {
	// heute als ISO-Datum (YYYY-MM-DD)
	today: string;
	// eine Freigabe „Dienstleister aufnehmen“ ist offen
	approvalPending: boolean;
	// DORA gewählt: Vertragsklauseln nach Art. 30 sind Pflicht für IKT
	dora: boolean;
	// ein Risiko zum Dienstleister steht im Register (Risiko-Assistent)
	hasRisk?: boolean;
};

export type Lifecycle = {
	current: ProviderStage;
	// Aufnahme oder Prüfung abgelehnt
	declined: boolean;
	items: LifecycleItem[];
};

const POSITIVE = new Set([
	"accept",
	"accept_with_conditions",
	"approved",
	"approved_with_conditions",
]);
const NEGATIVE = new Set(["reject", "rejected"]);

// kritisch oder wesentlich (Auslagerung): strengere Pflichten
export function isSignificant(p: LifecycleInput): boolean {
	return p.criticality === "critical" || p.isMaterial;
}

// Art.-30-Klauseln: alle Pflichtklauseln angekreuzt (Abs. 3 nur bei kritisch)
export function clausesComplete(p: LifecycleInput): boolean {
	const values = p.contractClauses ?? {};
	return ART30_CLAUSES.filter((c) => !c.criticalOnly || isSignificant(p)).every(
		(c) => values[c.code] === true,
	);
}

function yearBefore(today: string): string {
	const d = new Date(`${today}T00:00:00Z`);
	d.setUTCFullYear(d.getUTCFullYear() - 1);
	return d.toISOString().slice(0, 10);
}

const filled = (s: string | null | undefined) => Boolean(s?.trim());

export function lifecycleItems(
	p: LifecycleInput,
	o: LifecycleOptions,
): LifecycleItem[] {
	const significant = isSignificant(p);
	const dd = p.dueDiligence;
	const decision = dd?.decision ? String(dd.decision) : null;
	const reviewed = Boolean(dd?.assessedAt) || Boolean(decision);
	const item = (
		key: LifecycleItemKey,
		stage: ProviderStage,
		required: boolean,
		done: boolean,
	): LifecycleItem => ({ key, stage, required, done });
	return [
		item("need", "request", true, filled(p.serviceDescription)),
		item("category", "classify", true, p.category !== null),
		item("substitutability", "classify", true, p.substitutability !== null),
		item("owner", "classify", true, p.ownerUserId !== null),
		item("due_diligence", "review", true, reviewed),
		// Risikoanalyse vor der Auslagerung (MaRisk AT 9 Tz. 2, DORA Art. 28 Abs. 4)
		item(
			"risk_analysis",
			"review",
			significant || p.isOutsourcing,
			p.riskAnalysisAt !== null || Boolean(o.hasRisk),
		),
		item(
			"approved",
			"approve",
			true,
			!o.approvalPending &&
				p.status !== "declined" &&
				decision !== null &&
				POSITIVE.has(decision),
		),
		item(
			"contract",
			"contract",
			true,
			filled(p.contractRef) || p.contractStart !== null,
		),
		item("dpa", "contract", p.processesPersonalData, p.dpaSignedAt !== null),
		item("clauses", "contract", o.dora && p.isIct, clausesComplete(p)),
		item("notice", "contract", false, p.noticePeriodDays !== null),
		item(
			"data_locations",
			"onboard",
			p.processesPersonalData || p.isIct,
			p.dataLocations.length > 0,
		),
		item("subcontractors", "onboard", significant, p.subcontractors !== null),
		// Ausstiegsstrategie (DORA Art. 28 Abs. 8, MaRisk AT 9 Tz. 6)
		item("exit_strategy", "onboard", significant, filled(p.exitStrategy)),
		// Zusage zum Wiederanlauf für die Notfall-Kette (N2)
		item(
			"targets",
			"onboard",
			p.criticality === "critical",
			p.rtoHours !== null,
		),
		item(
			"next_review",
			"operate",
			true,
			p.nextAssessmentAt !== null && p.nextAssessmentAt >= o.today,
		),
		item(
			"contract_valid",
			"operate",
			true,
			p.contractEnd === null || p.contractEnd >= o.today,
		),
		item(
			"exit_test",
			"operate",
			significant,
			p.exitPlanTestedAt !== null && p.exitPlanTestedAt >= yearBefore(o.today),
		),
	];
}

// Stufe: Bedarf, Ausstieg und Ablehnung folgen dem Status; sonst die erste
// Stufe mit offenem Pflichtpunkt, alles erledigt = Betrieb
export function providerLifecycle(
	p: LifecycleInput,
	o: LifecycleOptions,
): Lifecycle {
	const items = lifecycleItems(p, o);
	const dd = p.dueDiligence?.decision ? String(p.dueDiligence.decision) : null;
	const declined = p.status === "declined" || (dd !== null && NEGATIVE.has(dd));
	if (p.status === "requested")
		return { current: "request", declined: false, items };
	if (p.status === "exiting" || p.status === "terminated")
		return { current: "exit", declined: false, items };
	if (declined) return { current: "approve", declined: true, items };
	const order: ProviderStage[] = [
		"classify",
		"review",
		"approve",
		"contract",
		"onboard",
		"operate",
	];
	const current =
		order.find((s) =>
			items.some((i) => i.stage === s && i.required && !i.done),
		) ?? "operate";
	return { current, declined: false, items };
}

export function providerStage(
	p: LifecycleInput,
	o: LifecycleOptions,
): ProviderStage {
	return providerLifecycle(p, o).current;
}

// Stand einer Stufe für die Anzeige
export type StageState = "done" | "current" | "open" | "upcoming";

// (vor der aktuellen Stufe: erledigt oder noch offen — nur bei Ausstieg und
// Ablehnung möglich; danach: kommt noch). Bedarf gilt als erledigt, sobald
// aufgenommen.
export function stageStates(l: Lifecycle): Record<ProviderStage, StageState> {
	const idx = PROVIDER_STAGES.indexOf(l.current);
	const out = {} as Record<ProviderStage, StageState>;
	PROVIDER_STAGES.forEach((s, i) => {
		const open = l.items.some((x) => x.stage === s && x.required && !x.done);
		if (i === idx) out[s] = "current";
		else if (i > idx) out[s] = "upcoming";
		else out[s] = open && s !== "request" ? "open" : "done";
	});
	return out;
}
