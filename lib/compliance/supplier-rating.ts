import type {
	SupplierArea,
	SupplierCriterion,
	SupplierMethod,
	SupplierThreshold,
} from "@/db/schema/platform";
import type { RatingProfile, RatingScore } from "@/db/schema/supplier-ratings";
import { JURISDICTIONS } from "./catalog/jurisdictions";
import {
	defaultSupplierMethod,
	SUPPLIER_MEASURES,
	type SupplierMeasure,
} from "./catalog/supplier-criteria";

// Interne Lieferantenbewertung — rein. Bereichswert = Σ(Gewicht × Wert) /
// Σ Gewichte der bewerteten Kriterien; Gesamt = gewichteter Mittelwert der
// Bereiche (nur wenn beide bewertet sind); Niveau = höchste Schwelle ≤
// Gesamt; Wiedervorlage = Intervall der Schwelle, bei kritischen
// Dienstleistern höchstens criticalMaxMonths.

export type RatingProvider = {
	partnerType: string;
	isOutsourcing: boolean;
	isIct: boolean;
	criticality: "critical" | "important" | "standard";
	processesPersonalData: boolean;
	country: string | null;
	dataLocations: string[] | null;
	substitutability: "easy" | "difficult" | "not_substitutable" | null;
	dpaSignedAt: string | null;
	exitStrategy: string | null;
	exitPlanTestedAt: string | null;
	contractClauses: Record<string, boolean | string> | null;
};

export function resolveSupplierMethod(
	settings: { supplierMethod?: SupplierMethod | null } | null | undefined,
): SupplierMethod {
	return settings?.supplierMethod ?? defaultSupplierMethod();
}

export function applicableCriteria(
	method: Pick<SupplierMethod, "criteria">,
	provider: Pick<RatingProvider, "partnerType" | "isOutsourcing">,
	frameworks: readonly string[],
): SupplierCriterion[] {
	const fw = new Set(frameworks);
	return method.criteria.filter((c) => {
		if (!c.enabled || c.weight <= 0) return false;
		if (c.frameworks?.length && !c.frameworks.some((f) => fw.has(f)))
			return false;
		if (
			c.partnerTypes?.length &&
			!c.partnerTypes.includes(provider.partnerType)
		)
			return false;
		if (c.outsourcingOnly && !provider.isOutsourcing) return false;
		return true;
	});
}

function validScore(s: RatingScore | undefined): number | null {
	const v = s?.score;
	return typeof v === "number" && v >= 1 && v <= 5 ? v : null;
}

export function areaScore(
	criteria: readonly SupplierCriterion[],
	scores: Record<string, RatingScore>,
	area: SupplierArea,
): number | null {
	let sum = 0;
	let weights = 0;
	for (const c of criteria) {
		if (c.area !== area) continue;
		const v = validScore(scores[c.code]);
		if (v === null) continue;
		sum += c.weight * v;
		weights += c.weight;
	}
	return weights > 0 ? sum / weights : null;
}

export function totalScore(
	general: number | null,
	security: number | null,
	areaWeights: SupplierMethod["areaWeights"],
): number | null {
	if (general === null || security === null) return null;
	const w = areaWeights.general + areaWeights.security;
	if (w <= 0) return null;
	return (general * areaWeights.general + security * areaWeights.security) / w;
}

export function ratingLevel(
	total: number | null,
	thresholds: readonly SupplierThreshold[],
): SupplierThreshold | null {
	if (total === null) return null;
	const sorted = [...thresholds].sort((a, b) => a.min - b.min);
	let hit: SupplierThreshold | null = null;
	for (const t of sorted) if (total + 1e-9 >= t.min) hit = t;
	return hit;
}

export function nextReviewDate(
	from: Date,
	level: SupplierThreshold | null,
	criticality: RatingProvider["criticality"],
	method: Pick<SupplierMethod, "criticalMaxMonths">,
): string | null {
	if (!level) return null;
	const months =
		criticality === "critical"
			? Math.min(level.months, method.criticalMaxMonths)
			: level.months;
	const d = new Date(from);
	d.setUTCMonth(d.getUTCMonth() + months);
	return d.toISOString().slice(0, 10);
}

export type RatingSummary = {
	general: number | null;
	security: number | null;
	total: number | null;
	percent: number | null;
	level: SupplierThreshold | null;
	rated: number;
	open: SupplierCriterion[];
};

export function summarizeRating(
	criteria: readonly SupplierCriterion[],
	scores: Record<string, RatingScore>,
	areaWeights: SupplierMethod["areaWeights"],
	thresholds: readonly SupplierThreshold[],
): RatingSummary {
	const general = areaScore(criteria, scores, "general");
	const security = areaScore(criteria, scores, "security");
	const total = totalScore(general, security, areaWeights);
	const open = criteria.filter((c) => validScore(scores[c.code]) === null);
	return {
		general,
		security,
		total,
		percent: total === null ? null : Math.round((total / 5) * 100),
		level: ratingLevel(total, thresholds),
		rated: criteria.length - open.length,
		open,
	};
}

// ── Vorbelegung aus Stammdaten ──────────────────────────────────────────
export const EU_EEA = new Set([
	"AT",
	"BE",
	"BG",
	"HR",
	"CY",
	"CZ",
	"DK",
	"EE",
	"FI",
	"FR",
	"DE",
	"GR",
	"HU",
	"IE",
	"IT",
	"LV",
	"LT",
	"LU",
	"MT",
	"NL",
	"PL",
	"PT",
	"RO",
	"SK",
	"SI",
	"ES",
	"SE",
]);
const EEA_ONLY = new Set(["IS", "LI", "NO"]);
const HIGH_RISK = new Set(
	JURISDICTIONS.filter(
		(j) => j.euHighRisk || j.fatfStatus !== "none" || j.euSanctions,
	).map((j) => j.iso2),
);

export function locationScore(iso2: string): number {
	const c = iso2.trim().toUpperCase();
	if (HIGH_RISK.has(c)) return 1;
	if (EU_EEA.has(c)) return 5;
	if (EEA_ONLY.has(c)) return 4;
	if (c === "US") return 3;
	return 2;
}

// Länder aus „DE“, „EU“, „Frankfurt (DE)“ … herauslesen
function countriesOf(values: readonly string[]): string[] {
	const out: string[] = [];
	for (const v of values) {
		const s = v.trim().toUpperCase();
		if (s === "EU" || s === "EWR" || s === "EEA") {
			out.push("DE");
			continue;
		}
		const m = s.match(/\b([A-Z]{2})\b/);
		if (m?.[1]) out.push(m[1]);
	}
	return out;
}

export function prefillScores(
	provider: RatingProvider,
	criteria: readonly SupplierCriterion[],
): Record<string, RatingScore> {
	const out: Record<string, RatingScore> = {};
	const has = new Set(criteria.map((c) => c.code));
	const put = (code: string, score: number, why: string) => {
		if (has.has(code)) out[code] = { score, prefilled: why };
	};
	const countries = countriesOf([
		...(provider.country ? [provider.country] : []),
		...(provider.dataLocations ?? []),
	]);
	if (countries.length > 0) {
		const worst = Math.min(...countries.map(locationScore));
		put(
			"SC-G-06",
			worst,
			`Standort/Datenstandorte: ${[...new Set(countries)].join(", ")}`,
		);
	}
	const dataCountries = countriesOf(provider.dataLocations ?? []);
	if (dataCountries.length > 0) {
		const inEu = dataCountries.every((c) => EU_EEA.has(c) || EEA_ONLY.has(c));
		put(
			"SC-S-06",
			inEu ? 5 : 1,
			inEu ? "Datenstandorte nur in EU/EWR" : "Datenstandorte außerhalb EU/EWR",
		);
	}
	if (provider.substitutability) {
		const map = { easy: 4, difficult: 2, not_substitutable: 1 } as const;
		put(
			"SC-G-07",
			map[provider.substitutability],
			"Ersetzbarkeit laut Stammdaten",
		);
		put(
			"SC-G-05",
			map[provider.substitutability],
			"Ersetzbarkeit laut Stammdaten",
		);
	}
	if (provider.processesPersonalData && provider.dpaSignedAt)
		put("SC-S-07", 3, "AV-Vertrag geschlossen");
	if (provider.exitPlanTestedAt) put("SC-D-03", 5, "Ausstiegsplan getestet");
	else if (provider.exitStrategy)
		put("SC-D-03", 3, "Ausstiegsplan dokumentiert");
	const clauses = Object.values(provider.contractClauses ?? {});
	if (clauses.length > 0) {
		const yes = clauses.filter((v) => v === true).length;
		const ratio = yes / clauses.length;
		put(
			"SC-D-02",
			ratio >= 1 ? 4 : ratio >= 0.6 ? 3 : ratio > 0 ? 2 : 1,
			`${yes} von ${clauses.length} Art.-30-Klauseln erfüllt`,
		);
	}
	return out;
}

// ── Auslagerung: Entscheidungsbaum ──────────────────────────────────────
// 1. Tätigkeit, die das Institut sonst selbst erbringen würde?
// 2. Einmaliger oder gelegentlicher Bezug (Beratung, Gutachten)? → kein
//    Auslagerungstatbestand (sonstiger Fremdbezug).
// 3. Würde Ausfall/Schlechtleistung Geschäftsbetrieb, Kunden oder
//    aufsichtliche Pflichten erheblich beeinträchtigen? → wesentlich.
export type OutsourcingResult = {
	isOutsourcing: boolean;
	isMaterial: boolean;
	label: "fremdbezug" | "auslagerung" | "wesentliche_auslagerung" | "offen";
};

export function outsourcingDecision(
	p: Pick<RatingProfile, "instituteTask" | "oneOff" | "material">,
): OutsourcingResult {
	if (p.instituteTask == null)
		return { isOutsourcing: false, isMaterial: false, label: "offen" };
	if (!p.instituteTask || p.oneOff)
		return { isOutsourcing: false, isMaterial: false, label: "fremdbezug" };
	if (p.material == null)
		return { isOutsourcing: true, isMaterial: false, label: "offen" };
	return p.material
		? {
				isOutsourcing: true,
				isMaterial: true,
				label: "wesentliche_auslagerung",
			}
		: { isOutsourcing: true, isMaterial: false, label: "auslagerung" };
}

// ── Maßnahmen ───────────────────────────────────────────────────────────
export function suggestedMeasures(
	traffic: "green" | "amber" | "red" | null,
	provider: Pick<
		RatingProvider,
		"processesPersonalData" | "isOutsourcing" | "criticality" | "partnerType"
	> & { isMaterial: boolean },
	frameworks: readonly string[],
): SupplierMeasure[] {
	if (!traffic) return [];
	const fw = new Set(frameworks);
	return SUPPLIER_MEASURES.filter((m) => {
		if (!m.traffic.includes(traffic)) return false;
		if (m.frameworks && !m.frameworks.some((f) => fw.has(f))) return false;
		switch (m.when) {
			case "personalData":
				return provider.processesPersonalData;
			case "outsourcing":
				return provider.isOutsourcing && provider.isMaterial;
			case "critical":
				return provider.criticality === "critical";
			case "cryptoPartner":
				return ["bank", "issuer", "exchange", "custodian"].includes(
					provider.partnerType,
				);
			default:
				return true;
		}
	});
}

export function nextRatingCode(existing: readonly string[], now: Date): string {
	const year = now.getUTCFullYear();
	const prefix = `LR-${year}-`;
	let max = 0;
	for (const c of existing)
		if (c.startsWith(prefix))
			max = Math.max(max, Number(c.slice(prefix.length)) || 0);
	return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

// Freigabe bei rotem Ergebnis nur über Workflow/Geschäftsleitung.
export function decisionNeedsManagement(
	traffic: "green" | "amber" | "red" | null,
	decision: "approved" | "approved_with_conditions" | "rejected" | "open",
): boolean {
	return (
		traffic === "red" &&
		(decision === "approved" || decision === "approved_with_conditions")
	);
}

export function decisionNeedsNote(
	traffic: "green" | "amber" | "red" | null,
	decision: "approved" | "approved_with_conditions" | "rejected" | "open",
): boolean {
	if (decision === "open") return false;
	return !(decision === "approved" && traffic === "green");
}
