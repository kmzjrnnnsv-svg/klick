import type {
	CatalogJurisdiction,
	CorridorStatus,
	FatfStatus,
	OrgStance,
} from "./catalog/jurisdictions";

// AML — reine Helfer für /aml: laufende Nummern für Verdachtsmeldungen und
// STOR, Durchführungsverbot (§ 46 GwG: drei Werktage nach Meldung), Kennzahlen
// für den GWB-Jahresbericht, CSV-Import der Länderliste, Änderungs-Erkennung
// (Listenänderung → Aufgabe an die GWB). Kein Rechtsrat.

export type SuspiciousKind = "gwg_sar" | "micar_stor";
export type SuspiciousStatus = "review" | "reported" | "dismissed";

const PREFIX: Record<SuspiciousKind, string> = {
	gwg_sar: "VM",
	micar_stor: "STOR",
};

// VM-2026-001 / STOR-2026-003 — Zähler je Art und Jahr.
export function nextSuspiciousRef(
	existing: readonly string[],
	kind: SuspiciousKind,
	now = new Date(),
): string {
	const year = now.getFullYear();
	const prefix = `${PREFIX[kind]}-${year}-`;
	let max = 0;
	for (const ref of existing) {
		if (!ref.startsWith(prefix)) continue;
		const n = Number.parseInt(ref.slice(prefix.length), 10);
		if (Number.isFinite(n) && n > max) max = n;
	}
	return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

// Werktage Mo–Fr (Feiertage bewusst nicht berücksichtigt — konservativ).
export function addBusinessDays(from: Date, days: number): Date {
	const d = new Date(from);
	let left = days;
	while (left > 0) {
		d.setUTCDate(d.getUTCDate() + 1);
		const wd = d.getUTCDay();
		if (wd !== 0 && wd !== 6) left -= 1;
	}
	return d;
}

// § 46 GwG: Die Transaktion darf frühestens durchgeführt werden, wenn die
// FIU zugestimmt hat oder drei Werktage nach Abgang der Meldung verstrichen
// sind, ohne dass die FIU untersagt hat.
export function sarHoldUntil(reportedAt: Date): Date {
	return addBusinessDays(reportedAt, 3);
}

export type SuspiciousRow = {
	kind: SuspiciousKind;
	status: SuspiciousStatus;
	detectedAt: Date;
	decidedAt: Date | null;
	reportedAt: Date | null;
	holdUntil: Date | null;
};

export type SuspiciousStats = {
	open: number;
	onHold: number; // gemeldet, Durchführungsverbot läuft noch
	reportedThisYear: number;
	dismissedThisYear: number;
	byKind: Record<SuspiciousKind, number>;
	avgDecisionDays: number | null;
};

export function aggregateSuspicious(
	rows: readonly SuspiciousRow[],
	now = new Date(),
): SuspiciousStats {
	const year = now.getFullYear();
	let open = 0;
	let onHold = 0;
	let reported = 0;
	let dismissed = 0;
	const byKind: Record<SuspiciousKind, number> = { gwg_sar: 0, micar_stor: 0 };
	const decisionDays: number[] = [];
	for (const r of rows) {
		byKind[r.kind] += 1;
		if (r.status === "review") open += 1;
		if (r.status === "reported" && r.holdUntil && r.holdUntil > now)
			onHold += 1;
		const decidedYear = r.decidedAt?.getFullYear();
		if (r.status === "reported" && decidedYear === year) reported += 1;
		if (r.status === "dismissed" && decidedYear === year) dismissed += 1;
		if (r.decidedAt)
			decisionDays.push(
				(r.decidedAt.getTime() - r.detectedAt.getTime()) / 86_400_000,
			);
	}
	return {
		open,
		onHold,
		reportedThisYear: reported,
		dismissedThisYear: dismissed,
		byKind,
		avgDecisionDays:
			decisionDays.length === 0
				? null
				: Math.round(
						(decisionDays.reduce((a, b) => a + b, 0) / decisionDays.length) *
							10,
					) / 10,
	};
}

// ── Länderliste: CSV-Import ────────────────────────────────────────────────
// Spalten (Kopfzeile, Trenner ; oder ,): iso2;name;euHighRisk;fatfStatus;
// euSanctions;usSanctions;orgStance;corridorStatus;legalNotes

const FATF: readonly FatfStatus[] = ["none", "grey", "black"];
const STANCE: readonly OrgStance[] = ["allowed", "enhanced_dd", "blocked"];
const CORRIDOR: readonly CorridorStatus[] = [
	"none",
	"evaluating",
	"pilot",
	"active",
	"suspended",
];

function bool(v: string | undefined): boolean | null {
	if (v === undefined) return null;
	const s = v.trim().toLowerCase();
	if (["1", "true", "ja", "yes", "x", "wahr"].includes(s)) return true;
	if (["0", "false", "nein", "no", "", "falsch"].includes(s)) return false;
	return null;
}

export type JurisdictionCsvResult = {
	rows: CatalogJurisdiction[];
	errors: string[];
};

export function parseJurisdictionCsv(text: string): JurisdictionCsvResult {
	const lines = text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	const rows: CatalogJurisdiction[] = [];
	const errors: string[] = [];
	if (lines.length === 0) return { rows, errors: ["leer"] };
	const sep = lines[0]?.includes(";") ? ";" : ",";
	const header = lines[0]
		?.split(sep)
		.map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
	if (!header?.includes("iso2")) {
		return { rows, errors: ["Kopfzeile ohne Spalte iso2"] };
	}
	const idx = (name: string) => header.indexOf(name.toLowerCase());
	const seen = new Set<string>();
	for (let i = 1; i < lines.length; i++) {
		const cells = (lines[i] ?? "")
			.split(sep)
			.map((c) => c.trim().replace(/^"|"$/g, ""));
		const get = (name: string) => {
			const k = idx(name);
			return k >= 0 ? cells[k] : undefined;
		};
		const iso2 = (get("iso2") ?? "").toUpperCase();
		if (!/^[A-Z]{2}$/.test(iso2)) {
			errors.push(`Zeile ${i + 1}: ungültiger ISO2-Code „${iso2}“`);
			continue;
		}
		if (seen.has(iso2)) {
			errors.push(`Zeile ${i + 1}: ${iso2} doppelt`);
			continue;
		}
		seen.add(iso2);
		const fatf = (get("fatfStatus") ?? "none").toLowerCase() as FatfStatus;
		const stance = (get("orgStance") ?? "allowed").toLowerCase() as OrgStance;
		const corridor = (
			get("corridorStatus") ?? "none"
		).toLowerCase() as CorridorStatus;
		if (!FATF.includes(fatf)) {
			errors.push(`Zeile ${i + 1}: fatfStatus „${fatf}“ unbekannt`);
			continue;
		}
		if (!STANCE.includes(stance)) {
			errors.push(`Zeile ${i + 1}: orgStance „${stance}“ unbekannt`);
			continue;
		}
		if (!CORRIDOR.includes(corridor)) {
			errors.push(`Zeile ${i + 1}: corridorStatus „${corridor}“ unbekannt`);
			continue;
		}
		rows.push({
			iso2,
			name: get("name") || iso2,
			euHighRisk: bool(get("euHighRisk")) ?? false,
			fatfStatus: fatf,
			euSanctions: bool(get("euSanctions")) ?? false,
			usSanctions: bool(get("usSanctions")) ?? false,
			orgStance: stance,
			corridorStatus: corridor,
			legalNotes: get("legalNotes") || undefined,
		});
	}
	return { rows, errors };
}

// Welche listenrelevanten Felder sich geändert haben — löst eine Aufgabe an
// die Geldwäschebeauftragte Person aus (Länderrisiko neu bewerten).
export function listRelevantChanges(
	before: Pick<
		CatalogJurisdiction,
		"euHighRisk" | "fatfStatus" | "euSanctions" | "usSanctions"
	> | null,
	after: Pick<
		CatalogJurisdiction,
		"euHighRisk" | "fatfStatus" | "euSanctions" | "usSanctions"
	>,
): string[] {
	if (!before) return [];
	const changes: string[] = [];
	if (before.euHighRisk !== after.euHighRisk)
		changes.push(`EU-Hochrisiko: ${before.euHighRisk} → ${after.euHighRisk}`);
	if (before.fatfStatus !== after.fatfStatus)
		changes.push(`FATF: ${before.fatfStatus} → ${after.fatfStatus}`);
	if (before.euSanctions !== after.euSanctions)
		changes.push(`EU-Sanktionen: ${before.euSanctions} → ${after.euSanctions}`);
	if (before.usSanctions !== after.usSanctions)
		changes.push(`US-Sanktionen: ${before.usSanctions} → ${after.usSanctions}`);
	return changes;
}

// Risikoanalyse: Dimensionen mit Faktoren und Score 1–5 → Gesamtrisiko.
export type RiskDimension = {
	factors: string;
	score: number;
	measures?: string;
};
export type RiskDimensions = {
	customer: RiskDimension;
	product: RiskDimension;
	country: RiskDimension;
	channel: RiskDimension;
};

export const EMPTY_DIMENSIONS: RiskDimensions = {
	customer: { factors: "", score: 3 },
	product: { factors: "", score: 3 },
	country: { factors: "", score: 3 },
	channel: { factors: "", score: 3 },
};

export function overallAmlRisk(d: RiskDimensions): "low" | "medium" | "high" {
	const scores = [d.customer, d.product, d.country, d.channel].map((x) =>
		Math.min(5, Math.max(1, x.score)),
	);
	const max = Math.max(...scores);
	const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
	if (max >= 5 || avg >= 3.75) return "high";
	if (max >= 4 || avg >= 2.5) return "medium";
	return "low";
}
