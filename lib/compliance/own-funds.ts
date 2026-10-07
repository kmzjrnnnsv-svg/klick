import type { CaspService } from "@/db/schema/enums";

// Eigenmittel — reine Rechenfunktionen (kein Rechtsrat, Zahlen gegen den
// aktuellen Gesetzesstand prüfen):
//   MiCAR Art. 67 + Anhang IV: Mindestkapital je Dienstklasse
//     (50 000 / 125 000 / 150 000 €) oder ¼ der fixen Gemeinkosten des
//     Vorjahres — der höhere Wert.
//   ZAG § 15 (PSD2 Art. 9): laufende Eigenmittel nach Methode A, B oder C,
//     jeweils × Skalierungsfaktor k (0,5 nur Finanztransfer, sonst 1,0).
//   ZAG § 12 (PSD2 Art. 7): Anfangskapital 20 000 / 50 000 / 125 000 €.
// Für ein Institut mit beiden Erlaubnissen gilt die Summe als Planungsgröße
// (Businessplan 12.4); die Aufsicht kann im Einzelfall anders anrechnen.

export type MicarClass = 1 | 2 | 3;

export const MICAR_MIN_CAPITAL: Record<MicarClass, number> = {
	1: 50_000,
	2: 125_000,
	3: 150_000,
};

// Anhang IV: Klasse 1 Ausführung/Platzierung/Transfer/Annahme-Übermittlung/
// Beratung/Portfolio; Klasse 2 zusätzlich Verwahrung; Klasse 3 Tausch oder
// Handelsplattform.
export function micarClassFor(services: readonly CaspService[]): MicarClass {
	if (services.includes("exchange") || services.includes("platform")) return 3;
	if (services.includes("custody")) return 2;
	return 1;
}

export type MicarOwnFunds = {
	micarClass: MicarClass;
	minCapital: number;
	overheadsQuarter: number;
	required: number;
	basis: "min_capital" | "fixed_overheads";
};

export function micarOwnFunds(input: {
	micarClass: MicarClass;
	fixedOverheadsPrevYear: number;
}): MicarOwnFunds {
	const minCapital = MICAR_MIN_CAPITAL[input.micarClass];
	const overheadsQuarter = round2(
		Math.max(0, input.fixedOverheadsPrevYear) / 4,
	);
	const required = Math.max(minCapital, overheadsQuarter);
	return {
		micarClass: input.micarClass,
		minCapital,
		overheadsQuarter,
		required,
		basis: overheadsQuarter > minCapital ? "fixed_overheads" : "min_capital",
	};
}

export type ZagMethod = "A" | "B" | "C";

export type ZagPaymentServiceKind =
	| "money_remittance_only" // nur Finanztransfer (Nr. 6) → k = 0,5
	| "payment_initiation_only" // nur Zahlungsauslösedienst (Nr. 7) → Anfangskapital 50 000
	| "other"; // Akquisitionsgeschäft u. a. → k = 1,0, Anfangskapital 125 000

// § 12 ZAG / PSD2 Art. 7
export function zagInitialCapital(kind: ZagPaymentServiceKind): number {
	switch (kind) {
		case "money_remittance_only":
			return 20_000;
		case "payment_initiation_only":
			return 50_000;
		default:
			return 125_000;
	}
}

// PSD2 Art. 9(1) Methode B: k = 0,5 bei ausschließlich Finanztransfer, sonst 1.
export function scalingFactor(kind: ZagPaymentServiceKind): number {
	return kind === "money_remittance_only" ? 0.5 : 1;
}

// Gestaffelte Sätze auf das Zahlungsvolumen (PV = 1/12 des Vorjahres-
// Transaktionsvolumens): 4 % bis 5 Mio, 2,5 % bis 10 Mio, 1 % bis 100 Mio,
// 0,5 % bis 250 Mio, 0,25 % darüber.
const METHOD_B_BANDS: readonly { upTo: number; rate: number }[] = [
	{ upTo: 5_000_000, rate: 0.04 },
	{ upTo: 10_000_000, rate: 0.025 },
	{ upTo: 100_000_000, rate: 0.01 },
	{ upTo: 250_000_000, rate: 0.005 },
	{ upTo: Number.POSITIVE_INFINITY, rate: 0.0025 },
];

// Methode C: Faktor auf den „relevanten Indikator" (Zins-, Provisions-,
// sonstige Erträge des Vorjahres): 10 % bis 2,5 Mio, 8 % bis 5 Mio, 6 % bis
// 25 Mio, 3 % bis 50 Mio, 1,5 % darüber.
const METHOD_C_BANDS: readonly { upTo: number; rate: number }[] = [
	{ upTo: 2_500_000, rate: 0.1 },
	{ upTo: 5_000_000, rate: 0.08 },
	{ upTo: 25_000_000, rate: 0.06 },
	{ upTo: 50_000_000, rate: 0.03 },
	{ upTo: Number.POSITIVE_INFINITY, rate: 0.015 },
];

function tiered(
	amount: number,
	bands: readonly { upTo: number; rate: number }[],
): number {
	let rest = Math.max(0, amount);
	let lower = 0;
	let sum = 0;
	for (const band of bands) {
		if (rest <= 0) break;
		const width = Math.min(rest, band.upTo - lower);
		sum += width * band.rate;
		rest -= width;
		lower = band.upTo;
	}
	return sum;
}

export type ZagOwnFundsInput = {
	method: ZagMethod;
	serviceKind: ZagPaymentServiceKind;
	// Methode A
	fixedOverheadsPrevYear?: number;
	// Methode B: durchschnittliches monatliches Zahlungsvolumen (1/12 Vorjahr)
	monthlyPaymentVolume?: number;
	// Methode C: relevanter Indikator (Vorjahreserträge)
	relevantIndicator?: number;
};

export type ZagOwnFunds = {
	method: ZagMethod;
	k: number;
	initialCapital: number;
	computed: number; // Methodenwert × k
	required: number; // = computed (Anfangskapital ist Zulassungsvoraussetzung)
};

export function zagOwnFunds(input: ZagOwnFundsInput): ZagOwnFunds {
	const k = scalingFactor(input.serviceKind);
	let base = 0;
	switch (input.method) {
		case "A":
			base = Math.max(0, input.fixedOverheadsPrevYear ?? 0) * 0.1;
			break;
		case "B":
			base = tiered(input.monthlyPaymentVolume ?? 0, METHOD_B_BANDS);
			break;
		case "C":
			base = tiered(input.relevantIndicator ?? 0, METHOD_C_BANDS);
			break;
	}
	const computed = round2(base * k);
	return {
		method: input.method,
		k,
		initialCapital: zagInitialCapital(input.serviceKind),
		computed,
		required: computed,
	};
}

export type OwnFundsInput = {
	micar?: { micarClass: MicarClass; fixedOverheadsPrevYear: number } | null;
	zag?: ZagOwnFundsInput | null;
	availableOwnFunds?: number | null;
};

export type OwnFundsResult = {
	micar: MicarOwnFunds | null;
	zag: ZagOwnFunds | null;
	totalRequired: number;
	availableOwnFunds: number | null;
	buffer: number | null; // verfügbar − erforderlich
	coverageRatio: number | null; // verfügbar / erforderlich
	status: "ok" | "tight" | "short" | "unknown";
};

// Gesamtbild: Summe der Pflichten, Puffer, Deckungsquote. „tight" ab < 20 %
// Puffer (interne Warnschwelle, kein Rechtsbegriff).
export function calculateOwnFunds(input: OwnFundsInput): OwnFundsResult {
	const micar = input.micar ? micarOwnFunds(input.micar) : null;
	const zag = input.zag ? zagOwnFunds(input.zag) : null;
	const totalRequired = round2((micar?.required ?? 0) + (zag?.required ?? 0));
	const available =
		input.availableOwnFunds === undefined || input.availableOwnFunds === null
			? null
			: input.availableOwnFunds;
	const buffer = available === null ? null : round2(available - totalRequired);
	const coverageRatio =
		available === null || totalRequired === 0
			? null
			: Math.round((available / totalRequired) * 1000) / 1000;
	let status: OwnFundsResult["status"] = "unknown";
	if (buffer !== null) {
		if (buffer < 0) status = "short";
		else if (totalRequired > 0 && buffer / totalRequired < 0.2)
			status = "tight";
		else status = "ok";
	}
	return {
		micar,
		zag,
		totalRequired,
		availableOwnFunds: available,
		buffer,
		coverageRatio,
		status,
	};
}

// ── Risikotragfähigkeit (ZAG-MaRisk AT 4.1) ────────────────────────────────
// Risikodeckungspotenzial (Kapital + anrechenbare Liquidität) gegen die
// quantifizierten wesentlichen Risiken (Limite je Risikoart). Einfache
// Going-Concern-Sicht: Deckung = Potenzial / Σ Risikobeträge.

export type RiskBearingInput = {
	ownFunds: number;
	liquidityBuffer?: number;
	// Kapital, das bereits durch Mindestanforderungen gebunden ist
	regulatoryMinimum?: number;
	risks: readonly { category: string; amount: number }[];
};

export type RiskBearingResult = {
	potential: number; // frei verfügbares Deckungspotenzial
	totalRisk: number;
	utilisationPct: number | null; // Σ Risiko / Potenzial
	headroom: number;
	status: "ok" | "tight" | "exceeded" | "unknown";
	byCategory: { category: string; amount: number; sharePct: number }[];
};

export function riskBearingCapacity(
	input: RiskBearingInput,
): RiskBearingResult {
	const potential = round2(
		Math.max(
			0,
			input.ownFunds +
				(input.liquidityBuffer ?? 0) -
				(input.regulatoryMinimum ?? 0),
		),
	);
	const totalRisk = round2(
		input.risks.reduce((s, r) => s + Math.max(0, r.amount), 0),
	);
	const utilisationPct =
		potential > 0 ? Math.round((totalRisk / potential) * 1000) / 10 : null;
	const headroom = round2(potential - totalRisk);
	let status: RiskBearingResult["status"] = "unknown";
	if (potential > 0 || totalRisk > 0) {
		if (headroom < 0) status = "exceeded";
		else if (utilisationPct !== null && utilisationPct > 80) status = "tight";
		else status = "ok";
	}
	return {
		potential,
		totalRisk,
		utilisationPct,
		headroom,
		status,
		byCategory: input.risks.map((r) => ({
			category: r.category,
			amount: round2(Math.max(0, r.amount)),
			sharePct:
				totalRisk > 0
					? Math.round((Math.max(0, r.amount) / totalRisk) * 1000) / 10
					: 0,
		})),
	};
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}
