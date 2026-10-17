import type { CatalogRequirement, CatalogSection } from "./types";

// Cyber Resilience Act — Verordnung (EU) 2024/2847 über horizontale
// Cybersicherheitsanforderungen für Produkte mit digitalen Elementen.
// Inkraft 10.12.2024; Meldepflichten (Art. 14) gelten ab 11.09.2026, die
// übrigen Pflichten ab 11.12.2027 (Art. 71). Authoring-Quelle:
// docs/regulatory/anforderungskatalog-2026-10.md (Abschnitt CRA).
// Paraphrasen, kein Rechtsrat — vor SaaS-Verkauf gegen EUR-Lex prüfen.
//
// Rollen: Hersteller (manufacturer), Einführer (importer), Händler
// (distributor). Ohne Produktregister gilt alles Gewählte als Arbeitsgegenstand;
// mit Produkten leitet Klick die Rollen aus dem Register ab.

const REPORTING_FROM = "2026-09-11" as const;
const APPLIES_FROM = "2027-12-11" as const;
const MANUFACTURER = ["manufacturer"] as const;

export const CRA_SECTIONS: CatalogSection[] = [
	{ code: "A", title: "Anwendungsbereich und Einstufung", sortOrder: 10 },
	{ code: "B", title: "Pflichten der Hersteller (Art. 13)", sortOrder: 20 },
	{ code: "C", title: "Meldepflichten (Art. 14)", sortOrder: 30 },
	{
		code: "D",
		title: "Sicherheitsanforderungen an Produkte (Anhang I Teil I)",
		sortOrder: 40,
	},
	{
		code: "E",
		title: "Umgang mit Schwachstellen (Anhang I Teil II)",
		sortOrder: 50,
	},
	{ code: "F", title: "Nutzerinformation (Anhang II)", sortOrder: 60 },
	{ code: "G", title: "Technische Dokumentation (Anhang VII)", sortOrder: 70 },
	{ code: "H", title: "Konformitätsbewertung und CE", sortOrder: 80 },
	{ code: "I", title: "Einführer und Händler", sortOrder: 90 },
];

export const CRA_REQUIREMENTS: CatalogRequirement[] = [
	// ── A Anwendungsbereich ──────────────────────────────────────────────────
	{
		code: "Art.2-3",
		sectionCode: "A",
		title: "Betroffenheit: Produkte mit digitalen Elementen",
		requirementText:
			"Ermittelt wird, welche Produkte mit digitalen Elementen auf dem EU-Markt bereitgestellt werden (Software, Hardware mit Software, zugehörige Datenfernverarbeitung) und welche Rolle die Organisation je Produkt hat (Hersteller, Einführer, Händler). Ausgenommen sind u. a. reine SaaS-Dienste ohne Produktbezug (NIS2), Medizinprodukte, Kfz-Typgenehmigung und nicht kommerzielle Open Source.",
		guidance:
			"Reiner Webdienst (SaaS) im Browser ist in der Regel kein Produkt im Sinne des CRA — dann greift NIS2. Mobile Apps, Desktop- und CLI-Clients, SDKs/Bibliotheken, Browser-Erweiterungen, Firmware und Geräte sind erfasst; Backend-Dienste nur, wenn sie für eine Funktion des Produkts nötig sind (Datenfernverarbeitung, Art. 3 Nr. 2).",
		domain: "compliance",
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Produktinventar mit Rolle und Begründung"],
		relatedRequirements: ["nis2:Art.2-3"],
		recommendations: [
			{
				level: "must",
				text: "Lege im Produktregister je Produkt fest, ob es in den Anwendungsbereich fällt — mit Begründung. Das ist der erste Nachweis, den eine Marktüberwachung sehen will.",
			},
		],
		auditQuestions: [
			"Welche Produkte mit digitalen Elementen bringt ihr in der EU in Verkehr?",
			"Warum fällt euer Dienst (nicht) unter den CRA?",
		],
		sortOrder: 10,
	},
	{
		code: "Art.7-8",
		sectionCode: "A",
		title: "Einstufung: Standard, wichtig (Klasse I/II), kritisch",
		requirementText:
			"Jedes Produkt im Anwendungsbereich wird anhand der Kernfunktion eingestuft: Standardprodukt, wichtiges Produkt der Klasse I oder II (Anhang III) oder kritisches Produkt (Anhang IV). Die Einstufung bestimmt das Konformitätsbewertungsverfahren.",
		domain: "compliance",
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Einstufung je Produkt mit Anhang-Kategorie"],
		auditQuestions: [
			"Welche Kernfunktion hat das Produkt, und fällt sie unter Anhang III oder IV?",
		],
		sortOrder: 20,
	},

	// ── B Herstellerpflichten ────────────────────────────────────────────────
	{
		code: "Art.13(1-4)",
		sectionCode: "B",
		title: "Cybersicherheits-Risikobewertung je Produkt",
		requirementText:
			"Hersteller bewerten die Cybersicherheitsrisiken des Produkts über Planung, Entwicklung, Herstellung, Lieferung und Wartung, berücksichtigen Zweckbestimmung und vorhersehbare Nutzung, leiten daraus die anwendbaren Anforderungen aus Anhang I ab und aktualisieren die Bewertung während des Unterstützungszeitraums.",
		domain: "development",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Produkt-Risikobewertung", "Bedrohungsmodell"],
		relatedRequirements: ["iso27001:A.8.25"],
		auditQuestions: [
			"Wie habt ihr entschieden, welche Anforderungen aus Anhang I für das Produkt gelten?",
		],
		sortOrder: 10,
	},
	{
		code: "Art.13(5)",
		sectionCode: "B",
		title: "Sorgfalt bei Komponenten Dritter (inkl. Open Source)",
		requirementText:
			"Komponenten von Dritten — auch freie und quelloffene Software — werden mit gebotener Sorgfalt ausgewählt und überwacht, damit sie die Sicherheit des Produkts nicht gefährden.",
		domain: "development",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["SBOM", "Abhängigkeitsrichtlinie", "Scan-Ergebnisse"],
		relatedRequirements: ["nis2:Art.21(2)(d)", "iso27001:A.8.28"],
		sortOrder: 20,
	},
	{
		code: "Art.13(6)",
		sectionCode: "B",
		title: "Schwachstellen in Komponenten melden",
		requirementText:
			"Findet der Hersteller eine Schwachstelle in einer integrierten Komponente (auch Open Source), meldet er sie der Person oder Stelle, die die Komponente pflegt, und behebt sie im eigenen Produkt.",
		domain: "development",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Upstream-Meldungen", "Fix-Nachweise"],
		sortOrder: 30,
	},
	{
		code: "Art.13(8)",
		sectionCode: "B",
		title: "Unterstützungszeitraum festlegen",
		requirementText:
			"Der Unterstützungszeitraum, in dem Schwachstellen wirksam behandelt werden, entspricht der erwarteten Nutzungsdauer und beträgt mindestens fünf Jahre, sofern das Produkt nicht absehbar kürzer genutzt wird; er wird begründet und spätestens beim Inverkehrbringen angegeben.",
		domain: "development",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Erklärung zum Unterstützungszeitraum mit Begründung"],
		sortOrder: 40,
	},
	{
		code: "Art.13(9)",
		sectionCode: "B",
		title: "Sicherheitsupdates während des Unterstützungszeitraums",
		requirementText:
			"Sicherheitsupdates bleiben nach ihrer Bereitstellung mindestens zehn Jahre oder für den restlichen Unterstützungszeitraum verfügbar (der längere Zeitraum gilt).",
		domain: "development",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Update-Archiv", "Release-Notes"],
		sortOrder: 50,
	},
	{
		code: "Art.13(12-13)",
		sectionCode: "B",
		title: "Aufbewahrung und Ansprechpartner",
		requirementText:
			"Technische Dokumentation und EU-Konformitätserklärung werden zehn Jahre (oder den Unterstützungszeitraum, wenn länger) aufbewahrt; Name, Anschrift und eine Kontaktstelle für Schwachstellen stehen am Produkt bzw. in der Dokumentation.",
		domain: "compliance",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Aufbewahrungskonzept", "Kontaktangaben"],
		sortOrder: 60,
	},

	// ── C Meldepflichten (seit 11.09.2026) ─────────────────────────────────
	{
		code: "Art.14(1-2)",
		sectionCode: "C",
		title: "Aktiv ausgenutzte Schwachstellen melden (24 h · 72 h · 14 Tage)",
		requirementText:
			"Eine aktiv ausgenutzte Schwachstelle im Produkt wird gleichzeitig dem als Koordinator benannten CSIRT (in Deutschland das BSI) und der ENISA über die einheitliche Meldeplattform gemeldet: Frühwarnung binnen 24 Stunden, Schwachstellenmeldung binnen 72 Stunden, Abschlussbericht spätestens 14 Tage nach Verfügbarkeit einer Korrektur- oder Abhilfemaßnahme.",
		domain: "incident",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: REPORTING_FROM,
		legalStatus: "in_force",
		evidenceHints: ["Meldeprozess", "Meldebelege", "Fristenprotokoll"],
		relatedRequirements: ["nis2:Art.23"],
		recommendations: [
			{
				level: "must",
				text: "Lege Vorfälle mit Regime „CRA – Schwachstelle“ an: Klick rechnet 24 h/72 h ab Kenntnis und den Abschlussbericht ab dem Fix-Datum.",
			},
		],
		auditQuestions: [
			"Wer entscheidet, ob eine Schwachstelle „aktiv ausgenutzt“ ist, und wie schnell?",
		],
		sortOrder: 10,
	},
	{
		code: "Art.14(3-4)",
		sectionCode: "C",
		title: "Schwerwiegende Sicherheitsvorfälle melden (24 h · 72 h · 1 Monat)",
		requirementText:
			"Schwerwiegende Vorfälle, die die Sicherheit des Produkts beeinträchtigen (Verfügbarkeit, Integrität oder Vertraulichkeit von Daten bzw. Funktionen, eingeschleuster Schadcode), werden gemeldet: Frühwarnung binnen 24 Stunden, Vorfallmeldung binnen 72 Stunden, Abschlussbericht binnen eines Monats nach der Vorfallmeldung.",
		domain: "incident",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: REPORTING_FROM,
		legalStatus: "in_force",
		evidenceHints: ["Meldebelege", "Abschlussberichte"],
		relatedRequirements: ["nis2:Art.23"],
		sortOrder: 20,
	},
	{
		code: "Art.14(8)",
		sectionCode: "C",
		title: "Nutzer informieren",
		requirementText:
			"Nach Kenntnis einer aktiv ausgenutzten Schwachstelle oder eines schwerwiegenden Vorfalls werden betroffene Nutzer — bei Bedarf öffentlich — über die Auswirkungen und mögliche Abhilfe- und Schutzmaßnahmen informiert, soweit nötig in maschinenlesbarer Form.",
		domain: "incident",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: REPORTING_FROM,
		legalStatus: "in_force",
		evidenceHints: ["Advisories", "Kundeninformationen"],
		sortOrder: 30,
	},

	// ── D Anhang I Teil I — Produkteigenschaften ───────────────────────────
	{
		code: "AnhI-1",
		sectionCode: "D",
		title: "Risikoangemessenes Sicherheitsniveau",
		requirementText:
			"Produkte werden so konzipiert, entwickelt und hergestellt, dass sie ein den Risiken angemessenes Cybersicherheitsniveau gewährleisten.",
		domain: "development",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Sicherer Entwicklungsprozess", "Risikobewertung"],
		sortOrder: 10,
	},
	{
		code: "AnhI-2a",
		sectionCode: "D",
		title: "Keine bekannten ausnutzbaren Schwachstellen bei Auslieferung",
		requirementText:
			"Produkte werden ohne bekannte ausnutzbare Schwachstellen auf dem Markt bereitgestellt.",
		domain: "development",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Scan vor Release", "SBOM-Abgleich", "Pentest-Bericht"],
		sortOrder: 20,
	},
	{
		code: "AnhI-2b",
		sectionCode: "D",
		title: "Sicher voreingestellt (Secure by Default) mit Rücksetzung",
		requirementText:
			"Produkte werden mit einer sicheren Standardkonfiguration bereitgestellt, einschließlich der Möglichkeit, das Produkt in den ursprünglichen Zustand zurückzusetzen.",
		domain: "development",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Härtungs-Standardkonfiguration", "Reset-Funktion"],
		sortOrder: 30,
	},
	{
		code: "AnhI-2c",
		sectionCode: "D",
		title: "Sicherheitsupdates, automatisch als Standard",
		requirementText:
			"Schwachstellen lassen sich über Sicherheitsupdates beheben, standardmäßig automatisch mit klarer Abwahlmöglichkeit, Benachrichtigung der Nutzer und der Option, Updates aufzuschieben.",
		domain: "development",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Update-Mechanismus", "Konfigurationsoptionen"],
		sortOrder: 40,
	},
	{
		code: "AnhI-2d",
		sectionCode: "D",
		title: "Schutz vor unbefugtem Zugriff",
		requirementText:
			"Unbefugter Zugriff wird durch geeignete Kontrollmechanismen verhindert (Authentifizierung, Identitäts- und Zugangsverwaltung) und mögliche unbefugte Zugriffe werden gemeldet.",
		domain: "access",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Authentisierungskonzept", "Rollenmodell"],
		sortOrder: 50,
	},
	{
		code: "AnhI-2e-f",
		sectionCode: "D",
		title:
			"Vertraulichkeit und Integrität von Daten, Befehlen und Konfiguration",
		requirementText:
			"Gespeicherte, übertragene und verarbeitete Daten werden vertraulich gehalten (z. B. Verschlüsselung nach Stand der Technik); Daten, Programme, Befehle und Konfiguration werden vor unbefugter Manipulation geschützt und Verfälschungen gemeldet.",
		domain: "crypto",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Kryptokonzept", "Signaturen", "Integritätsprüfungen"],
		sortOrder: 60,
	},
	{
		code: "AnhI-2g",
		sectionCode: "D",
		title: "Datenminimierung",
		requirementText:
			"Es werden nur Daten verarbeitet, die für die Zweckbestimmung des Produkts angemessen, erheblich und auf das Notwendige beschränkt sind.",
		domain: "compliance",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Datenflussdiagramm", "Datenschutz-Folgenabschätzung"],
		relatedRequirements: ["dsgvo:Art.5", "dsgvo:Art.24-25"],
		sortOrder: 70,
	},
	{
		code: "AnhI-2h-i",
		sectionCode: "D",
		title: "Verfügbarkeit wesentlicher Funktionen, Schutz anderer Geräte",
		requirementText:
			"Wesentliche Funktionen bleiben auch bei Angriffen (z. B. Denial of Service) verfügbar; das Produkt beeinträchtigt die Verfügbarkeit anderer Geräte oder Netze möglichst wenig.",
		domain: "operations",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Lasttests", "Rate-Limits", "Resilienzkonzept"],
		sortOrder: 80,
	},
	{
		code: "AnhI-2j-k",
		sectionCode: "D",
		title: "Angriffsfläche begrenzen, Auswirkungen eindämmen",
		requirementText:
			"Angriffsflächen einschließlich externer Schnittstellen werden begrenzt; Mechanismen und Techniken zur Minderung der Ausnutzung reduzieren die Auswirkungen eines Vorfalls.",
		domain: "development",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Härtung", "Sandboxing", "Schnittstelleninventar"],
		sortOrder: 90,
	},
	{
		code: "AnhI-2l",
		sectionCode: "D",
		title: "Sicherheitsprotokollierung mit Abwahl durch Nutzer",
		requirementText:
			"Sicherheitsrelevante Informationen werden aufgezeichnet bzw. überwacht (Zugriffe, Änderungen an Daten, Diensten oder Funktionen), mit einer Abwahlmöglichkeit für die Nutzer.",
		domain: "operations",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Logging-Konzept", "Beispiel-Logs"],
		sortOrder: 100,
	},
	{
		code: "AnhI-2m",
		sectionCode: "D",
		title: "Daten sicher löschen und übertragen",
		requirementText:
			"Nutzer können alle Daten und Einstellungen dauerhaft, sicher und einfach löschen; wo Daten auf andere Produkte übertragen werden können, geschieht das sicher.",
		domain: "asset",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Löschfunktion", "Exportfunktion"],
		sortOrder: 110,
	},

	// ── E Anhang I Teil II — Schwachstellenbehandlung ──────────────────────
	{
		code: "AnhI-II-1",
		sectionCode: "E",
		title: "Komponenten erfassen: SBOM",
		requirementText:
			"Schwachstellen und Komponenten des Produkts werden ermittelt und dokumentiert, unter anderem durch eine Software-Stückliste (SBOM) in einem gängigen maschinenlesbaren Format, die mindestens die obersten Abhängigkeiten abdeckt.",
		domain: "development",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: [
			"SBOM (CycloneDX/SPDX) je Release",
			"BSI TR-03183-2-Prüfung",
		],
		recommendations: [
			{
				level: "should",
				text: "Erzeuge die SBOM in der CI (z. B. Syft, cyclonedx-npm) und lade sie je Release ins Produktregister — Klick prüft die Pflichtfelder nach BSI TR-03183-2.",
			},
		],
		sortOrder: 10,
	},
	{
		code: "AnhI-II-2",
		sectionCode: "E",
		title: "Schwachstellen unverzüglich beheben, Sicherheitsupdates getrennt",
		requirementText:
			"Schwachstellen werden unverzüglich behandelt und behoben, auch durch Sicherheitsupdates; wo technisch machbar, werden Sicherheitsupdates getrennt von Funktionsupdates bereitgestellt.",
		domain: "development",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Patch-SLAs", "Release-Historie"],
		sortOrder: 20,
	},
	{
		code: "AnhI-II-3",
		sectionCode: "E",
		title: "Regelmäßige Sicherheitstests",
		requirementText:
			"Die Sicherheit des Produkts wird wirksam und regelmäßig getestet und überprüft.",
		domain: "development",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["SAST/DAST-Ergebnisse", "Pentest-Berichte"],
		sortOrder: 30,
	},
	{
		code: "AnhI-II-4",
		sectionCode: "E",
		title: "Behobene Schwachstellen veröffentlichen (Advisories)",
		requirementText:
			"Nach Bereitstellung eines Updates werden Informationen zu behobenen Schwachstellen veröffentlicht: Beschreibung, betroffene Produkte, Auswirkungen, Schweregrad und Abhilfe; eine Verzögerung ist nur begründet zulässig, wenn die Sicherheitsrisiken überwiegen.",
		domain: "incident",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Security Advisories (z. B. CSAF)", "Changelog"],
		sortOrder: 40,
	},
	{
		code: "AnhI-II-5-6",
		sectionCode: "E",
		title: "Richtlinie zur koordinierten Offenlegung und Meldeadresse",
		requirementText:
			"Eine Richtlinie zur koordinierten Offenlegung von Schwachstellen (CVD) wird umgesetzt und durchgesetzt; eine Kontaktadresse für Meldungen von Schwachstellen ist veröffentlicht, Informationen zu möglichen Schwachstellen auch in Komponenten Dritter werden geteilt.",
		domain: "incident",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["CVD-Richtlinie", "security.txt (RFC 9116)"],
		sortOrder: 50,
	},
	{
		code: "AnhI-II-7-8",
		sectionCode: "E",
		title: "Updates sicher verteilen, kostenlos und zeitnah",
		requirementText:
			"Updates werden über sichere Mechanismen verteilt (z. B. signiert, ggf. automatisch); Sicherheitsupdates werden unverzüglich und — sofern nicht anders vereinbart — kostenlos bereitgestellt, mit Hinweisen zu den nötigen Schritten für Nutzer.",
		domain: "development",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Signaturkonzept", "Update-Kanal"],
		sortOrder: 60,
	},

	// ── F Nutzerinformation ─────────────────────────────────────────────────
	{
		code: "AnhII",
		sectionCode: "F",
		title: "Informationen und Anleitungen für Nutzer",
		requirementText:
			"Dem Produkt liegen Informationen bei: Herstellerkontakt und Meldestelle für Schwachstellen, Produktidentifikation, Zweckbestimmung, bekannte Risiken, Unterstützungszeitraum (mindestens Enddatum), Zugang zur EU-Konformitätserklärung und zur SBOM (falls bereitgestellt), Anleitung zu sicherer Inbetriebnahme, Updates und Außerbetriebnahme.",
		domain: "compliance",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Produktinformation", "Sicherheitshinweise"],
		sortOrder: 10,
	},

	// ── G Technische Dokumentation ─────────────────────────────────────────
	{
		code: "AnhVII",
		sectionCode: "G",
		title: "Technische Dokumentation vor dem Inverkehrbringen",
		requirementText:
			"Vor dem Inverkehrbringen wird eine technische Dokumentation erstellt und laufend aktualisiert: Produktbeschreibung, Konzeption und Entwicklung inkl. Architektur, Schwachstellenbehandlung (inkl. SBOM, CVD, Update-Verteilung), Risikobewertung, angewandte Normen, Testberichte, Unterstützungszeitraum und EU-Konformitätserklärung.",
		domain: "compliance",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Technische Dokumentation (Gliederung Anhang VII)"],
		sortOrder: 10,
	},

	// ── H Konformität ───────────────────────────────────────────────────────
	{
		code: "Art.32",
		sectionCode: "H",
		title: "Konformitätsbewertungsverfahren nach Einstufung",
		requirementText:
			"Standardprodukte: interne Kontrolle (Modul A). Wichtige Produkte der Klasse I: Modul A nur bei vollständiger Anwendung harmonisierter Normen bzw. gemeinsamer Spezifikationen, sonst EU-Baumusterprüfung (B + C) oder umfassende Qualitätssicherung (H). Klasse II: B + C oder H (oder Cybersicherheitszertifizierung). Kritische Produkte: europäisches Zertifikat, sofern vorgeschrieben.",
		domain: "compliance",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: [
			"Wahl des Verfahrens mit Begründung",
			"Prüfbericht benannte Stelle",
		],
		sortOrder: 10,
	},
	{
		code: "Art.28-30",
		sectionCode: "H",
		title: "EU-Konformitätserklärung und CE-Kennzeichnung",
		requirementText:
			"Nach erfolgreicher Konformitätsbewertung stellt der Hersteller eine EU-Konformitätserklärung (Anhang V) aus und bringt die CE-Kennzeichnung sichtbar, leserlich und dauerhaft an — bei Software in der Konformitätserklärung bzw. auf der Website.",
		domain: "compliance",
		appliesToRoles: [...MANUFACTURER],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["EU-Konformitätserklärung", "CE-Kennzeichnung"],
		sortOrder: 20,
	},

	// ── I Einführer und Händler ─────────────────────────────────────────────
	{
		code: "Art.19",
		sectionCode: "I",
		title: "Pflichten der Einführer",
		requirementText:
			"Einführer bringen nur Produkte in Verkehr, die die Anforderungen erfüllen: Konformitätsbewertung durchgeführt, technische Dokumentation vorhanden, CE und Unterlagen beigefügt, Meldeadresse für Schwachstellen angegeben. Bei Zweifeln wird nicht in Verkehr gebracht und der Hersteller informiert.",
		domain: "supplier",
		appliesToRoles: ["importer"],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Prüfprotokoll Wareneingang", "Herstellerunterlagen"],
		sortOrder: 10,
	},
	{
		code: "Art.20",
		sectionCode: "I",
		title: "Pflichten der Händler",
		requirementText:
			"Händler prüfen vor der Bereitstellung CE-Kennzeichnung, Informationen nach Anhang II und die Erfüllung der Pflichten von Hersteller und Einführer; bei Kenntnis von Schwachstellen informieren sie den Hersteller.",
		domain: "supplier",
		appliesToRoles: ["distributor"],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Prüfprotokoll", "Herstellerkommunikation"],
		sortOrder: 20,
	},
	{
		code: "Art.21-22",
		sectionCode: "I",
		title: "Wesentliche Änderung macht zum Hersteller",
		requirementText:
			"Wer ein Produkt unter eigenem Namen in Verkehr bringt oder wesentlich verändert, gilt als Hersteller und übernimmt dessen Pflichten für den geänderten Teil bzw. das ganze Produkt.",
		domain: "compliance",
		appliesToRoles: ["importer", "distributor"],
		effectiveFrom: APPLIES_FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Änderungsbewertung"],
		sortOrder: 30,
	},
];
