import { buildIndex, type Spec } from "./spec";
import type { CatalogSection } from "./types";

// EU-US Data Privacy Framework (DPF): US-Firmen zertifizieren sich selbst
// beim US-Handelsministerium und dürfen dann Personendaten aus der EU ohne
// weitere Garantien empfangen (Angemessenheitsbeschluss der Kommission vom
// 10.07.2023). Für Firmen in der EU ist es ein Prüfpunkt bei US-Dienstleistern.
// Grundsätze und Zusatzgrundsätze in eigener Formulierung, gegen
// dataprivacyframework.gov prüfen.

export const DPF_SECTIONS: CatalogSection[] = [
	{ code: "P", title: "Grundsätze", sortOrder: 10 },
	{ code: "S", title: "Zusatzgrundsätze", sortOrder: 20 },
	{ code: "C", title: "Zertifizierung", sortOrder: 30 },
];

const S: Spec[] = [
	{
		code: "P1",
		section: "P",
		title: "Information (Notice)",
		text: "Betroffene erfahren, dass die Firma am DPF teilnimmt, welche Daten sie wofür nutzt, an wen sie weitergibt und an wen sie sich wenden können.",
		domain: "compliance",
		controls: ["CC-PRV-01", "CC-PRV-02"],
		partial: true,
	},
	{
		code: "P2",
		section: "P",
		title: "Wahlfreiheit (Choice)",
		text: "Betroffene können widersprechen, wenn Daten weitergegeben oder für neue Zwecke genutzt werden; bei sensiblen Daten ist eine Einwilligung nötig.",
		domain: "compliance",
		controls: ["CC-PRV-01", "CC-PRV-02"],
		partial: true,
	},
	{
		code: "P3",
		section: "P",
		title: "Weitergabe an Dritte",
		text: "Daten gehen nur mit Vertrag an Dritte, der denselben Schutz verlangt; die Firma bleibt verantwortlich.",
		domain: "supplier",
		controls: ["CC-PRV-04", "CC-TPR-04"],
	},
	{
		code: "P4",
		section: "P",
		title: "Sicherheit",
		text: "Angemessene Maßnahmen schützen die Daten vor Verlust, Missbrauch und unbefugtem Zugriff.",
		domain: "governance",
		controls: ["CC-GOV-01", "CC-CRY-01", "CC-IAM-01"],
		partial: true,
	},
	{
		code: "P5",
		section: "P",
		title: "Datenqualität und Zweckbindung",
		text: "Daten sind richtig, aktuell und werden nur für vereinbarte Zwecke und nur so lange wie nötig genutzt.",
		domain: "asset",
		controls: ["CC-AST-10", "CC-PRV-01"],
		partial: true,
	},
	{
		code: "P6",
		section: "P",
		title: "Auskunft",
		text: "Betroffene erhalten Auskunft und können falsche Daten berichtigen oder löschen lassen.",
		domain: "compliance",
		controls: ["CC-PRV-02"],
	},
	{
		code: "P7",
		section: "P",
		title: "Rechtsschutz und Haftung",
		text: "Es gibt einen unabhängigen, kostenlosen Weg für Beschwerden, und die Firma haftet für Verstöße.",
		domain: "conduct",
		controls: ["CC-CND-03"],
		partial: true,
		note: "Unabhängige Streitbeilegung (z. B. Schiedsstelle) ist zusätzlich zu benennen.",
	},
	{
		code: "S1",
		section: "S",
		title: "Sensible Daten",
		text: "Für sensible Daten gelten strengere Regeln, meist mit ausdrücklicher Einwilligung.",
		domain: "compliance",
		controls: ["CC-PRV-03", "CC-AST-02"],
		partial: true,
	},
	{
		code: "S2",
		section: "S",
		title: "Beschäftigtendaten",
		text: "Für Daten von Beschäftigten aus der EU gelten eigene Regeln und die Zusammenarbeit mit den EU-Datenschutzbehörden.",
		domain: "hr",
		controls: ["CC-PRV-01"],
		partial: true,
	},
	{
		code: "S3",
		section: "S",
		title: "Überprüfung",
		text: "Die Firma prüft jährlich selbst oder lässt prüfen, ob sie die Grundsätze einhält.",
		domain: "compliance",
		controls: ["CC-GOV-13", "CC-GOV-06"],
	},
	{
		code: "S4",
		section: "S",
		title: "Streitbeilegung",
		text: "Beschwerden werden binnen 45 Tagen beantwortet; danach steht eine unabhängige Stelle und am Ende ein Schiedsverfahren offen.",
		domain: "conduct",
		controls: ["CC-CND-03", "CC-PRV-02"],
		partial: true,
	},
	{
		code: "S5",
		section: "S",
		title: "Behördliche Anfragen",
		text: "Anfragen von US-Behörden nach Daten werden nach den Regeln des DPF behandelt und dokumentiert.",
		domain: "compliance",
		controls: ["CC-GOV-09", "CC-GOV-10"],
		partial: true,
	},
	{
		code: "C1",
		section: "C",
		title: "Selbstzertifizierung",
		text: "Die Firma zertifiziert sich beim US-Handelsministerium, veröffentlicht ihre Datenschutzerklärung und erneuert die Zertifizierung jährlich.",
		domain: "compliance",
		controls: ["CC-CMP-02"],
	},
	{
		code: "C2",
		section: "C",
		title: "US-Dienstleister prüfen",
		text: "Wer Daten an US-Firmen übermittelt, prüft vorher, ob die Firma auf der DPF-Liste steht und ob die Zertifizierung die Datenart abdeckt.",
		domain: "supplier",
		controls: ["CC-PRV-04", "CC-TPR-03"],
	},
];

const built = buildIndex("eu-us-dpf", S);
export const DPF_REQUIREMENTS = built.requirements;
export const DPF_EDGES = built.edges;
