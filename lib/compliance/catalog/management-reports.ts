import type { ManagementReportKind, RoleFunction } from "@/db/schema/enums";

// Berichte an die Geschäftsleitung (N3): welche Funktion berichtet, welche
// Abschnitte der Klick-Zusammenfassung (management-review-digest.ts) die
// Kennzahlen liefern, welche Rahmenwerke den Bericht verlangen und wie oft.
// Rhythmen nach Modellwissen (meist jährlich, prüfen) — anlassbezogene
// Berichte gehen immer zusätzlich.

export type ReportKindDef = {
	kind: ManagementReportKind;
	title: string;
	author: RoleFunction | null;
	// Schlüssel aus MANAGEMENT_REVIEW_INPUTS
	sections: readonly string[];
	// gilt, wenn eines aktiv ist; null = immer wählbar, nie „fällig“
	frameworks: readonly string[] | null;
	legalBasis: string;
	cadenceMonths: number;
	// Control, an dem der Nachweis zählt (NW-GL-BERICHT)
	control: string;
};

export const REPORT_KINDS: readonly ReportKindDef[] = [
	{
		kind: "isms",
		title: "Bericht der Informationssicherheit",
		author: "isb_ciso",
		sections: [
			"nonconformities",
			"monitoring_results",
			"audit_results",
			"objectives",
			"risk_assessment",
			"improvement",
		],
		frameworks: ["iso27001", "nis2", "zag-marisk", "soc2"],
		legalBasis: "ISO 27001 5.3 b) · ZAG-MaRisk AT 7.2 · NIS2 Art. 20",
		cadenceMonths: 12,
		control: "CC-GOV-03",
	},
	{
		kind: "ict_risk",
		title: "IKT-Risikobericht",
		author: "ict_risk_function",
		sections: [
			"ict_framework",
			"risk_assessment",
			"third_parties",
			"nonconformities",
		],
		frameworks: ["dora"],
		legalBasis: "DORA Art. 5(2), Art. 6(5)",
		cadenceMonths: 12,
		control: "CC-GOV-03",
	},
	{
		kind: "aml",
		title: "Bericht der Geldwäschebeauftragten",
		author: "aml_officer",
		sections: ["aml_report"],
		frameworks: ["gwg", "amlr"],
		legalBasis: "§ 7 Abs. 5 GwG · AMLR Art. 11",
		cadenceMonths: 12,
		control: "CC-AML-03",
	},
	{
		kind: "compliance",
		title: "Bericht der Compliance-Funktion",
		author: "compliance",
		sections: ["compliance_report", "nonconformities", "party_feedback"],
		frameworks: ["zag-marisk", "micar", "kwg"],
		legalBasis: "ZAG-MaRisk AT 4.4.2 · MiCAR Art. 68",
		cadenceMonths: 12,
		control: "CC-GOV-13",
	},
	{
		kind: "privacy",
		title: "Tätigkeitsbericht Datenschutz",
		author: "dpo",
		sections: ["party_feedback", "nonconformities"],
		frameworks: ["dsgvo"],
		legalBasis: "DSGVO Art. 38 Abs. 3, Art. 39",
		cadenceMonths: 12,
		control: "CC-PRV-06",
	},
	{
		kind: "outsourcing",
		title: "Bericht zu Auslagerungen und Dienstleistern",
		author: "outsourcing_officer",
		sections: ["third_parties"],
		frameworks: ["dora", "zag-marisk", "micar"],
		legalBasis: "DORA Art. 28(2) · ZAG-MaRisk AT 9",
		cadenceMonths: 12,
		control: "CC-GOV-03",
	},
	{
		kind: "other",
		title: "Sonstiger Bericht",
		author: null,
		sections: [],
		frameworks: null,
		legalBasis: "—",
		cadenceMonths: 12,
		control: "CC-GOV-03",
	},
];

export const REPORT_KIND_BY_KEY = new Map(REPORT_KINDS.map((k) => [k.kind, k]));

export function applicableReportKinds(
	frameworks: readonly string[],
): ReportKindDef[] {
	const set = new Set(frameworks);
	return REPORT_KINDS.filter(
		(k) => k.frameworks?.some((f) => set.has(f)) ?? false,
	);
}

const addMonths = (iso: string, months: number) => {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCMonth(d.getUTCMonth() + months);
	return d.toISOString().slice(0, 10);
};

// Stand je anwendbarer Berichtsart: letzter vorgelegter Bericht, nächster
// Termin (Ende des letzten Zeitraums + Rhythmus), fällig/überfällig.
// Ohne Bericht ist er sofort fällig.
export function reportSchedule(
	kinds: readonly ReportKindDef[],
	reports: readonly {
		kind: ManagementReportKind;
		status: "draft" | "submitted";
		periodTo: string;
	}[],
	today: string,
): {
	kind: ReportKindDef;
	lastPeriodTo: string | null;
	nextDue: string | null;
	state: "ok" | "due" | "draft";
}[] {
	return kinds.map((k) => {
		const own = reports.filter((r) => r.kind === k.kind);
		const last = own
			.filter((r) => r.status === "submitted")
			.map((r) => r.periodTo)
			.sort()
			.at(-1);
		const nextDue = last ? addMonths(last, k.cadenceMonths) : null;
		const draft = own.some((r) => r.status === "draft");
		return {
			kind: k,
			lastPeriodTo: last ?? null,
			nextDue,
			state: draft ? "draft" : !nextDue || nextDue <= today ? "due" : "ok",
		};
	});
}

// Vorschlag für den Zeitraum eines neuen Berichts: ab dem Ende des letzten,
// sonst die letzten 12 Monate
export function suggestPeriod(
	lastPeriodTo: string | null,
	today: string,
): { from: string; to: string } {
	const from =
		lastPeriodTo && lastPeriodTo < today ? lastPeriodTo : addMonths(today, -12);
	return { from, to: today };
}
