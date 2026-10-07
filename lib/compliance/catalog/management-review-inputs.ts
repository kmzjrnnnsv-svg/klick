// Pflicht-Inputs der Managementbewertung (ISO 27001 9.3.2) und Pendants
// (DORA Art. 6(5) jährliche Überprüfung des IKT-Rahmens, NIS2 Art. 20(1),
// ZAG-MaRisk AT 4.4.2 Berichtspflicht). Eine Bewertung kann erst als „done"
// gespeichert werden, wenn jeder anwendbare Input abgehakt ist.

export type ReviewInput = {
	key: string;
	title: string;
	hint: string;
	legalBasis: string;
	// nur bei diesen Rahmenwerken (leer = immer)
	frameworks?: readonly string[];
	// Modul, aus dem der Input kommt (Deep-Link)
	href?: string;
};

export const MANAGEMENT_REVIEW_INPUTS: readonly ReviewInput[] = [
	{
		key: "previous_actions",
		title: "Status der Maßnahmen aus früheren Bewertungen",
		hint: "Offene Beschlüsse und Aufgaben der letzten Managementbewertung durchgehen.",
		legalBasis: "ISO 27001 9.3.2 a)",
		href: "/managementbewertung",
	},
	{
		key: "context_changes",
		title: "Änderungen externer und interner Themen",
		hint: "Kontext und interessierte Parteien (Regulierung, Markt, Technik, Personal).",
		legalBasis: "ISO 27001 9.3.2 b) · DORA Art. 6(5)",
		href: "/organisation?tab=kontext",
	},
	{
		key: "party_expectations",
		title: "Änderungen der Erwartungen interessierter Parteien",
		hint: "Neue Anforderungen von Aufsicht, Kunden, Partnerbank, Mitarbeitenden.",
		legalBasis: "ISO 27001 9.3.2 c)",
		href: "/organisation?tab=kontext",
	},
	{
		key: "nonconformities",
		title: "Abweichungen und Korrekturmaßnahmen",
		hint: "Offene und abgeschlossene Abweichungen, Wirksamkeit der Korrekturen.",
		legalBasis: "ISO 27001 9.3.2 d) 1) · 10.2",
		href: "/abweichungen",
	},
	{
		key: "monitoring_results",
		title: "Ergebnisse von Überwachung und Messung",
		hint: "Kennzahlen, Wirksamkeitstests, Abdeckung je Rahmenwerk, Posture-Trend.",
		legalBasis: "ISO 27001 9.3.2 d) 2) · 9.1",
		href: "/ueberblick",
	},
	{
		key: "audit_results",
		title: "Auditergebnisse",
		hint: "Interne und externe Audits des Zeitraums, Findings, Follow-up.",
		legalBasis: "ISO 27001 9.3.2 d) 3) · 9.2",
		href: "/audits",
	},
	{
		key: "objectives",
		title: "Erreichung der Informationssicherheitsziele",
		hint: "Ziele und KPIs mit Messreihen.",
		legalBasis: "ISO 27001 9.3.2 d) 4) · 6.2",
		href: "/organisation?tab=ziele",
	},
	{
		key: "party_feedback",
		title: "Rückmeldungen interessierter Parteien",
		hint: "Beschwerden, Aufsichtskontakte, Kundenfeedback, Hinweise.",
		legalBasis: "ISO 27001 9.3.2 e)",
		href: "/organisation?tab=aufsicht",
	},
	{
		key: "risk_assessment",
		title: "Ergebnisse der Risikobeurteilung und Stand des Behandlungsplans",
		hint: "Risiken über Appetit, offene Maßnahmen, akzeptierte Risiken.",
		legalBasis: "ISO 27001 9.3.2 f) · DORA Art. 6(5)",
		href: "/risiken",
	},
	{
		key: "improvement",
		title: "Möglichkeiten zur fortlaufenden Verbesserung",
		hint: "Vorschläge, Lessons Learned aus Vorfällen, Benchmark.",
		legalBasis: "ISO 27001 9.3.2 g) · DORA Art. 13",
	},
	{
		key: "ict_framework",
		title: "Überprüfung des IKT-Risikomanagementrahmens",
		hint: "Jährlich sowie nach schwerwiegenden Vorfällen und Aufsichtsanweisungen; Ergebnisse der Resilienztests.",
		legalBasis: "DORA Art. 6(5), Art. 13(3)",
		frameworks: ["dora"],
		href: "/testprogramm",
	},
	{
		key: "third_parties",
		title: "Drittparteien-Risiko und Konzentrationen",
		hint: "Wesentliche Dienstleister, Vertragsklauseln, Exit-Pläne, Informationsregister.",
		legalBasis: "DORA Art. 28(2) · ZAG-MaRisk AT 9",
		frameworks: ["dora", "zag-marisk", "micar"],
		href: "/dienstleister",
	},
	{
		key: "aml_report",
		title: "Bericht der Geldwäschebeauftragten",
		hint: "Jahresbericht, Verdachtsmeldungen, Risikoanalyse, Schulungsstand.",
		legalBasis: "§ 7 Abs. 5 GwG",
		frameworks: ["gwg", "amlr"],
		href: "/aml",
	},
	{
		key: "compliance_report",
		title: "Bericht der Compliance-Funktion",
		hint: "Wesentliche Rechtsänderungen, Compliance-Risiken, offene Maßnahmen.",
		legalBasis: "ZAG-MaRisk AT 4.4.2 Tz. 6 · MiCAR Art. 68",
		frameworks: ["zag-marisk", "micar", "kwg"],
		href: "/kalender",
	},
];

export function applicableReviewInputs(
	frameworks: readonly string[],
): ReviewInput[] {
	const set = new Set(frameworks);
	return MANAGEMENT_REVIEW_INPUTS.filter(
		(i) => !i.frameworks || i.frameworks.some((f) => set.has(f)),
	);
}

export function reviewComplete(
	inputs: Record<string, { done: boolean } | undefined>,
	applicable: readonly ReviewInput[],
): { complete: boolean; missing: string[] } {
	const missing = applicable
		.filter((i) => !inputs[i.key]?.done)
		.map((i) => i.key);
	return { complete: missing.length === 0, missing };
}
