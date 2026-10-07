import type { RiskAppetite, RiskScales } from "@/db/schema/platform";

// Risikobewertung — reine Funktionen. Skala 1–5 × 1–5, Score = L × I,
// Bänder: 1–4 niedrig, 5–9 mittel, 10–14 hoch, 15–25 kritisch.
// Appetit: acceptable (≤ 4) → akzeptabel, tolerable (≤ 9) → tolerierbar,
// darüber inakzeptabel → Behandlung Pflicht, Notification an Owner.

export type RiskBand = "low" | "medium" | "high" | "critical";
export type AppetiteZone = "acceptable" | "tolerable" | "unacceptable";

export const DEFAULT_RISK_SCALES: RiskScales = {
	likelihood: [
		"selten",
		"unwahrscheinlich",
		"möglich",
		"wahrscheinlich",
		"fast sicher",
	],
	impact: ["unwesentlich", "gering", "spürbar", "schwer", "existenzbedrohend"],
};

export const DEFAULT_RISK_APPETITE: RiskAppetite = {
	acceptable: 4,
	tolerable: 9,
};

export function clampScale(n: number): 1 | 2 | 3 | 4 | 5 {
	const v = Math.round(Number.isFinite(n) ? n : 3);
	return Math.min(5, Math.max(1, v)) as 1 | 2 | 3 | 4 | 5;
}

export function riskScore(likelihood: number, impact: number): number {
	return clampScale(likelihood) * clampScale(impact);
}

export function riskBand(score: number): RiskBand {
	if (score >= 15) return "critical";
	if (score >= 10) return "high";
	if (score >= 5) return "medium";
	return "low";
}

export function appetiteZone(
	score: number,
	appetite: RiskAppetite = DEFAULT_RISK_APPETITE,
): AppetiteZone {
	if (score <= appetite.acceptable) return "acceptable";
	if (score <= appetite.tolerable) return "tolerable";
	return "unacceptable";
}

export type RiskLike = {
	id: string;
	likelihood: number;
	impact: number;
	residualLikelihood?: number | null;
	residualImpact?: number | null;
};

export type RiskAssessment = {
	inherent: {
		likelihood: number;
		impact: number;
		score: number;
		band: RiskBand;
		zone: AppetiteZone;
	};
	residual: {
		likelihood: number;
		impact: number;
		score: number;
		band: RiskBand;
		zone: AppetiteZone;
	} | null;
	// Zum Steuern: residual wenn vorhanden, sonst inherent
	effective: { score: number; band: RiskBand; zone: AppetiteZone };
	aboveAppetite: boolean;
};

export function assessRisk(
	risk: RiskLike,
	appetite: RiskAppetite = DEFAULT_RISK_APPETITE,
): RiskAssessment {
	const il = clampScale(risk.likelihood);
	const ii = clampScale(risk.impact);
	const inherentScore = il * ii;
	const inherent = {
		likelihood: il,
		impact: ii,
		score: inherentScore,
		band: riskBand(inherentScore),
		zone: appetiteZone(inherentScore, appetite),
	};
	let residual: RiskAssessment["residual"] = null;
	if (risk.residualLikelihood != null && risk.residualImpact != null) {
		const rl = clampScale(risk.residualLikelihood);
		const ri = clampScale(risk.residualImpact);
		const s = rl * ri;
		residual = {
			likelihood: rl,
			impact: ri,
			score: s,
			band: riskBand(s),
			zone: appetiteZone(s, appetite),
		};
	}
	const eff = residual ?? inherent;
	return {
		inherent,
		residual,
		effective: { score: eff.score, band: eff.band, zone: eff.zone },
		aboveAppetite: eff.zone === "unacceptable",
	};
}

export type MatrixCell = {
	likelihood: 1 | 2 | 3 | 4 | 5;
	impact: 1 | 2 | 3 | 4 | 5;
	score: number;
	band: RiskBand;
	zone: AppetiteZone;
	riskIds: string[];
};

// 5×5-Matrix (Zeilen: Eintrittswahrscheinlichkeit 5 → 1, Spalten: Auswirkung
// 1 → 5), Chips je Zelle; Umschalter inhärent/residual.
export function riskMatrix(
	risks: readonly RiskLike[],
	view: "inherent" | "residual" = "inherent",
	appetite: RiskAppetite = DEFAULT_RISK_APPETITE,
): MatrixCell[][] {
	const rows: MatrixCell[][] = [];
	for (let l = 5; l >= 1; l--) {
		const row: MatrixCell[] = [];
		for (let i = 1; i <= 5; i++) {
			const score = l * i;
			row.push({
				likelihood: l as MatrixCell["likelihood"],
				impact: i as MatrixCell["impact"],
				score,
				band: riskBand(score),
				zone: appetiteZone(score, appetite),
				riskIds: [],
			});
		}
		rows.push(row);
	}
	for (const r of risks) {
		const a = assessRisk(r, appetite);
		const pos = view === "residual" ? (a.residual ?? a.inherent) : a.inherent;
		const cell = rows[5 - pos.likelihood]?.[pos.impact - 1];
		cell?.riskIds.push(r.id);
	}
	return rows;
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
