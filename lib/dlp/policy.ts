import type { Classification } from "@/db/schema/enums";
import type { DlpPolicy, DlpRuleAction } from "@/db/schema/platform";
import type { DlpCategory, DlpDetector, DlpFinding } from "./detectors";

export type { DlpPolicy, DlpRuleAction };

// DLP-Regeln je Organisation (org_settings.dlp_policy) und ihre Auswertung —
// rein. Reihenfolge der Strenge: block > warn > raise > allow. „raise“ hebt
// die Klassifizierung an (nie ab), damit Step-up und Prüfer-Grants greifen.

export const DEFAULT_DLP_POLICY: DlpPolicy = {
	secret: "block",
	payment: "raise",
	bank: "raise",
	tax: "raise",
	pii: "raise",
	piiThreshold: 50,
	egressLimit: 40,
	egressWindowMinutes: 10,
};

export function withDlpDefaults(
	p: Partial<DlpPolicy> | null | undefined,
): DlpPolicy {
	return { ...DEFAULT_DLP_POLICY, ...(p ?? {}) };
}

const RAISE_TO: Record<DlpCategory, Classification> = {
	secret: "secret",
	payment: "secret",
	bank: "confidential",
	tax: "confidential",
	pii: "confidential",
	info: "internal",
};

const RANK: Record<Classification, number> = {
	public: 0,
	internal: 1,
	confidential: 2,
	secret: 3,
};

const ACTION_RANK: Record<DlpRuleAction, number> = {
	allow: 0,
	raise: 1,
	warn: 2,
	block: 3,
};

export type DlpDecision = {
	action: DlpRuleAction;
	classification: Classification;
	raised: boolean;
	// Detektoren, die die Entscheidung tragen (für UI-Text und Audit)
	reasons: DlpDetector[];
};

export function evaluateDlp(
	findings: readonly DlpFinding[],
	policy: DlpPolicy,
	declared: Classification,
): DlpDecision {
	let action: DlpRuleAction = "allow";
	let classification = declared;
	const reasons: DlpDetector[] = [];
	for (const f of findings) {
		if (f.category === "info") continue;
		if (f.category === "pii" && f.count < policy.piiThreshold) continue;
		const rule = policy[f.category];
		if (rule === "allow") continue;
		reasons.push(f.detector);
		if (ACTION_RANK[rule] > ACTION_RANK[action]) action = rule;
		// Auch bei warn/block die Zielklassifizierung merken: nach einer
		// bestätigten Warnung gilt sie.
		const target = RAISE_TO[f.category];
		if (RANK[target] > RANK[classification]) classification = target;
	}
	return {
		action,
		classification,
		raised: RANK[classification] > RANK[declared],
		reasons,
	};
}
