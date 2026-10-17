import { berlinDate, endOfBerlinDay } from "@/lib/time/berlin";
import { DEFAULT_LAND, type Land, nthWorkdayAfter } from "@/lib/time/holidays";

// Gesellschafter und Inhaberkontrolle (MiCAR Art. 83–85, § 14 ZAG,
// InhKontrollV): Schwellen 10 / 20 / 30 / 50 % (Anteile oder Stimmrechte),
// Beurteilungszeitraum der Aufsicht 60 Arbeitstage ab vollständiger Anzeige.
// Orientierung, kein Rechtsrat.

export const HOLDING_THRESHOLDS = [10, 20, 30, 50] as const;
export type HoldingThreshold = (typeof HOLDING_THRESHOLDS)[number];

export function thresholdCrossed(
	sharePct: number | null | undefined,
	votingPct: number | null | undefined,
): HoldingThreshold | null {
	const pct = Math.max(sharePct ?? 0, votingPct ?? 0);
	let hit: HoldingThreshold | null = null;
	for (const t of HOLDING_THRESHOLDS) if (pct >= t) hit = t;
	return hit;
}

// 60 Arbeitstage (§ 2c Abs. 1a KWG; § 14 ZAG und Art. 84 MiCAR verweisen
// darauf). Die Frist beginnt mit der schriftlichen Eingangsbestätigung der
// vollständigen Anzeige durch die Aufsicht; Informationsanforderungen hemmen
// sie (nicht modelliert). Arbeitstage = Mo–Fr ohne Feiertage, Ende des Tages.
export const ASSESSMENT_BUSINESS_DAYS = 60;

export function inhaberkontrolleDeadline(
	confirmedAt: Date | string,
	land: Land = DEFAULT_LAND,
): Date {
	const start =
		typeof confirmedAt === "string" ? confirmedAt : berlinDate(confirmedAt);
	return endOfBerlinDay(
		nthWorkdayAfter(start, ASSESSMENT_BUSINESS_DAYS, { land }),
	);
}

export type ShareholderLike = {
	name: string;
	sharePct: number | null;
	votingPct: number | null;
	inhaberkontrolleStatus: "not_required" | "pending" | "approved" | "rejected";
	notifiedAt: string | null; // ISO-Datum
	approvedAt: string | null;
	sanctionsCheckedAt: string | null;
};

export type ShareholderGap = {
	name: string;
	kind:
		| "threshold_without_notice" // Schwelle überschritten, keine Anzeige
		| "assessment_overdue" // Anzeige > 60 Arbeitstage ohne Entscheidung
		| "sanctions_check_missing"
		| "sanctions_check_stale"; // > 365 Tage
	detail: string;
};

export function shareholderGaps(
	rows: readonly ShareholderLike[],
	now = new Date(),
	land: Land = DEFAULT_LAND,
): ShareholderGap[] {
	const gaps: ShareholderGap[] = [];
	for (const s of rows) {
		const threshold = thresholdCrossed(s.sharePct, s.votingPct);
		if (threshold && s.inhaberkontrolleStatus === "not_required") {
			gaps.push({
				name: s.name,
				kind: "threshold_without_notice",
				detail: `≥ ${threshold} % — Anzeige nach InhKontrollV erforderlich`,
			});
		}
		if (s.inhaberkontrolleStatus === "pending" && s.notifiedAt) {
			const due = inhaberkontrolleDeadline(s.notifiedAt, land);
			if (due < now)
				gaps.push({
					name: s.name,
					kind: "assessment_overdue",
					detail: `Beurteilungszeitraum seit ${berlinDate(due)} abgelaufen — Stand bei der Aufsicht erfragen`,
				});
		}
		if (threshold) {
			if (!s.sanctionsCheckedAt)
				gaps.push({
					name: s.name,
					kind: "sanctions_check_missing",
					detail: "Kein Sanktions-/PEP-Abgleich dokumentiert",
				});
			else if (
				now.getTime() -
					new Date(`${s.sanctionsCheckedAt}T00:00:00Z`).getTime() >
				365 * 86_400_000
			)
				gaps.push({
					name: s.name,
					kind: "sanctions_check_stale",
					detail: `Letzter Abgleich ${s.sanctionsCheckedAt} — älter als zwölf Monate`,
				});
		}
	}
	return gaps;
}

// Summe der erfassten Anteile — > 100 % ist ein Erfassungsfehler.
export function totalSharePct(
	rows: readonly { sharePct: number | null }[],
): number {
	return (
		Math.round(rows.reduce((s, r) => s + (r.sharePct ?? 0), 0) * 100) / 100
	);
}
