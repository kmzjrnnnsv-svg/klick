import type { RiskMethod, RiskZone } from "@/db/schema/platform";
import {
	aggregate,
	type ClassResult,
	clampLevel,
	classify,
	legacyRiskMethod,
} from "./risk-method";

// Risikobewertung — reine Funktionen. Skala 1–5 je Achse; Rechenweg,
// Klassen und Zonen kommen aus der Risikomethodik der Org
// (lib/compliance/risk-method.ts). Zone „unacceptable“ = über dem Appetit →
// Behandlung Pflicht, Akzeptanz nur per Freigabe, Notification an Owner.

export type AppetiteZone = RiskZone;

export { clampLevel as clampScale };

// Altvorgaben (Bestand ohne gespeicherte Methode)
export const DEFAULT_RISK_SCALES = {
	likelihood: [
		"selten",
		"unwahrscheinlich",
		"möglich",
		"wahrscheinlich",
		"fast sicher",
	],
	impact: ["unwesentlich", "gering", "spürbar", "schwer", "existenzbedrohend"],
} as const satisfies {
	likelihood: readonly string[];
	impact: readonly string[];
};

export const DEFAULT_RISK_APPETITE = { acceptable: 4, tolerable: 9 };

export const LEGACY_METHOD: RiskMethod = legacyRiskMethod(
	null,
	DEFAULT_RISK_APPETITE,
);

export type RiskLike = {
	id: string;
	likelihood: number;
	impact: number;
	residualLikelihood?: number | null;
	residualImpact?: number | null;
};

export type RiskPoint = {
	likelihood: number;
	impact: number;
	score: number;
	cls: ClassResult;
	zone: AppetiteZone;
};

export type RiskAssessment = {
	inherent: RiskPoint;
	residual: RiskPoint | null;
	// Zum Steuern: residual wenn vorhanden, sonst inherent
	effective: { score: number; cls: ClassResult; zone: AppetiteZone };
	aboveAppetite: boolean;
};

function point(l: number, i: number, method: RiskMethod): RiskPoint {
	const likelihood = clampLevel(l);
	const impact = clampLevel(i);
	const score = aggregate(likelihood, impact, method);
	const cls = classify(score, method);
	return { likelihood, impact, score, cls, zone: cls.zone };
}

export function assessRisk(
	risk: RiskLike,
	method: RiskMethod = LEGACY_METHOD,
): RiskAssessment {
	const inherent = point(risk.likelihood, risk.impact, method);
	const residual =
		risk.residualLikelihood != null && risk.residualImpact != null
			? point(risk.residualLikelihood, risk.residualImpact, method)
			: null;
	const eff = residual ?? inherent;
	return {
		inherent,
		residual,
		effective: { score: eff.score, cls: eff.cls, zone: eff.zone },
		aboveAppetite: eff.zone === "unacceptable",
	};
}

export type MatrixCell = {
	likelihood: 1 | 2 | 3 | 4 | 5;
	impact: 1 | 2 | 3 | 4 | 5;
	score: number;
	cls: ClassResult;
	zone: AppetiteZone;
	riskIds: string[];
};

// 5×5-Matrix (Zeilen: Eintrittswahrscheinlichkeit 5 → 1, Spalten:
// Schadenshöhe 1 → 5), Chips je Zelle; Umschalter inhärent/residual.
export function riskMatrix(
	risks: readonly RiskLike[],
	view: "inherent" | "residual" = "inherent",
	method: RiskMethod = LEGACY_METHOD,
): MatrixCell[][] {
	const rows: MatrixCell[][] = [];
	for (let l = 5; l >= 1; l--) {
		const row: MatrixCell[] = [];
		for (let i = 1; i <= 5; i++) {
			const score = aggregate(l, i, method);
			const cls = classify(score, method);
			row.push({
				likelihood: l as MatrixCell["likelihood"],
				impact: i as MatrixCell["impact"],
				score,
				cls,
				zone: cls.zone,
				riskIds: [],
			});
		}
		rows.push(row);
	}
	for (const r of risks) {
		const a = assessRisk(r, method);
		const pos = view === "residual" ? (a.residual ?? a.inherent) : a.inherent;
		const cell = rows[5 - pos.likelihood]?.[pos.impact - 1];
		cell?.riskIds.push(r.id);
	}
	return rows;
}

// Verteilung je Klasse vorher/nachher (Übersicht auf dem Matrix-Reiter)
export function classDistribution(
	risks: readonly RiskLike[],
	method: RiskMethod,
): {
	key: string;
	label: string;
	zone: AppetiteZone;
	inherent: number;
	residual: number;
}[] {
	const out = method.classes.map((c) => ({
		key: c.key,
		label: c.label,
		zone: c.zone,
		inherent: 0,
		residual: 0,
	}));
	for (const r of risks) {
		const a = assessRisk(r, method);
		const bi = out[a.inherent.cls.index];
		if (bi) bi.inherent++;
		const br = out[a.effective.cls.index];
		if (br) br.residual++;
	}
	return out;
}

export function nextRiskCode(
	existing: readonly string[],
	prefix = "R",
): string {
	let max = 0;
	const re = new RegExp(`^${prefix}-(\\d+)$`);
	for (const c of existing) {
		const m = re.exec(c);
		if (m) max = Math.max(max, Number(m[1]));
	}
	return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}
