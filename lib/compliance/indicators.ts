// Ziele mit Kennzahlen (B5): KPI (Leistung), KRI (Risiko), KCI (Kontrolle)
// mit Zielwert, Frühwarn- und Alarmschwelle und Messintervall. Pure,
// getestet (tests/indicators.test.ts).

export type IndicatorType = "kpi" | "kri" | "kci";
export type IndicatorDirection = "higher_better" | "lower_better";
export type IndicatorState =
	| "ok"
	| "warn"
	| "alert"
	| "overdue_measurement"
	| "no_data";

export type IndicatorInput = {
	direction: IndicatorDirection;
	targetValue: number | null;
	warnAt: number | null;
	alertAt: number | null;
	nextMeasureAt: string | null;
};

// „92 %“, „1.234,5“, „0,8“, „-3“ → Zahl; sonst null
export function parseNumeric(value: string): number | null {
	const m = /-?[\d.,]+/.exec(value.replace(/\s/g, ""));
	if (!m) return null;
	let s = m[0];
	if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
	else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
	const n = Number.parseFloat(s);
	return Number.isFinite(n) ? n : null;
}

// Wert gegen Schwellen: Alarm vor Frühwarnung; ohne Schwellen zählt der
// Zielwert als Frühwarngrenze.
export function valueState(
	v: number,
	o: Pick<IndicatorInput, "direction" | "targetValue" | "warnAt" | "alertAt">,
): "ok" | "warn" | "alert" {
	const worse = (x: number, limit: number) =>
		o.direction === "higher_better" ? x < limit : x > limit;
	if (o.alertAt !== null && worse(v, o.alertAt)) return "alert";
	const warn = o.warnAt ?? o.targetValue;
	if (warn !== null && worse(v, warn)) return "warn";
	return "ok";
}

export function indicatorState(
	o: IndicatorInput,
	measurements: readonly { measuredAt: string; numericValue: number | null }[],
	today: string,
): {
	state: IndicatorState;
	latest: number | null;
	trend: "better" | "worse" | "flat" | null;
	series: number[];
} {
	const series = measurements
		.filter((m) => m.numericValue !== null)
		.sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
		.map((m) => m.numericValue as number);
	const latest = series.at(-1) ?? null;
	const prev = series.at(-2) ?? null;
	const overdue = o.nextMeasureAt !== null && o.nextMeasureAt < today;
	const trend =
		latest === null || prev === null
			? null
			: latest === prev
				? "flat"
				: latest > prev === (o.direction === "higher_better")
					? "better"
					: "worse";
	if (latest === null)
		return {
			state: overdue ? "overdue_measurement" : "no_data",
			latest,
			trend,
			series,
		};
	const vs = valueState(latest, o);
	const state: IndicatorState =
		vs === "alert" ? "alert" : overdue ? "overdue_measurement" : vs;
	return { state, latest, trend, series };
}

export function addMonths(iso: string, months: number): string {
	const d = new Date(`${iso}T00:00:00Z`);
	const day = d.getUTCDate();
	d.setUTCMonth(d.getUTCMonth() + months);
	// 31.01. + 1 Monat → letzter Tag im Februar, nicht 03.03.
	if (d.getUTCDate() < day) d.setUTCDate(0);
	return d.toISOString().slice(0, 10);
}

// Vorlagen (Vorschläge zum Übernehmen)
export type IndicatorTemplate = {
	key: string;
	title: string;
	indicatorType: IndicatorType;
	kpiName: string;
	unit: string;
	direction: IndicatorDirection;
	targetValue: number;
	warnAt: number;
	alertAt: number;
	measureEveryMonths: number;
	frameworks: string[];
};

export const INDICATOR_TEMPLATES: readonly IndicatorTemplate[] = [
	{
		key: "training_rate",
		title: "Pflichtschulungen fristgerecht abgeschlossen",
		indicatorType: "kpi",
		kpiName: "Schulungsquote",
		unit: "%",
		direction: "higher_better",
		targetValue: 95,
		warnAt: 90,
		alertAt: 80,
		measureEveryMonths: 3,
		frameworks: ["iso27001", "nis2", "dora"],
	},
	{
		key: "failed_admin_logins",
		title: "Fehlgeschlagene Anmeldungen privilegierter Konten",
		indicatorType: "kri",
		kpiName: "Fehlversuche je Monat",
		unit: "Anzahl",
		direction: "lower_better",
		targetValue: 5,
		warnAt: 10,
		alertAt: 25,
		measureEveryMonths: 1,
		frameworks: ["iso27001", "dora"],
	},
	{
		key: "unpatched_critical",
		title: "Ungepatchte kritische Schwachstellen über Frist",
		indicatorType: "kri",
		kpiName: "offene kritische Befunde über SLA",
		unit: "Anzahl",
		direction: "lower_better",
		targetValue: 0,
		warnAt: 1,
		alertAt: 3,
		measureEveryMonths: 1,
		frameworks: ["iso27001", "nis2", "dora", "cra"],
	},
	{
		key: "phishing_click_rate",
		title: "Klickrate in Phishing-Simulationen",
		indicatorType: "kri",
		kpiName: "Klickrate",
		unit: "%",
		direction: "lower_better",
		targetValue: 5,
		warnAt: 10,
		alertAt: 20,
		measureEveryMonths: 3,
		frameworks: ["iso27001", "nis2"],
	},
	{
		key: "mfa_privileged",
		title: "MFA bei privilegierten Konten",
		indicatorType: "kci",
		kpiName: "MFA-Quote privilegierter Konten",
		unit: "%",
		direction: "higher_better",
		targetValue: 100,
		warnAt: 100,
		alertAt: 95,
		measureEveryMonths: 3,
		frameworks: ["iso27001", "nis2", "dora"],
	},
	{
		key: "access_reviews_on_time",
		title: "Zugriffsüberprüfungen termingerecht",
		indicatorType: "kci",
		kpiName: "termingerechte Access-Reviews",
		unit: "%",
		direction: "higher_better",
		targetValue: 100,
		warnAt: 90,
		alertAt: 75,
		measureEveryMonths: 3,
		frameworks: ["iso27001", "dora"],
	},
];
