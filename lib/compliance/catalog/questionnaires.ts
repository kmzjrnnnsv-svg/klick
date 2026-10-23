import type { AssessmentQuestion } from "@/db/schema/enums";
import { ART30_CLAUSES } from "./art30-clauses";

// Fragebögen für die Lieferantenbewertung (S6). Sie laufen über denselben
// Motor wie die Gap-Analyse (assessments, kind supplier) und werden vom
// Lieferanten im Portal ohne Konto beantwortet. K.-o.-Fragen (critical)
// begrenzen das Rating auf höchstens C. Eigene Formulierungen, angelehnt an
// NIS2 Art. 21 Abs. 2 lit. d/e, CRA Anhang I und DORA Art. 28–30 — kein
// Rechtsrat.

export type SupplierTemplate = {
	code: "nis2-sw" | "cra-sw" | "dora-ikt";
	version: string;
	title: string;
	frameworks: string[];
	description: string;
	questions: AssessmentQuestion[];
};

const q = (
	code: string,
	section: [string, string],
	text: string,
	opts: Partial<AssessmentQuestion> = {},
): AssessmentQuestion => ({
	code,
	sectionCode: section[0],
	sectionTitle: section[1],
	text,
	weight: 1,
	evidenceRequired: true,
	...opts,
});

const ORG: [string, string] = ["org", "Organisation und Nachweise"];
const DEV: [string, string] = ["dev", "Entwicklung und Schwachstellen"];
const OPS: [string, string] = ["ops", "Betrieb und Zugang"];
const INC: [string, string] = ["inc", "Vorfälle und Kontinuität"];
const SUP: [string, string] = ["sup", "Lieferkette und Daten"];

const NIS2_SW: AssessmentQuestion[] = [
	q(
		"SW-01",
		ORG,
		"Gibt es ein zertifiziertes oder testiertes ISMS (ISO 27001, BSI C5, SOC 2 Typ II)?",
		{
			help: "Zertifikat oder Testat mit Geltungsbereich und Gültigkeit; der Geltungsbereich muss die gelieferte Leistung umfassen.",
			evidenceHints: ["Zertifikat/Testat", "Geltungsbereich (Scope)"],
			weight: 2,
			mapsTo: { requirement: "nis2:Art.21(2)(d)" },
		},
	),
	q(
		"SW-02",
		ORG,
		"Ist eine verantwortliche Person für Informationssicherheit benannt und für uns erreichbar?",
		{
			evidenceRequired: false,
			evidenceHints: ["Kontakt (Name, Funktion, E-Mail)"],
		},
	),
	q(
		"SW-03",
		DEV,
		"Folgt die Entwicklung einem sicheren Entwicklungsprozess (Code-Review, statische Analyse, Abhängigkeits-Scan vor jedem Release)?",
		{
			help: "Beschreibung oder Auszug des SDLC; Beispiel eines CI-Laufs mit Sicherheits-Checks.",
			evidenceHints: ["SDLC-Beschreibung", "CI-Konfiguration"],
			weight: 2,
			mapsTo: { requirement: "nis2:Art.21(2)(e)" },
		},
	),
	q(
		"SW-04",
		DEV,
		"Werden kritische Schwachstellen in einer zugesagten Frist behoben (z. B. kritisch ≤ 7 Tage, hoch ≤ 30 Tage)?",
		{
			critical: true,
			evidenceHints: ["Patch-Richtlinie mit Fristen"],
			mapsTo: { requirement: "nis2:Art.21(2)(e)" },
		},
	),
	q(
		"SW-05",
		DEV,
		"Gibt es eine Richtlinie zur koordinierten Offenlegung und einen Meldeweg für Schwachstellen (security.txt)?",
		{
			evidenceRequired: false,
			evidenceHints: ["Link zur CVD-Richtlinie", "security.txt"],
		},
	),
	q(
		"SW-06",
		DEV,
		"Steht zu jeder ausgelieferten Version eine SBOM bereit (CycloneDX oder SPDX)?",
		{
			evidenceHints: ["Beispiel-SBOM"],
		},
	),
	q(
		"SW-07",
		DEV,
		"Wird die Anwendung mindestens jährlich von unabhängiger Stelle getestet (Penetrationstest)?",
		{
			evidenceHints: ["Management Summary des letzten Pentests"],
			weight: 2,
		},
	),
	q(
		"SW-08",
		OPS,
		"Ist für alle administrativen und Fernzugänge eine Mehr-Faktor-Authentisierung Pflicht?",
		{
			critical: true,
			evidenceRequired: false,
			mapsTo: { requirement: "nis2:Art.21(2)(j)" },
		},
	),
	q(
		"SW-09",
		OPS,
		"Werden Daten bei der Übertragung (TLS 1.2+) und im Ruhezustand verschlüsselt?",
		{
			evidenceRequired: false,
			mapsTo: { requirement: "nis2:Art.21(2)(h)" },
		},
	),
	q(
		"SW-10",
		OPS,
		"Werden sicherheitsrelevante Ereignisse protokolliert, überwacht und mindestens 6 Monate aufbewahrt?",
		{
			evidenceRequired: false,
		},
	),
	q(
		"SW-11",
		OPS,
		"Werden Zugriffsrechte des eigenen Personals regelmäßig (mind. jährlich) überprüft?",
		{
			evidenceRequired: false,
		},
	),
	q(
		"SW-12",
		INC,
		"Werdet ihr uns über Sicherheitsvorfälle, die unsere Daten oder Dienste betreffen, binnen 24 Stunden informieren?",
		{
			critical: true,
			help: "Wir brauchen das für unsere eigenen Meldepflichten (NIS2 Art. 23: Frühwarnung binnen 24 Stunden).",
			evidenceHints: ["Vertragsklausel oder Incident-Richtlinie"],
			mapsTo: { requirement: "nis2:Art.23" },
		},
	),
	q(
		"SW-13",
		INC,
		"Gibt es Backup und Notfallpläne, die mindestens jährlich getestet werden (mit Wiederanlaufzeiten)?",
		{
			evidenceHints: ["Testprotokoll", "RTO/RPO"],
			mapsTo: { requirement: "nis2:Art.21(2)(c)" },
		},
	),
	q(
		"SW-14",
		SUP,
		"Sind alle Unterauftragnehmer mit Zugriff auf unsere Daten benannt, und werden Änderungen vorab mitgeteilt?",
		{
			evidenceHints: ["Liste der Unterauftragnehmer"],
			mapsTo: { requirement: "nis2:Art.21(2)(d)" },
		},
	),
	q(
		"SW-15",
		SUP,
		"Werden unsere Daten ausschließlich in der EU/im EWR verarbeitet und gespeichert?",
		{
			evidenceRequired: false,
			help: "Falls nein: Länder und Rechtsgrundlage des Transfers angeben.",
		},
	),
	q(
		"SW-16",
		SUP,
		"Unterstützt ihr beim Ausstieg (Datenrückgabe in offenem Format, Löschbestätigung)?",
		{
			evidenceRequired: false,
		},
	),
];

const CRA_SW: AssessmentQuestion[] = [
	q(
		"CRA-01",
		ORG,
		"Fällt die gelieferte Software als Produkt mit digitalen Elementen unter den Cyber Resilience Act, und in welcher Rolle (Hersteller, Einführer)?",
		{
			evidenceRequired: false,
			help: "Reine Webdienste (SaaS) fallen meist unter NIS2, nicht unter den CRA.",
			mapsTo: { requirement: "cra:Art.2-3" },
		},
	),
	q(
		"CRA-02",
		ORG,
		"Ist eine EU-Konformitätserklärung vorhanden oder bis 11.12.2027 geplant?",
		{
			evidenceHints: ["EU-Konformitätserklärung", "Zeitplan"],
			mapsTo: { requirement: "cra:Art.28-30" },
		},
	),
	q(
		"CRA-03",
		DEV,
		"Wird zu jeder Version eine SBOM geliefert oder auf Anfrage bereitgestellt?",
		{
			evidenceHints: ["SBOM (CycloneDX/SPDX)"],
			mapsTo: { requirement: "cra:AnhI-II-1" },
		},
	),
	q(
		"CRA-04",
		DEV,
		"Ist ein Unterstützungszeitraum mit Sicherheitsupdates (mindestens fünf Jahre) zugesagt und angegeben?",
		{
			critical: true,
			evidenceHints: ["Angabe des Supportendes"],
			mapsTo: { requirement: "cra:Art.13(8)" },
		},
	),
	q(
		"CRA-05",
		DEV,
		"Werden Sicherheitsupdates kostenlos, signiert und getrennt von Funktionsupdates bereitgestellt?",
		{
			evidenceRequired: false,
			mapsTo: { requirement: "cra:AnhI-II-7-8" },
		},
	),
	q(
		"CRA-06",
		DEV,
		"Wird die Software ohne bekannte ausnutzbare Schwachstellen und mit sicherer Standardkonfiguration ausgeliefert?",
		{
			critical: true,
			evidenceHints: ["Scan-Bericht der ausgelieferten Version"],
			mapsTo: { requirement: "cra:AnhI-2a" },
		},
	),
	q(
		"CRA-07",
		INC,
		"Werdet ihr uns über aktiv ausgenutzte Schwachstellen und schwerwiegende Vorfälle informieren (CRA Art. 14 Abs. 8)?",
		{
			critical: true,
			evidenceRequired: false,
			mapsTo: { requirement: "cra:Art.14(8)" },
		},
	),
	q(
		"CRA-08",
		DEV,
		"Gibt es eine Richtlinie zur koordinierten Offenlegung mit Meldeadresse?",
		{
			evidenceRequired: false,
			mapsTo: { requirement: "cra:AnhI-II-5-6" },
		},
	),
	q(
		"CRA-09",
		DEV,
		"Werden behobene Schwachstellen veröffentlicht (Advisories, CVE, CSAF)?",
		{
			evidenceRequired: false,
			mapsTo: { requirement: "cra:AnhI-II-4" },
		},
	),
];

const ART30: [string, string] = ["art30", "Vertrag (DORA Art. 30)"];
const DD: [string, string] = ["dd", "Sorgfaltsprüfung (DORA Art. 28)"];

// DORA-IKT: eine Frage je Art.-30-Klausel (Klausel-Checkliste) plus Kernpunkte
// der Sorgfaltsprüfung. Antworten auf Klauselfragen schreiben die
// Klausel-Checkliste des Dienstleisters (contractClauses).
const DORA_IKT: AssessmentQuestion[] = [
	q(
		"DD-01",
		DD,
		"Liegt ein aktuelles Zertifikat oder Testat für die IKT-Dienstleistung vor (ISO 27001, BSI C5, SOC 2)?",
		{
			weight: 2,
			evidenceHints: ["Zertifikat/Testat"],
		},
	),
	q(
		"DD-02",
		DD,
		"Sind Unterauftragnehmer für kritische oder wichtige Funktionen benannt und deren Standorte bekannt?",
		{
			evidenceHints: ["Liste der Unterauftragnehmer mit Ländern"],
		},
	),
	q(
		"DD-03",
		DD,
		"Gibt es einen getesteten Notfall- und Wiederanlaufplan für die Dienstleistung?",
		{
			critical: true,
			evidenceHints: ["Testbericht"],
		},
	),
	q(
		"DD-04",
		DD,
		"Nehmt ihr an unseren Tests der digitalen operationalen Resilienz teil (inkl. TLPT, falls benannt)?",
		{
			evidenceRequired: false,
		},
	),
	...ART30_CLAUSES.map((c, i) =>
		q(
			`A30-${String(i + 1).padStart(2, "0")}`,
			ART30,
			`Sichert der Vertrag zu: ${c.title}?`,
			{
				help: `${c.text}${c.criticalOnly ? " (Pflicht für kritische oder wichtige Funktionen.)" : ""}`,
				evidenceRequired: false,
				mapsTo: { art30: [c.code] },
			},
		),
	),
];

export const SUPPLIER_TEMPLATES: readonly SupplierTemplate[] = [
	{
		code: "nis2-sw",
		version: "1",
		title: "Software- und IKT-Lieferant (NIS2)",
		frameworks: ["nis2"],
		description:
			"Sicherheit in der Lieferkette nach NIS2 Art. 21 Abs. 2 lit. d/e: ISMS, sichere Entwicklung, Schwachstellen, Zugang, Vorfallmeldung, Unterauftragnehmer.",
		questions: NIS2_SW,
	},
	{
		code: "cra-sw",
		version: "1",
		title: "Software-Komponenten (CRA)",
		frameworks: ["cra"],
		description:
			"Zulieferer von Software-Komponenten für eigene Produkte: Konformität, SBOM, Supportzeitraum, Updates, Meldungen.",
		questions: CRA_SW,
	},
	{
		code: "dora-ikt",
		version: "1",
		title: "IKT-Drittdienstleister (DORA)",
		frameworks: ["dora"],
		description:
			"Sorgfaltsprüfung nach DORA Art. 28 und Abgleich je Klausel nach Art. 30 — die Antworten füllen die Klausel-Checkliste.",
		questions: DORA_IKT,
	},
];

export const SUPPLIER_TEMPLATE_BY_CODE = new Map(
	SUPPLIER_TEMPLATES.map((t) => [t.code, t]),
);
