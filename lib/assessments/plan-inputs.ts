import type { AssessmentQuestion, ImplStatus } from "@/db/schema/enums";
import {
	type ProfileInput,
	synergyCatalogFor,
} from "@/lib/compliance/catalog-view";
import { exclusionAllowedForKey } from "@/lib/compliance/exclusions";
import type { OrgCatalog } from "@/lib/compliance/org-catalog";
import {
	type PrioritizedPlan,
	prioritizePlan,
	type SynergyCatalog,
} from "@/lib/compliance/synergy";
import { applyChanges, proposeControlStatus } from "./apply";
import { type Measure, proposeMeasures } from "./measures";
import { naDropsControl } from "./na";
import { answerStates } from "./state";

// Maßnahmen und Plan-Stand einer Gap-Analyse (rein): dieselbe Rechnung für
// die Ergebnisseite und die Action „Plan übernehmen“, damit Aufgaben genau
// das tragen, was die Seite zeigt (Teil C). Nach der Übernahme ins Register
// zählt der heutige Stand, vorher der Stand nach den Antworten.

export type PlanInputs = {
	measures: Measure[];
	// Status je Control, mit dem geplant wird
	planned: Map<string, ImplStatus>;
	// teilweise umgesetzt (halbe Dauer)
	partial: Set<string>;
	prioritized: PrioritizedPlan;
	synergy: SynergyCatalog;
};

export function planInputs(input: {
	assessment: {
		frameworks: readonly string[];
		questions: readonly AssessmentQuestion[];
		appliedAt: Date | null;
	};
	answers: Parameters<typeof answerStates>[1];
	controlEvidence: ReadonlyMap<string, readonly unknown[]>;
	implStatus: ReadonlyMap<string, ImplStatus>;
	naConfirmed: (q: { code: string }) => boolean;
	catalog: OrgCatalog;
	profile: Omit<ProfileInput, "frameworks" | "asOf">;
	limit?: number;
}): PlanInputs {
	const a = input.assessment;
	const states = answerStates(
		a.questions,
		input.answers,
		input.controlEvidence,
	);
	const changes = proposeControlStatus(
		a.questions,
		states,
		input.implStatus,
		(k) => exclusionAllowedForKey(k, input.catalog),
		{
			dropsControl: (q) => naDropsControl(q, input.catalog),
			naConfirmed: input.naConfirmed,
		},
	);
	const planned = a.appliedAt
		? new Map(input.implStatus)
		: applyChanges(input.implStatus, changes);
	const synergy = synergyCatalogFor({
		...input.profile,
		frameworks: a.frameworks,
	});
	const prioritized = prioritizePlan(
		a.frameworks,
		synergy,
		planned,
		input.limit ?? 300,
	);
	const measures = proposeMeasures({
		questions: a.questions,
		answers: states,
		plan: prioritized,
	});
	const partial = new Set(
		[...planned].filter(([, s]) => s === "in_progress").map(([c]) => c),
	);
	return { measures, planned, partial, prioritized, synergy };
}
