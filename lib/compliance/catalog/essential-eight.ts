import { buildIndex, type Spec } from "./spec";
import type { CatalogSection, FrameworkVariant } from "./types";

// ACSC Essential Eight (Australien): acht Maßnahmen gegen die häufigsten
// Angriffe, in drei Reifegraden. Für Behörden in Australien Pflicht, sonst
// oft von Kundschaft verlangt. Eigene Formulierung nach dem Essential Eight
// Maturity Model, gegen cyber.gov.au prüfen. Reifegrade als Varianten; eine
// Anforderung gilt ab dem Reifegrad, in dem sie dazukommt.

export const E8_VARIANTS: FrameworkVariant[] = [
	{
		key: "ml1",
		label: "Reifegrad 1",
		hint: "Gegen Angriffe mit allgemein verfügbaren Werkzeugen",
	},
	{
		key: "ml2",
		label: "Reifegrad 2",
		hint: "Gegen gezieltere Angriffe mit etwas mehr Aufwand",
	},
	{
		key: "ml3",
		label: "Reifegrad 3",
		hint: "Gegen geschickte Angreifer, die gezielt suchen",
	},
];

const FROM2 = ["ml2", "ml3"];
const FROM3 = ["ml3"];

export const E8_SECTIONS: CatalogSection[] = [
	{ code: "AC", title: "Erlaubte Programme", sortOrder: 10 },
	{ code: "PA", title: "Programme aktualisieren", sortOrder: 20 },
	{ code: "MA", title: "Office-Makros", sortOrder: 30 },
	{ code: "UH", title: "Programme härten", sortOrder: 40 },
	{ code: "RA", title: "Verwaltungsrechte begrenzen", sortOrder: 50 },
	{ code: "PO", title: "Betriebssysteme aktualisieren", sortOrder: 60 },
	{ code: "MF", title: "Zweiter Faktor", sortOrder: 70 },
	{ code: "RB", title: "Datensicherung", sortOrder: 80 },
];

const S: Spec[] = [
	{
		code: "AC.1",
		section: "AC",
		title: "Nur erlaubte Programme an Arbeitsplätzen",
		text: "Auf Arbeitsplätzen laufen nur freigegebene Programme, Skripte und Installer.",
		domain: "operations",
		controls: ["CC-OPS-06"],
	},
	{
		code: "AC.2",
		section: "AC",
		title: "Auch auf Servern",
		text: "Auch auf Servern mit Internetzugang laufen nur freigegebene Programme; Verstöße werden protokolliert.",
		domain: "operations",
		controls: ["CC-OPS-06", "CC-LOG-02"],
		variants: FROM2,
	},
	{
		code: "AC.3",
		section: "AC",
		title: "Treiber und Regeln prüfen",
		text: "Auch Treiber sind beschränkt, die Regeln werden mindestens jährlich geprüft.",
		domain: "operations",
		controls: ["CC-OPS-06", "CC-OPS-04"],
		variants: FROM3,
	},
	{
		code: "PA.1",
		section: "PA",
		title: "Schwachstellen finden",
		text: "Programme werden regelmäßig auf fehlende Updates und Schwachstellen geprüft, Programme mit Internetzugang täglich.",
		domain: "operations",
		controls: ["CC-OPS-03"],
	},
	{
		code: "PA.2",
		section: "PA",
		title: "Updates schnell einspielen",
		text: "Updates für Programme mit Internetzugang kommen binnen zwei Wochen, bei aktiven Angriffen binnen 48 Stunden.",
		domain: "operations",
		controls: ["CC-OPS-03"],
	},
	{
		code: "PA.3",
		section: "PA",
		title: "Alte Programme entfernen",
		text: "Programme ohne Herstellerunterstützung werden entfernt.",
		domain: "operations",
		controls: ["CC-OPS-03", "CC-AST-06"],
	},
	{
		code: "MA.1",
		section: "MA",
		title: "Makros aus dem Internet sperren",
		text: "Office-Makros sind für Nutzende ohne Bedarf abgeschaltet; Makros aus dem Internet sind gesperrt.",
		domain: "operations",
		controls: ["CC-OPS-04", "CC-OPS-01"],
	},
	{
		code: "MA.2",
		section: "MA",
		title: "Nur geprüfte Makros",
		text: "Erlaubte Makros laufen nur in geschützter Umgebung oder signiert von vertrauenswürdigen Stellen; Ausführung wird protokolliert.",
		domain: "operations",
		controls: ["CC-OPS-04", "CC-OPS-10"],
		variants: FROM2,
	},
	{
		code: "UH.1",
		section: "UH",
		title: "Browser härten",
		text: "Browser blockieren Java und Werbung aus dem Internet; Nutzende können das nicht ändern.",
		domain: "operations",
		controls: ["CC-OPS-04", "CC-NET-03"],
	},
	{
		code: "UH.2",
		section: "UH",
		title: "Office und PDF härten",
		text: "Office- und PDF-Programme dürfen keine Kindprozesse starten und keine Inhalte einbetten; PowerShell ist eingeschränkt.",
		domain: "operations",
		controls: ["CC-OPS-04", "CC-OPS-10"],
		variants: FROM2,
	},
	{
		code: "UH.3",
		section: "UH",
		title: "Alte Komponenten entfernen",
		text: "Veraltete Komponenten wie alte .NET-Fassungen oder Internet Explorer sind entfernt oder abgeschaltet.",
		domain: "operations",
		controls: ["CC-OPS-04", "CC-AST-06"],
		variants: FROM3,
	},
	{
		code: "RA.1",
		section: "RA",
		title: "Verwaltungsrechte nur nach Bedarf",
		text: "Verwaltungsrechte werden nur nach Prüfung vergeben und regelmäßig überprüft; Admin-Konten haben keinen Zugang zu Mail und Internet.",
		domain: "access",
		controls: ["CC-IAM-04", "CC-IAM-05"],
	},
	{
		code: "RA.2",
		section: "RA",
		title: "Rechte befristen",
		text: "Verwaltungsrechte laufen nach 12 Monaten ab, wenn sie nicht neu begründet werden; Nutzung wird protokolliert.",
		domain: "access",
		controls: ["CC-IAM-04", "CC-LOG-01"],
		variants: FROM2,
	},
	{
		code: "RA.3",
		section: "RA",
		title: "Rechte nur für die Zeit der Aufgabe",
		text: "Verwaltungsrechte gibt es nur für die Zeit der Aufgabe (just in time), aus eigenen, gehärteten Arbeitsplätzen.",
		domain: "access",
		controls: ["CC-IAM-04", "CC-OPS-07"],
		variants: FROM3,
	},
	{
		code: "PO.1",
		section: "PO",
		title: "Betriebssysteme aktualisieren",
		text: "Updates für Betriebssysteme kommen binnen zwei Wochen, bei aktiven Angriffen binnen 48 Stunden.",
		domain: "operations",
		controls: ["CC-OPS-03"],
	},
	{
		code: "PO.2",
		section: "PO",
		title: "Nur unterstützte Betriebssysteme",
		text: "Es laufen nur Betriebssysteme, die noch Updates bekommen.",
		domain: "operations",
		controls: ["CC-OPS-03", "CC-AST-06"],
	},
	{
		code: "PO.3",
		section: "PO",
		title: "Neueste Fassung",
		text: "Es läuft die neueste oder vorletzte Fassung des Betriebssystems.",
		domain: "operations",
		controls: ["CC-OPS-03"],
		variants: FROM3,
	},
	{
		code: "MF.1",
		section: "MF",
		title: "Zweiter Faktor für Internetdienste",
		text: "Für Dienste aus dem Internet mit wichtigen Daten ist ein zweiter Faktor Pflicht.",
		domain: "access",
		controls: ["CC-IAM-03"],
	},
	{
		code: "MF.2",
		section: "MF",
		title: "Zweiter Faktor für Admins",
		text: "Auch Verwaltungszugänge und wichtige interne Dienste verlangen einen zweiten Faktor; Anmeldungen werden protokolliert.",
		domain: "access",
		controls: ["CC-IAM-03", "CC-IAM-04"],
		variants: FROM2,
	},
	{
		code: "MF.3",
		section: "MF",
		title: "Fälschungssicherer Faktor",
		text: "Der zweite Faktor ist gegen Phishing geschützt, etwa ein Sicherheitsschlüssel oder Passkey.",
		domain: "access",
		controls: ["CC-IAM-03"],
		variants: FROM3,
	},
	{
		code: "RB.1",
		section: "RB",
		title: "Regelmäßige Sicherung",
		text: "Wichtige Daten, Programme und Einstellungen werden regelmäßig gesichert und die Wiederherstellung geübt.",
		domain: "continuity",
		controls: ["CC-BCM-03"],
	},
	{
		code: "RB.2",
		section: "RB",
		title: "Sicherungen schützen",
		text: "Normale Konten können Sicherungen weder lesen noch ändern oder löschen.",
		domain: "continuity",
		controls: ["CC-BCM-03", "CC-IAM-01"],
	},
	{
		code: "RB.3",
		section: "RB",
		title: "Auch Admins nicht",
		text: "Auch Verwaltungskonten außer denen für die Sicherung können Sicherungen nicht ändern oder löschen.",
		domain: "continuity",
		controls: ["CC-BCM-03", "CC-IAM-04"],
		variants: FROM3,
	},
];

const built = buildIndex("essential-eight", S);
export const E8_REQUIREMENTS = built.requirements;
export const E8_EDGES = built.edges;
