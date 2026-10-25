import type { ApprovalStep } from "@/db/schema/grc";
import {
	DUTY_BY_KIND,
	requiredDuties,
} from "@/lib/compliance/catalog/approval-duties";

// Pflichten prüfen statt erzwingen (ADR-024): im individuellen Modus ist der
// Designer frei; was ein gewähltes Rahmenwerk an Freigaben verlangt, steht
// in approval-duties.ts. Fehlt ein Ablauf oder eine verlangte Stelle, wird
// daraus ein Befund mit Rechtsgrundlage — Warnung in Einstellungen >
// Freigaben und Blocker in der Prüfungsreife. Im Standard-Modus erfüllt der
// Aufbau jede Pflicht; Befunde entstehen dort nur durch bewusstes
// Ausschalten. Pure, getestet.

export type GovernanceWorkflow = {
	kind: string;
	enabled: boolean;
	steps: readonly ApprovalStep[];
};

export type GovernanceProblem = "off" | "missing_approver" | "not_everyone";

export type GovernanceFinding = {
	kind: string;
	problem: GovernanceProblem;
	frameworks: string[];
	basis: string[];
	// verlangte Stellen, die im Ablauf fehlen
	missing: string[];
};

const stellenOf = (steps: readonly ApprovalStep[]) =>
	new Set(steps.flatMap((s) => [...(s.approvers ?? [s.approverRule])]));

export function governanceChecks(input: {
	frameworks: readonly string[];
	stage: number;
	workflows: readonly GovernanceWorkflow[];
}): GovernanceFinding[] {
	const byKind = new Map(input.workflows.map((w) => [w.kind, w]));
	const out: GovernanceFinding[] = [];
	for (const d of requiredDuties(input.frameworks, input.stage)) {
		// ohne Fundstelle in den gewählten Rahmenwerken gibt es nichts zu zitieren
		if (d.frameworks.length === 0) continue;
		const duty = DUTY_BY_KIND.get(d.kind);
		if (!duty) continue;
		const base = { kind: d.kind, frameworks: d.frameworks, basis: d.basis };
		const w = byKind.get(d.kind);
		if (!w?.enabled) {
			out.push({ ...base, problem: "off", missing: [...duty.requires] });
			continue;
		}
		const stellen = stellenOf(w.steps);
		const missing = duty.requires.filter((r) => !stellen.has(r));
		if (missing.length > 0) {
			out.push({ ...base, problem: "missing_approver", missing });
			continue;
		}
		if (
			duty.everyone &&
			!w.steps.some(
				(s) =>
					s.everyone &&
					duty.requires.some((r) =>
						(s.approvers ?? [s.approverRule]).includes(r),
					),
			)
		)
			out.push({ ...base, problem: "not_everyone", missing: [] });
	}
	return out;
}
