// Jede Entscheidung der Geschäftsleitung wird ein Beschluss (E1): Gegenstand,
// Beschlusstext, passender Pflichtbeschluss und Rahmenwerk-Bezug. Pure,
// getestet (tests/decision-resolutions.test.ts); angewendet in
// lib/compliance/decision-service.ts.

import type { EntityKind } from "@/db/schema/enums";

export type DecisionInput = {
	workflowKind: string;
	workflowName: string;
	entityType: EntityKind;
	// „R-003 Ransomware …“, „Dienstleister „Hetzner““
	entityLabel: string;
	outcome: "approved" | "rejected";
	note?: string | null;
	documentTemplateCode?: string | null;
	providerMaterial?: boolean;
	// Managementanfrage (E2)
	question?: string | null;
};

// Pflichtbeschluss (lib/compliance/catalog/resolutions-required.ts), den
// diese Entscheidung erfüllt — nur bei Freigabe.
export function requiredCodeFor(d: DecisionInput): string | null {
	if (d.outcome !== "approved") return null;
	switch (d.entityType) {
		case "scope":
			return "RES-ISMS-SCOPE";
		case "aml_risk_analysis":
			return "RES-GWG-RISK";
		case "document":
			return d.documentTemplateCode
				? (DOCUMENT_RESOLUTION[d.documentTemplateCode] ?? null)
				: null;
		case "provider":
		case "provider_rating":
			return d.providerMaterial ? "RES-DORA-TPR" : null;
		default:
			return null;
	}
}

const DOCUMENT_RESOLUTION: Record<string, string> = {
	"RL-ISMS-LEITLINIE": "RES-ISMS-POLICY",
	"KZ-SCOPE": "RES-ISMS-SCOPE",
	"KZ-RISIKOMETHODIK": "RES-RISK-APPETITE",
	"KZ-RESILIENZSTRATEGIE": "RES-DORA-STRATEGY",
	"KZ-IKT-RISIKORAHMEN": "RES-DORA-FRAMEWORK",
	"RL-DIENSTLEISTER": "RES-DORA-TPR",
	"RL-BCM": "RES-DORA-BCP",
	"PL-NOTFALL": "RES-DORA-BCP",
	"BE-MANAGEMENTBEWERTUNG": "RES-MGMT-REVIEW",
};

export function resolutionFromDecision(d: DecisionInput): {
	subject: string;
	decisionText: string;
	requiredCode: string | null;
} {
	const subject =
		d.entityType === "decision_request" && d.question
			? d.question
			: `${d.workflowName}: ${d.entityLabel}`;
	const verdict =
		d.outcome === "approved"
			? d.entityType === "decision_request"
				? "Die Geschäftsleitung stimmt zu."
				: "Die Geschäftsleitung gibt frei."
			: "Die Geschäftsleitung lehnt ab.";
	const note = d.note?.trim();
	return {
		subject: subject.slice(0, 300),
		decisionText: note ? `${verdict} ${note}` : verdict,
		requiredCode: requiredCodeFor(d),
	};
}

// Entscheidung zählt als Management-Entscheidung, wenn die entschiedene
// Stufe die Geschäftsleitung verlangt oder die Person sie innehat.
export function isManagementDecision(input: {
	approverRule: string | null | undefined;
	deciderIsTopManagement: boolean;
	entityType: EntityKind;
}): boolean {
	// Freigabe eines Beschlusses ist schon der Beschluss selbst
	if (input.entityType === "resolution") return false;
	return (
		input.approverRule === "function:management_body" ||
		input.deciderIsTopManagement
	);
}

// Anforderungs-Schlüssel auf aktive Rahmenwerke begrenzen und Rahmenwerke
// daraus ableiten (Reihenfolge stabil, höchstens 20 Schlüssel).
export function frameworkRefs(
	keys: readonly string[],
	active: readonly string[],
	extraFrameworks: readonly string[] = [],
): { frameworks: string[]; requirementKeys: string[] } {
	const act = new Set(active);
	const requirementKeys = [...new Set(keys)]
		.filter((k) => act.has(k.split(":")[0] ?? ""))
		.slice(0, 20);
	const frameworks = [
		...new Set([
			...extraFrameworks.filter((f) => act.has(f)),
			...requirementKeys.map((k) => k.split(":")[0] ?? ""),
		]),
	];
	return { frameworks, requirementKeys };
}

// Nummer der Managementanfrage: ME-JJJJ-NN
export function nextDecisionCode(existing: readonly string[], year: number) {
	const prefix = `ME-${year}-`;
	const max = existing
		.filter((c) => c.startsWith(prefix))
		.map((c) => Number.parseInt(c.slice(prefix.length), 10))
		.filter(Number.isFinite)
		.reduce((a, b) => Math.max(a, b), 0);
	return `${prefix}${String(max + 1).padStart(2, "0")}`;
}
