import type { RoleFunction } from "@/db/schema/enums";

// Bestellungsschreiben je Funktion (N3): Aufgaben, Befugnisse, Ressourcen und
// Berichtsweg als Textbausteine für NW-BESTELLUNG. Ergänzungen je Org stehen
// in role_assignments.appointmentNotes. `reportsDirectly` = die Funktion muss
// unmittelbar an die Geschäftsleitung berichten (Unabhängigkeit) — das
// Organigramm warnt, wenn sie anders eingehängt ist.
// Inhalte nach Modellwissen (Anforderungskatalog 2026-10) — vor der ersten
// Bestellung fachlich prüfen. Kein Rechtsrat.

export type AppointmentTemplate = {
	function: RoleFunction;
	tasks: readonly string[];
	powers: readonly string[];
	resources: string;
	reportsDirectly: boolean;
	// Grundlage der Berichtspflicht bzw. Unabhängigkeit
	independenceBasis?: string;
};

const RESOURCES =
	"Die Geschäftsleitung stellt Zeit, Budget, Zugang zu Informationen und Weiterbildung bereit, die für die Aufgaben erforderlich sind.";

export const APPOINTMENT_TEMPLATES: readonly AppointmentTemplate[] = [
	{
		function: "isb_ciso",
		tasks: [
			"Informationssicherheits-Managementsystem steuern und weiterentwickeln",
			"Leitlinie und Richtlinien zur Informationssicherheit entwerfen und aktuell halten",
			"Risikobeurteilung und Behandlungsplan koordinieren",
			"Sicherheitsvorfälle bewerten und bei der Bewältigung beraten",
			"Schulung und Sensibilisierung planen",
			"mindestens jährlich und anlassbezogen an die Geschäftsleitung berichten",
		],
		powers: [
			"Auskunft und Einsicht in alle Unterlagen und Systeme, soweit für die Aufgabe nötig",
			"Vorschlagsrecht für Sicherheitsmaßnahmen und Eskalation an die Geschäftsleitung",
			"Beteiligung an Projekten und Änderungen mit Sicherheitsbezug",
		],
		resources: RESOURCES,
		reportsDirectly: true,
		independenceBasis: "ISO 27001 5.3 · ZAG-MaRisk AT 7.2",
	},
	{
		function: "ict_risk_function",
		tasks: [
			"IKT-Risiken unabhängig von Entwicklung und Betrieb überwachen",
			"den IKT-Risikomanagementrahmen jährlich überprüfen",
			"Ergebnisse von Tests und Vorfällen in die Risikobewertung einbeziehen",
			"an das Leitungsorgan berichten",
		],
		powers: [
			"uneingeschränkter Zugang zu Informationen über IKT-Systeme und -Risiken",
			"Eskalation an das Leitungsorgan",
		],
		resources: RESOURCES,
		reportsDirectly: true,
		independenceBasis: "DORA Art. 6(4)",
	},
	{
		function: "compliance",
		tasks: [
			"wesentliche rechtliche Regelungen und Vorgaben identifizieren",
			"auf wirksame Verfahren zu deren Einhaltung hinwirken",
			"Compliance-Risiken bewerten und überwachen",
			"mindestens jährlich und anlassbezogen an die Geschäftsleitung berichten",
		],
		powers: [
			"Zugang zu allen Informationen, die für die Aufgabe nötig sind",
			"Weisungsunabhängigkeit gegenüber den Geschäftsbereichen",
			"unmittelbare Eskalation an die Geschäftsleitung",
		],
		resources: RESOURCES,
		reportsDirectly: true,
		independenceBasis: "ZAG-MaRisk AT 4.4.2 · MiCAR Art. 68(3)",
	},
	{
		function: "compliance_manager",
		tasks: [
			"Verantwortung in der Geschäftsleitung für die Einhaltung der geldwäscherechtlichen Pflichten",
			"Risikoanalyse und Sicherungsmaßnahmen genehmigen",
			"Berichte der oder des Geldwäschebeauftragten entgegennehmen und umsetzen",
		],
		powers: ["Entscheidungsbefugnis als Mitglied der Geschäftsleitung"],
		resources: RESOURCES,
		reportsDirectly: true,
		independenceBasis: "§ 4 Abs. 3 GwG · AMLR Art. 9",
	},
	{
		function: "internal_audit",
		tasks: [
			"Wirksamkeit und Angemessenheit des internen Kontrollsystems prüfen",
			"risikoorientierten Prüfungsplan aufstellen und durchführen",
			"Feststellungen berichten und die Beseitigung von Mängeln überwachen",
		],
		powers: [
			"vollständiges und uneingeschränktes Informationsrecht",
			"keine operativen Aufgaben, keine Weisungen zu Prüfungsinhalten",
			"unmittelbare Berichterstattung an die Geschäftsleitung",
		],
		resources: RESOURCES,
		reportsDirectly: true,
		independenceBasis: "ZAG-MaRisk AT 4.4.3 · ISO 27001 9.2",
	},
	{
		function: "risk_control",
		tasks: [
			"Risikotragfähigkeit und Risikostrategie mitgestalten",
			"Risiken laufend überwachen und kommunizieren",
			"regelmäßig an die Geschäftsleitung berichten",
		],
		powers: [
			"Zugang zu allen risikorelevanten Informationen",
			"Beteiligung an wesentlichen risikopolitischen Entscheidungen",
		],
		resources: RESOURCES,
		reportsDirectly: true,
		independenceBasis: "ZAG-MaRisk AT 4.4.1",
	},
	{
		function: "aml_officer",
		tasks: [
			"interne Sicherungsmaßnahmen gegen Geldwäsche und Terrorismusfinanzierung entwickeln und überwachen",
			"Risikoanalyse aktuell halten",
			"Verdachtsfälle prüfen und Meldungen an die FIU abgeben",
			"Ansprechperson für Aufsicht und Strafverfolgung",
			"mindestens jährlich an die Geschäftsleitung berichten",
		],
		powers: [
			"ungehinderter Zugang zu allen Informationen, Daten und Systemen, die für die Aufgabe nötig sind",
			"Entscheidung über Verdachtsmeldungen ohne Weisung",
			"Benachteiligungsverbot wegen der Erfüllung der Aufgaben",
		],
		resources: RESOURCES,
		reportsDirectly: true,
		independenceBasis: "§ 7 Abs. 5 GwG · AMLR Art. 11",
	},
	{
		function: "dpo",
		tasks: [
			"zur Einhaltung des Datenschutzrechts beraten und überwachen",
			"bei Datenschutz-Folgenabschätzungen beraten",
			"Anlaufstelle für Aufsichtsbehörde und betroffene Personen",
			"Schulung und Sensibilisierung unterstützen",
		],
		powers: [
			"keine Weisungen bei der Erfüllung der Aufgaben",
			"frühzeitige Einbindung in alle Datenschutzfragen",
			"Abberufungs- und Benachteiligungsschutz",
		],
		resources: RESOURCES,
		reportsDirectly: true,
		independenceBasis: "DSGVO Art. 38 Abs. 3",
	},
	{
		function: "outsourcing_officer",
		tasks: [
			"Auslagerungen und IKT-Drittdienstleister steuern und überwachen",
			"Informationsregister führen",
			"Risikoanalysen vor Auslagerungen koordinieren",
			"Ausstiegs- und Notfallpläne aktuell halten",
		],
		powers: [
			"Einsicht in Verträge und Leistungsberichte der Dienstleister",
			"Eskalation bei Leistungsmängeln an die Geschäftsleitung",
		],
		resources: RESOURCES,
		reportsDirectly: false,
	},
	{
		function: "incident_manager",
		tasks: [
			"Vorfälle erfassen, klassifizieren und die Bewältigung koordinieren",
			"Meldefristen gegenüber Aufsicht und Behörden einhalten",
			"Ursachen auswerten und Maßnahmen nachverfolgen",
		],
		powers: [
			"Sofortmaßnahmen im Rahmen des Vorfallprozesses anordnen",
			"Eskalation an Geschäftsleitung und Krisenstab",
		],
		resources: RESOURCES,
		reportsDirectly: false,
	},
	{
		function: "bcm_manager",
		tasks: [
			"Business-Impact-Analyse koordinieren",
			"Notfall- und Wiederanlaufpläne pflegen",
			"Übungen und Tests planen und auswerten",
		],
		powers: [
			"Mitwirkungspflicht der Fachbereiche bei BIA und Übungen einfordern",
		],
		resources: RESOURCES,
		reportsDirectly: false,
	},
	{
		function: "crisis_team",
		tasks: [
			"im Krisenfall Lage bewerten und Entscheidungen treffen",
			"interne und externe Kommunikation steuern",
			"Wiederanlauf überwachen und Krise förmlich beenden",
		],
		powers: ["Entscheidungsbefugnis im Krisenfall nach dem Notfallhandbuch"],
		resources: RESOURCES,
		reportsDirectly: false,
	},
	{
		function: "nis2_responsible",
		tasks: [
			"Registrierung beim BSI vornehmen und aktuell halten",
			"Kontaktstelle für das BSI sein",
			"Umsetzung der Risikomanagementmaßnahmen nach NIS2 koordinieren",
		],
		powers: ["Auskunft gegenüber dem BSI im Namen der Organisation"],
		resources: RESOURCES,
		reportsDirectly: false,
	},
	{
		function: "department_head",
		tasks: [
			"Bereich fachlich und organisatorisch führen",
			"Risiken und Maßnahmen des Bereichs verantworten",
			"Freigaben im Rahmen der Freigabestufen erteilen",
		],
		powers: ["Freigaben bis zur festgelegten Risikoklasse"],
		resources: RESOURCES,
		reportsDirectly: false,
	},
	{
		function: "other",
		tasks: ["Aufgaben laut Ergänzungen unten"],
		powers: ["Befugnisse laut Ergänzungen unten"],
		resources: RESOURCES,
		reportsDirectly: false,
	},
];

export const APPOINTMENT_TEMPLATE_BY_FUNCTION = new Map(
	APPOINTMENT_TEMPLATES.map((t) => [t.function, t]),
);

// Die Geschäftsleitung wird nicht per Bestellungsschreiben bestellt
// (Gesellschafterbeschluss bzw. Satzung) — alle anderen Funktionen schon.
export const appointable = (fn: RoleFunction) => fn !== "management_body";
