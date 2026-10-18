// Risikovorschläge (B3): Was im System auf ein Risiko hindeutet, für das es
// noch keins gibt. Klick legt nichts an — die Person erfasst (Assistent
// vorbelegt) oder lehnt mit Begründung ab. Pure, getestet
// (tests/risk-proposals.test.ts); Daten lädt loadRiskProposals.

import type { AssetLifecycleState } from "./assets";
import type { RiskSourceKind } from "./risk-sources";

export type RiskProposal = {
	key: string;
	kind: RiskSourceKind;
	id: string;
	title: string;
	reason: string;
	// höher = dringlicher (Sortierung)
	weight: number;
};

export type RiskProposalInput = {
	now: Date;
	assets: readonly {
		id: string;
		name: string;
		state: AssetLifecycleState;
		reasons: readonly string[];
	}[];
	providers: readonly {
		id: string;
		name: string;
		criticality: string;
		traffic: "red" | "amber" | "green" | null;
		ratingId: string | null;
		nextAssessmentAt: string | null;
		status: string;
	}[];
	incidents: readonly {
		id: string;
		code: string;
		title: string;
		classification: string | null;
	}[];
	gaps: readonly { id: string; key: string; label: string }[];
	// weitere Lücken, die nicht einzeln aufgeführt werden
	moreGaps: number;
	findings: readonly {
		id: string;
		title: string;
		severity: string;
		status: string;
		dueAt: Date | null;
	}[];
	nonconformities: readonly { id: string; code: string; title: string }[];
	// KRI über der Alarmschwelle (B5)
	indicators?: readonly { id: string; title: string; state: string }[];
	// schon erfasste Herkünfte „kind:id“ (inkl. Dienstleister-/Asset-Bezug)
	covered: ReadonlySet<string>;
	// abgelehnte Vorschläge „kind:id“
	dismissed: ReadonlySet<string>;
};

export function riskProposals(input: RiskProposalInput): RiskProposal[] {
	const out: RiskProposal[] = [];
	const push = (p: Omit<RiskProposal, "key">) => {
		const key = `${p.kind}:${p.id}`;
		if (input.covered.has(key) || input.dismissed.has(key)) return;
		out.push({ ...p, key });
	};

	for (const a of input.assets) {
		if (a.state !== "expired" && a.state !== "no_maintenance") continue;
		push({
			kind: "asset",
			id: a.id,
			title: a.name,
			reason: a.reasons.join(", ") || "Lebenszyklus kritisch",
			weight: a.state === "expired" ? 70 : 60,
		});
	}

	for (const p of input.providers) {
		if (p.status === "terminated") continue;
		const critical = p.criticality !== "standard";
		const overdue =
			p.nextAssessmentAt !== null &&
			Date.parse(`${p.nextAssessmentAt}T00:00:00Z`) < input.now.getTime();
		if (p.traffic === "red" && p.ratingId) {
			push({
				kind: "provider_rating",
				id: p.ratingId,
				title: p.name,
				reason: "Bewertung rot",
				weight: critical ? 80 : 65,
			});
			continue;
		}
		if (critical && (overdue || p.nextAssessmentAt === null))
			push({
				kind: "provider",
				id: p.id,
				title: p.name,
				reason: overdue
					? "kritisch, Bewertung überfällig"
					: "kritisch, noch nicht bewertet",
				weight: 55,
			});
	}

	for (const i of input.incidents) {
		if (i.classification !== "major" && i.classification !== "significant")
			continue;
		push({
			kind: "incident",
			id: i.id,
			title: `${i.code} ${i.title}`,
			reason:
				i.classification === "major"
					? "schwerwiegender Vorfall"
					: "erheblicher Vorfall",
			weight: i.classification === "major" ? 85 : 60,
		});
	}

	for (const f of input.findings) {
		if (f.severity !== "critical" && f.severity !== "high") continue;
		if (f.status !== "open" && f.status !== "in_progress") continue;
		if (!f.dueAt || f.dueAt.getTime() >= input.now.getTime()) continue;
		push({
			kind: "security_finding",
			id: f.id,
			title: f.title,
			reason: `${f.severity === "critical" ? "kritisch" : "hoch"}, Frist überschritten`,
			weight: f.severity === "critical" ? 90 : 75,
		});
	}

	for (const n of input.nonconformities)
		push({
			kind: "nonconformity",
			id: n.id,
			title: `${n.code} ${n.title}`,
			reason: "offene Abweichung",
			weight: 45,
		});

	for (const k of input.indicators ?? []) {
		if (k.state !== "alert") continue;
		push({
			kind: "objective",
			id: k.id,
			title: k.title,
			reason: "Risikokennzahl über der Alarmschwelle",
			weight: 70,
		});
	}

	for (const g of input.gaps)
		push({
			kind: "requirement",
			id: g.id,
			title: g.label,
			reason: "anwendbar, nicht abgedeckt",
			weight: 30,
		});

	return out.sort(
		(a, b) => b.weight - a.weight || a.title.localeCompare(b.title),
	);
}
