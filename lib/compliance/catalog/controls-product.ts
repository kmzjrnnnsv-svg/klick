import type { CatalogControl } from "./types";

// Common Controls Produktsicherheit (CRA, S4): elf Controls für Hersteller,
// Einführer und Händler von Produkten mit digitalen Elementen. Die
// Entwicklungs-Controls (CC-DEV-01…05), Patchmanagement (CC-OPS-03) und das
// Vorfallmanagement (CC-INC-*) tragen den CRA mit — hier steht nur, was über
// ein ISMS hinaus produktbezogen nachgewiesen werden muss.

let order = 5000;
const next = () => {
	order += 10;
	return order;
};

export const PART_E: CatalogControl[] = [
	{
		code: "CC-PRD-01",
		title: "Produktinventar, Rolle und Einstufung",
		description:
			"Alle Produkte mit digitalen Elementen sind mit Rolle (Hersteller, Einführer, Händler), Anwendungsbereich des CRA mit Begründung, Einstufung (Standard, wichtig Klasse I/II, kritisch) und Lebenszyklus-Status erfasst.",
		implementationGuidance:
			"/produkte: je Produkt Art, Rolle, Einstufung und Begründung; reiner SaaS ohne Produktbezug als „nicht im Anwendungsbereich“ mit Verweis auf NIS2 dokumentieren. Einstufung bei jeder neuen Kernfunktion prüfen.",
		domain: "development",
		effort: "S",
		kind: "documentation",
		evidenceHints: [
			"Produktregister-Export",
			"Begründung der Einstufung je Produkt",
		],
		auditQuestions: [
			"Welche Produkte bringt ihr in Verkehr, und wie habt ihr sie eingestuft?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-PRD-02",
		title: "Koordinierte Offenlegung von Schwachstellen (CVD)",
		description:
			"Eine veröffentlichte Richtlinie zur koordinierten Offenlegung legt Meldeweg, Reaktionszeiten und Umgang mit Meldenden fest; eine Kontaktadresse für Schwachstellenmeldungen ist auffindbar (security.txt nach RFC 9116).",
		implementationGuidance:
			"CVD-Richtlinie aus der Vorlage veröffentlichen; /.well-known/security.txt mit Contact, Expires und Policy; Eingänge als Vorfall oder Aufgabe mit Frist erfassen; Eingangsbestätigung binnen 5 Arbeitstagen.",
		domain: "development",
		effort: "S",
		kind: "process",
		evidenceHints: ["CVD-Richtlinie", "security.txt", "Meldungseingänge"],
		auditQuestions: [
			"Wie meldet eine Forscherin eine Schwachstelle, und wer antwortet ihr?",
		],
		testMethodHint: "inspection",
		templates: ["RL-CVD", "VL-SECURITY-TXT"],
		sortOrder: next(),
	},
	{
		code: "CC-PRD-03",
		title: "SBOM je Release",
		description:
			"Zu jeder ausgelieferten Version gibt es eine maschinenlesbare Stückliste (CycloneDX oder SPDX) mindestens der obersten Abhängigkeitsebene, mit Version, eindeutiger Kennung, Lizenz und Hash; sie wird automatisch im Build erzeugt und gegen bekannte Schwachstellen geprüft.",
		implementationGuidance:
			"SBOM im CI erzeugen (Syft, Trivy, cdxgen), je Release in Klick hochladen; Klick prüft Pflichtfelder nach BSI TR-03183-2. SBOM nicht zwingend veröffentlichen — auf Verlangen der Marktüberwachung vorlegen.",
		domain: "development",
		effort: "M",
		kind: "technical",
		evidenceHints: ["SBOM je Release", "CI-Konfiguration", "Scan-Ergebnisse"],
		auditQuestions: [
			"Zeig mir die SBOM der aktuell ausgelieferten Version — wann wurde sie erzeugt?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-PRD-04",
		title: "Unterstützungszeitraum festlegen und veröffentlichen",
		description:
			"Je Produkt ist ein Unterstützungszeitraum festgelegt, der der erwarteten Nutzungsdauer entspricht (in der Regel mindestens fünf Jahre), begründet und beim Kauf klar angegeben (Monat und Jahr des Endes).",
		implementationGuidance:
			"Supportende im Produktregister pflegen; kürzer als fünf Jahre nur mit Begründung (erwartete Nutzungsdauer); Angabe auf Produktseite, Verpackung oder im Vertrag; Klick erinnert vor Ablauf.",
		domain: "development",
		effort: "S",
		kind: "documentation",
		evidenceHints: ["Supportzeitraum-Richtlinie", "Angabe am Produkt"],
		testMethodHint: "inspection",
		templates: ["RL-SUPPORTZEITRAUM"],
		sortOrder: next(),
	},
	{
		code: "CC-PRD-05",
		title: "Sichere Verteilung von Sicherheitsupdates",
		description:
			"Sicherheitsupdates werden signiert, über einen sicheren Kanal, kostenlos und — wo möglich — automatisch verteilt, getrennt von Funktionsupdates, mit Hinweisen zu Risiken und nötigen Schritten; jede Version bleibt mindestens zehn Jahre bzw. für den Unterstützungszeitraum verfügbar.",
		implementationGuidance:
			"Release-Signatur (Sigstore/cosign, Code-Signing-Zertifikat), Auto-Update mit Opt-out, eigener Security-Channel, Release Notes mit Sicherheitsteil; Update-Server in die Asset-Inventur.",
		domain: "development",
		effort: "M",
		kind: "technical",
		evidenceHints: ["Signaturnachweis", "Update-Mechanismus", "Release Notes"],
		auditQuestions: [
			"Wie erreicht ein kritisches Update die Nutzer, und wie wird es authentisiert?",
		],
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-PRD-06",
		title: "Cybersicherheits-Risikobewertung je Produkt",
		description:
			"Je Produkt gibt es eine dokumentierte Risikobewertung (Zweckbestimmung, vorhersehbare Nutzung, Einsatzumgebung, Bedrohungen), die festhält, welche Anforderungen aus Anhang I gelten und wie sie umgesetzt sind; sie wird bei wesentlichen Änderungen und im Unterstützungszeitraum fortgeschrieben.",
		implementationGuidance:
			"Vorlage „Produkt-Risikobewertung“ je Produkt; Bedrohungsmodell (STRIDE) verlinken; Begründung für nicht anwendbare Anforderungen aus Anhang I; Teil der technischen Dokumentation.",
		domain: "development",
		effort: "M",
		kind: "documentation",
		evidenceHints: ["Produkt-Risikobewertung", "Bedrohungsmodell"],
		testMethodHint: "inspection",
		templates: ["VL-PRODUKT-RISIKO"],
		sortOrder: next(),
	},
	{
		code: "CC-PRD-07",
		title: "Technische Dokumentation (Anhang VII)",
		description:
			"Für jedes Produkt liegt die technische Dokumentation vor: Beschreibung, Entwurf und Architektur, Schwachstellenprozess und SBOM-Verweis, Risikobewertung, Unterstützungszeitraum, angewandte Normen, Testberichte, EU-Konformitätserklärung; sie wird zehn Jahre aufbewahrt.",
		implementationGuidance:
			"Gliederung aus der Vorlage; je Release versioniert; Aufbewahrung zehn Jahre ab Inverkehrbringen bzw. bis Ende des Unterstützungszeitraums, je nachdem, was später endet.",
		domain: "development",
		effort: "L",
		kind: "documentation",
		evidenceHints: ["Technische Dokumentation je Produkt"],
		testMethodHint: "inspection",
		templates: ["VL-TECHDOK"],
		sortOrder: next(),
	},
	{
		code: "CC-PRD-08",
		title: "Konformitätsbewertung, EU-Konformitätserklärung und CE",
		description:
			"Das passende Verfahren (interne Kontrolle, EU-Baumusterprüfung + Konformität mit der Bauart, umfassende Qualitätssicherung oder Zertifizierung) ist je Einstufung gewählt und durchgeführt; die EU-Konformitätserklärung ist ausgestellt und das CE-Zeichen angebracht.",
		implementationGuidance:
			"Klick leitet das Verfahren aus Einstufung, harmonisierten Normen und FOSS-Status ab (Art. 32). Wichtige Produkte der Klasse II und kritische Produkte brauchen eine benannte Stelle — Vorlaufzeit einplanen.",
		domain: "compliance",
		effort: "L",
		kind: "process",
		evidenceHints: [
			"EU-Konformitätserklärung",
			"Bescheinigung der benannten Stelle",
			"CE-Kennzeichnung",
		],
		testMethodHint: "inspection",
		templates: ["VL-EU-KE"],
		sortOrder: next(),
	},
	{
		code: "CC-PRD-09",
		title: "Sicherheitshinweise und Nutzerinformation",
		description:
			"Zu jedem Produkt gibt es die Informationen aus Anhang II (Hersteller, Kontaktstelle für Schwachstellen, Zweckbestimmung, bekannte Risiken, Supportende, Anleitung für sichere Inbetriebnahme, Updates und Außerbetriebnahme) sowie öffentliche Advisories zu behobenen Schwachstellen.",
		implementationGuidance:
			"Nutzerinformation aus der Vorlage; Advisories maschinenlesbar (CSAF 2.0) mit CVE; Hinweis auf Supportende ein Jahr vorher.",
		domain: "development",
		effort: "M",
		kind: "documentation",
		evidenceHints: ["Nutzerinformation", "Advisories (CSAF)"],
		testMethodHint: "inspection",
		templates: ["VL-NUTZERINFO"],
		sortOrder: next(),
	},
	{
		code: "CC-PRD-10",
		title: "Secure by Default und Härtung des Produkts",
		description:
			"Das Produkt wird mit sicherer Standardkonfiguration ausgeliefert (keine Standardpasswörter, minimale offene Schnittstellen, Verschlüsselung an), lässt sich auf den Auslieferungszustand zurücksetzen und protokolliert sicherheitsrelevante Ereignisse.",
		implementationGuidance:
			"Härtungs-Checkliste je Produkt (OWASP ASVS/MASVS, ETSI EN 303 645 für Geräte) im Release-Gate; Pentest vor größeren Releases; Standardkonfiguration im Test geprüft.",
		domain: "development",
		effort: "M",
		kind: "technical",
		evidenceHints: [
			"Härtungs-Checkliste",
			"Pentest-Bericht",
			"Konfigurations-Defaults",
		],
		testMethodHint: "pentest",
		sortOrder: next(),
	},
	{
		code: "CC-PRD-11",
		title: "Prüfpflichten als Einführer oder Händler",
		description:
			"Vor dem Bereitstellen fremder Produkte wird geprüft, dass Konformitätsbewertung, technische Dokumentation, CE-Zeichen, Nutzerinformation und Herstellerangaben vorliegen; bei Zweifeln wird nicht bereitgestellt, bei bekannten Schwachstellen der Hersteller informiert.",
		implementationGuidance:
			"Eingangsprüfung je Produkt im Produktregister (Rolle Einführer/Händler), Lieferanten-Fragebogen „CRA-SW“, Unterlagen zehn Jahre aufbewahren; Kontaktangaben des Einführers am Produkt.",
		domain: "supplier",
		effort: "S",
		kind: "process",
		evidenceHints: ["Eingangsprüfung", "Herstellerunterlagen"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
];
