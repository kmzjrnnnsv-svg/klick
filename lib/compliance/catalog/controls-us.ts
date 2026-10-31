import type { CatalogControl } from "./types";

// Common Controls für US-Rahmenwerke (NIST SP 800-53/800-171, CMMC, CCPA,
// Datenschutzgesetze der Bundesstaaten): nur, was die bestehenden Controls
// nicht schon tragen. Systemsicherheitsplan und Aktionsplan verlangen NIST
// und CMMC ausdrücklich; der Widerspruch gegen Verkauf und Weitergabe ist
// eine US-Eigenheit ohne Gegenstück in der DSGVO. Inhalte nach
// Modellwissen, gegen die Quellen prüfen.

let order = 8500;
const next = () => {
	order += 10;
	return order;
};

export const PART_I: CatalogControl[] = [
	{
		code: "CC-SSP-01",
		title: "Systemsicherheitsplan je System (SSP)",
		description:
			"Für jedes System im Geltungsbereich beschreibt ein Systemsicherheitsplan Grenzen, Umgebung, Datenflüsse, Verbindungen zu anderen Systemen und wie jede geforderte Anforderung umgesetzt ist, mit Verantwortlichen. Der Plan wird bei wesentlichen Änderungen und mindestens jährlich aktualisiert.",
		implementationGuidance:
			"Den Plan als Dokument je System führen (Vorlage aus der Strukturanalyse und dem Asset-Inventar), die Umsetzung je Anforderung aus dem Nachweisbogen übernehmen und die Freigabe durch die Leitung über den Dokument-Umlauf einholen.",
		domain: "governance",
		effort: "M",
		kind: "documentation",
		evidenceHints: [
			"Systemsicherheitsplan je System mit Freigabe",
			"Systemgrenzen und Datenflussdiagramm",
		],
		auditQuestions: [
			"Welche Systeme verarbeiten die geschützten Daten, und wo endet jedes System?",
			"Wie zeigt der Plan, wie jede Anforderung umgesetzt ist?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-SSP-02",
		title: "Aktionsplan für offene Punkte (POA&M)",
		description:
			"Nicht oder nur teilweise umgesetzte Anforderungen und bekannte Schwachstellen stehen in einem Aktionsplan mit Maßnahme, Verantwortlichen, Meilensteinen und Termin. Der Plan wird regelmäßig fortgeschrieben, erledigte Punkte werden mit Nachweis geschlossen.",
		implementationGuidance:
			"Offene Punkte aus Gap-Analyse, Befunden und Audits als Aufgaben mit Frist führen; der Aktionsplan ist der Export dieser Aufgaben je System, ergänzt um die Begründung bei Verzug.",
		domain: "governance",
		effort: "S",
		kind: "process",
		evidenceHints: [
			"Aktionsplan mit Terminen",
			"Nachweise zu geschlossenen Punkten",
		],
		auditQuestions: [
			"Welche Anforderungen sind offen, und bis wann sind sie umgesetzt?",
			"Wer prüft, dass Termine gehalten werden?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-PRV-07",
		title: "Widerspruch gegen Verkauf, Weitergabe und gezielte Werbung",
		description:
			"Betroffene können dem Verkauf und der Weitergabe ihrer Daten, der gezielten Werbung und dem Profiling widersprechen: über einen gut sichtbaren Link und über automatische Signale des Browsers (Global Privacy Control). Der Widerspruch wirkt bei allen Empfänger:innen und wird dokumentiert; sensible Daten nutzt die Firma nur mit Einwilligung bzw. eingeschränkt.",
		implementationGuidance:
			"Alle Weitergaben an Dritte im Verarbeitungsverzeichnis als Verkauf, Weitergabe oder Werbung kennzeichnen; Widerspruchslink und GPC-Erkennung auf der Website umsetzen und die Weitergabe an Werbedienste daran koppeln; Anträge wie Betroffenenanfragen mit Frist führen.",
		domain: "compliance",
		effort: "M",
		kind: "technical",
		evidenceHints: [
			"Widerspruchslink und Datenschutzhinweis",
			"Test der GPC-Erkennung",
			"Liste der Weitergaben mit Kennzeichnung",
		],
		auditQuestions: [
			"Woran erkennt eure Website ein Widerspruchssignal des Browsers?",
			"Wie erfahren Empfänger:innen der Daten von einem Widerspruch?",
		],
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
];
