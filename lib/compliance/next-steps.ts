import type { BlockerKind, BlockerSeverity } from "@/lib/compliance/readiness";

// „Als Nächstes“ (S2, Nov 2026): eine Liste statt drei. Einrichtung,
// Gap-Analyse, Besetzung, fällige Pflichten, Blocker der Prüfungsreife und
// die ersten Grundlagen landen in höchstens fünf Schritten mit Link,
// geordnet nach Wirkung. Rein und getestet; die Zahlen liefert
// loadNextStepFacts (lib/compliance/queries-next-steps.ts), Texte stehen
// unter NextSteps.step_<key> in messages/de.json.

export type NextStepKey =
	| "setup"
	| "gap_continue"
	| "gap_start"
	| "obligations_overdue"
	| "roles"
	| "nonconformities_overdue"
	| "sod"
	| "resolutions"
	| "readiness"
	| "controls_start"
	| "processes_accountable"
	| "risk_proposals"
	| "team"
	| "appetite"
	| "documents"
	| "providers"
	| "process_links";

export type NextStepFacts = {
	// offene Einrichtung (nur, wenn die Person sie fortsetzen darf)
	setup: { next: string; done: number; total: number } | null;
	gap: {
		open: { id: string; title: string; answered: number; total: number } | null;
		// Fragen einer neuen Gap-Analyse (0 = keine anbieten)
		startCount: number;
	};
	overdueObligations: number;
	roleGaps: number;
	overdueNonconformities: number;
	sodBlocks: number;
	resolutionGaps: number;
	// wichtigster Blocker über alle Rahmenwerke
	blocker: {
		kind: BlockerKind;
		severity: BlockerSeverity;
		label: string;
		href: string;
		gain: number;
	} | null;
	controlsStarted: number;
	processesWithoutAccountable: number;
	riskProposals: number;
	teamInvited: boolean;
	appetiteConfirmed: boolean;
	hasDocuments: boolean;
	hasProviders: boolean;
	processLinked: boolean;
};

export type NextStep = {
	key: NextStepKey;
	href: string;
	weight: number;
	// Werte für den Text (ICU)
	values: Record<string, string | number>;
};

// Ab so vielen bewerteten Maßnahmen gilt der Einstieg als geschafft
export const CONTROLS_STARTED_MIN = 10;

const BLOCKER_WEIGHT: Record<BlockerSeverity, number> = {
	critical: 78,
	high: 64,
	medium: 54,
	low: 44,
};

export function nextSteps(f: NextStepFacts, limit = 5): NextStep[] {
	const out: NextStep[] = [];
	const add = (
		key: NextStepKey,
		weight: number,
		href: string,
		values: NextStep["values"] = {},
	) => out.push({ key, weight, href, values });

	if (f.setup)
		add("setup", 100, `/einrichtung/${f.setup.next}`, {
			step: f.setup.next,
			done: f.setup.done,
			total: f.setup.total,
		});
	if (f.gap.open)
		add("gap_continue", 95, `/gap-analyse/${f.gap.open.id}`, {
			title: f.gap.open.title,
			answered: f.gap.open.answered,
			total: f.gap.open.total,
		});
	else if (f.gap.startCount > 0)
		add("gap_start", 90, "/gap-analyse", { count: f.gap.startCount });
	if (f.overdueObligations > 0)
		add("obligations_overdue", 88, "/kalender", {
			count: f.overdueObligations,
		});
	if (f.roleGaps > 0)
		add("roles", 85, "/organisation?tab=rollen", { count: f.roleGaps });
	if (f.overdueNonconformities > 0)
		add("nonconformities_overdue", 80, "/abweichungen?overdue=1", {
			count: f.overdueNonconformities,
		});
	if (f.sodBlocks > 0)
		add("sod", 75, "/organisation?tab=rollen", { count: f.sodBlocks });
	if (f.resolutionGaps > 0)
		add("resolutions", 70, "/beschluesse?tab=pflicht", {
			count: f.resolutionGaps,
		});
	if (f.blocker)
		add("readiness", BLOCKER_WEIGHT[f.blocker.severity], f.blocker.href, {
			kind: f.blocker.kind,
			label: f.blocker.label,
			gain: f.blocker.gain,
		});
	if (f.controlsStarted < CONTROLS_STARTED_MIN)
		add("controls_start", 50, "/controls", {
			count: f.controlsStarted,
			min: CONTROLS_STARTED_MIN,
		});
	if (f.processesWithoutAccountable > 0)
		add("processes_accountable", 42, "/prozesse", {
			count: f.processesWithoutAccountable,
		});
	if (f.riskProposals > 0)
		add("risk_proposals", 40, "/risiken?tab=vorschlaege", {
			count: f.riskProposals,
		});
	if (!f.teamInvited) add("team", 38, "/team");
	if (!f.appetiteConfirmed) add("appetite", 36, "/einstellungen?tab=risk");
	if (!f.hasDocuments) add("documents", 34, "/dokumente");
	if (!f.hasProviders) add("providers", 32, "/dienstleister");
	if (!f.processLinked) add("process_links", 30, "/prozesse");

	// stabile Reihenfolge: Wirkung, dann Reihenfolge oben
	return out
		.map((s, i) => ({ s, i }))
		.sort((a, b) => b.s.weight - a.s.weight || a.i - b.i)
		.slice(0, limit)
		.map(({ s }) => s);
}
