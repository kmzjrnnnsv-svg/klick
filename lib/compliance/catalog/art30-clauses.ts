// DORA Art. 30 — vertragliche Mindestinhalte für IKT-Dienstleistungen.
// Abs. 2 gilt für alle Verträge, Abs. 3 zusätzlich für kritische oder wichtige
// Funktionen. Genutzt von der Klausel-Checkliste je Dienstleister, vom
// Lieferantenpaket (Anhang) und von /vertrauen (Zusagen der Plattform).
// Paraphrasen des Gesetzestexts — kein Rechtsrat.

export type Art30Clause = {
	code: string; // z. B. "30(2)(a)"
	title: string;
	text: string;
	criticalOnly: boolean;
};

export const ART30_CLAUSES: readonly Art30Clause[] = [
	{
		code: "30(2)(a)",
		title: "Leistungsbeschreibung",
		text: "Klare und vollständige Beschreibung aller Funktionen und IKT-Dienstleistungen; Angabe, ob Unterauftragsvergabe für kritische oder wichtige Funktionen zulässig ist und unter welchen Bedingungen.",
		criticalOnly: false,
	},
	{
		code: "30(2)(b)",
		title: "Standorte",
		text: "Standorte (Regionen oder Länder) der Leistungserbringung und der Datenverarbeitung inkl. Speicherort; Pflicht zur vorherigen Mitteilung bei Änderung.",
		criticalOnly: false,
	},
	{
		code: "30(2)(c)",
		title: "Schutz der Daten",
		text: "Verfügbarkeit, Authentizität, Integrität und Vertraulichkeit der Daten, einschließlich personenbezogener Daten.",
		criticalOnly: false,
	},
	{
		code: "30(2)(d)",
		title: "Datenzugang bei Beendigung",
		text: "Zugang, Wiederherstellung und Rückgabe der Daten in leicht zugänglichem Format bei Insolvenz, Abwicklung, Geschäftseinstellung oder Vertragsende.",
		criticalOnly: false,
	},
	{
		code: "30(2)(e)",
		title: "Leistungsziele",
		text: "Leistungsbeschreibungen mit quantitativen und qualitativen Zielen (SLA), die eine wirksame Überwachung und Gegenmaßnahmen erlauben.",
		criticalOnly: false,
	},
	{
		code: "30(2)(f)",
		title: "Unterstützung bei Vorfällen",
		text: "Unterstützung bei IKT-Vorfällen im Zusammenhang mit der Dienstleistung ohne Zusatzkosten oder zu vorab festgelegten Kosten.",
		criticalOnly: false,
	},
	{
		code: "30(2)(g)",
		title: "Zusammenarbeit mit Behörden",
		text: "Uneingeschränkte Zusammenarbeit mit den zuständigen Behörden und Abwicklungsbehörden des Finanzunternehmens.",
		criticalOnly: false,
	},
	{
		code: "30(2)(h)",
		title: "Kündigung",
		text: "Kündigungsrechte und Mindestkündigungsfristen entsprechend den Erwartungen der Aufsicht.",
		criticalOnly: false,
	},
	{
		code: "30(2)(i)",
		title: "Schulung",
		text: "Teilnahme an Schulungs- und Sensibilisierungsprogrammen des Finanzunternehmens zur digitalen operationalen Resilienz (Art. 13 Abs. 6).",
		criticalOnly: false,
	},
	{
		code: "30(3)(a)",
		title: "Vollständige SLA",
		text: "Vollständige Leistungsbeschreibung mit präzisen quantitativen und qualitativen Zielen, Aktualisierungsmechanismen und Überwachungsmöglichkeit.",
		criticalOnly: true,
	},
	{
		code: "30(3)(b)",
		title: "Kündigungsfristen und Berichtspflichten",
		text: "Kündigungsfristen und Berichtspflichten des Dienstleisters, insbesondere Mitteilung über Entwicklungen, die seine Leistungsfähigkeit wesentlich beeinträchtigen könnten.",
		criticalOnly: true,
	},
	{
		code: "30(3)(c)",
		title: "Notfallpläne und Sicherheit",
		text: "Umsetzung und Test von Notfallplänen; IKT-Sicherheitsmaßnahmen, Werkzeuge und Richtlinien, die ein angemessenes Schutzniveau sicherstellen.",
		criticalOnly: true,
	},
	{
		code: "30(3)(d)",
		title: "Mitwirkung an TLPT",
		text: "Teilnahme und uneingeschränkte Zusammenarbeit bei bedrohungsorientierten Penetrationstests (TLPT) des Finanzunternehmens.",
		criticalOnly: true,
	},
	{
		code: "30(3)(e)",
		title: "Zugangs-, Inspektions- und Auditrechte",
		text: "Uneingeschränkte Zugangs-, Inspektions- und Auditrechte für das Finanzunternehmen, seine Prüfer und die Behörden; Mitwirkungspflichten; Festlegung von Häufigkeit und Umfang.",
		criticalOnly: true,
	},
	{
		code: "30(3)(f)",
		title: "Ausstiegsstrategie",
		text: "Ausstiegsstrategien mit angemessener Übergangsfrist, in der die Leistung weiter erbracht wird, und Unterstützung bei Migration zu einem anderen Anbieter oder bei Rückführung.",
		criticalOnly: true,
	},
];

export const ART30_BY_CODE = new Map(ART30_CLAUSES.map((c) => [c.code, c]));
