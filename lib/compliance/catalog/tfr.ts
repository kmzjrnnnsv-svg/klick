import type { CatalogRequirement, CatalogSection } from "./types";

// Geldtransferverordnung (TFR) – VO (EU) 2023/1113, gilt seit 30.12.2024.
// Authoring-Quelle: docs/regulatory/anforderungskatalog-2026-10.md, Abschnitt 6.2.
// Paraphrasen, kein Rechtsrat.

export const TFR_SECTIONS: CatalogSection[] = [
	{ code: "FIAT", title: "Geldtransfers (Art. 4–9)", sortOrder: 10 },
	{ code: "KRY", title: "Kryptowertetransfers (Art. 14–21)", sortOrder: 20 },
	{ code: "ALLG", title: "Allgemeines und Leitlinien", sortOrder: 30 },
];

const FE = ["financial_entity"] as const;
const CASP_TRANSFER = ["transfer", "exchange", "custody"] as const;

export const TFR_REQUIREMENTS: CatalogRequirement[] = [
	{
		code: "Art.4-6",
		sectionCode: "FIAT",
		title: "Begleitdaten bei Geldtransfers",
		requirementText:
			"Zahlungsdienstleister des Zahlers übermitteln mit dem Geldtransfer Name, Kontonummer und Adresse/Ausweisnummer/Geburtsdatum des Zahlers sowie Name und Kontonummer des Zahlungsempfängers; innerhalb der Union genügen die Kontonummern, die vollständigen Angaben sind auf Anfrage binnen drei Arbeitstagen zu liefern.",
		domain: "payments",
		appliesToRoles: [...FE],
		evidenceHints: ["Zahlungsnachrichten-Konfiguration"],
		tools: { startup: ["Payment-Hub mit SEPA-Feldern"], scale: ["dieselben"] },
		sortOrder: 10,
	},
	{
		code: "Art.7-9",
		sectionCode: "FIAT",
		title: "Erkennung fehlender Angaben beim Zahlungsempfänger-Dienstleister",
		requirementText:
			"Zahlungsdienstleister des Zahlungsempfängers prüfen die Vollständigkeit der Angaben, führen risikobasierte Verfahren für fehlende oder unvollständige Angaben (Zurückweisung, Aussetzung, Nachforderung) und melden wiederholt säumige Dienstleister der Behörde.",
		domain: "payments",
		appliesToRoles: [...FE],
		evidenceHints: ["Prüfregeln", "Meldungen"],
		sortOrder: 20,
	},
	{
		code: "Art.14(1-4)",
		sectionCode: "KRY",
		title: "Begleitdaten bei Kryptowertetransfers",
		requirementText:
			"Der CASP des Originators übermittelt mit jedem Kryptowertetransfer — ohne Schwellenwert — Name, Distributed-Ledger-Adresse/Kontonummer, Adresse oder Ausweis-/Kundennummer bzw. Geburtsdatum des Originators sowie Name und Adresse/Kontonummer des Begünstigten; Übermittlung sicher und vor oder gleichzeitig mit dem Transfer.",
		domain: "payments",
		appliesToRoles: [...FE],
		services: [...CASP_TRANSFER],
		evidenceHints: ["Travel-Rule-Konzept", "Protokoll-Logs"],
		tools: {
			startup: ["Notabene", "Sumsub Travel Rule", "TRISA"],
			scale: ["21 Analytics", "GTR", "Veriscope"],
		},
		relatedRequirements: ["micar:Art.82"],
		recommendations: [
			{
				level: "must",
				text: "Begleitdaten in IVMS101 übermitteln und die Übermittlung je Transfer protokollieren — der Log ist der Nachweis.",
				source: "EBA GL",
				ref: "EBA/GL/2024/11",
			},
		],
		sortOrder: 100,
	},
	{
		code: "Art.14(5)",
		sectionCode: "KRY",
		title: "Transfers an selbst gehostete Adressen über 1 000 €",
		requirementText:
			"Bei Transfers an oder von selbst gehosteten Adressen über 1 000 € prüft der CASP, ob die Adresse dem eigenen Kunden gehört oder von ihm kontrolliert wird, und ergreift geeignete Maßnahmen (z. B. kryptografischer Eigentumsnachweis).",
		domain: "payments",
		appliesToRoles: [...FE],
		services: [...CASP_TRANSFER],
		evidenceHints: ["Ownership-Nachweise"],
		tools: {
			startup: ["Message Signing (EIP-191)", "Satoshi-Test"],
			scale: ["Notabene", "21 Analytics"],
		},
		relatedRequirements: ["amlr:Art.40"],
		sortOrder: 110,
	},
	{
		code: "Art.16-17",
		sectionCode: "KRY",
		title: "Pflichten des Begünstigten-CASP",
		requirementText:
			"Der CASP des Begünstigten prüft vor Gutschrift die Vollständigkeit und Übereinstimmung der Begleitdaten, führt risikobasierte Verfahren für fehlende Angaben (Zurückweisung, Rückgabe, Aussetzung, Nachforderung) und berücksichtigt fehlende Angaben in der Risikobewertung.",
		domain: "payments",
		appliesToRoles: [...FE],
		services: [...CASP_TRANSFER],
		evidenceHints: ["Regelwerk", "Fallakten"],
		sortOrder: 120,
	},
	{
		code: "Art.18",
		sectionCode: "KRY",
		title: "Bewertung fehlender Angaben als Verdachtsmoment",
		requirementText:
			"Fehlende oder unvollständige Angaben werden bei der Beurteilung berücksichtigt, ob ein Transfer verdächtig ist und der FIU zu melden ist.",
		domain: "aml",
		appliesToRoles: [...FE],
		services: [...CASP_TRANSFER],
		evidenceHints: ["Fallbewertungen"],
		relatedRequirements: ["gwg:§43"],
		sortOrder: 130,
	},
	{
		code: "Art.19-21",
		sectionCode: "KRY",
		title: "Zwischengeschaltete CASPs",
		requirementText:
			"Zwischengeschaltete CASPs leiten alle Begleitdaten weiter, erkennen fehlende Angaben und wenden risikobasierte Verfahren an.",
		domain: "payments",
		appliesToRoles: [...FE],
		services: [...CASP_TRANSFER],
		evidenceHints: ["Verfahrensbeschreibung"],
		sortOrder: 140,
	},
	{
		code: "Art.26",
		sectionCode: "ALLG",
		title: "Aufbewahrung",
		requirementText:
			"Angaben zu Zahler/Originator und Zahlungsempfänger/Begünstigtem werden fünf Jahre aufbewahrt und danach gelöscht.",
		domain: "aml",
		appliesToRoles: [...FE],
		evidenceHints: ["Archiv"],
		relatedRequirements: ["gwg:§8"],
		sortOrder: 200,
	},
	{
		code: "EBA-GL-2024-11",
		sectionCode: "ALLG",
		title: "EBA-Travel-Rule-Leitlinien",
		requirementText:
			"Die EBA-Leitlinien konkretisieren Verfahren für fehlende Angaben, Prüfung selbst gehosteter Adressen und Zusammenarbeit zwischen CASPs; die Umsetzung wird gegen die Leitlinien gemappt.",
		domain: "payments",
		appliesToRoles: [...FE],
		legalBasisRefs: ["EBA/GL/2024/11"],
		evidenceHints: ["Mapping"],
		sortOrder: 210,
	},
	{
		code: "ONCHAIN",
		sectionCode: "ALLG",
		title: "On-Chain-Risikoanalyse",
		requirementText:
			"Gegenadressen und Transaktionshistorien werden mit Blockchain-Analytics auf Sanktionsadressen, Mixer, Darknet-Exposure und Hochrisiko-Entitäten geprüft; Risiko-Score-Schwellen und Reaktionen sind definiert (GwG § 6, MiCAR Art. 68).",
		domain: "aml",
		appliesToRoles: [...FE],
		services: [...CASP_TRANSFER],
		evidenceHints: ["Analytics-Konfiguration", "Risk-Score-Schwellen"],
		tools: {
			startup: ["Chainalysis KYT", "Elliptic", "TRM Labs"],
			scale: ["Crystal", "Merkle Science"],
		},
		relatedRequirements: ["gwg:§27ZAG-TM", "sanctions:Screening"],
		sortOrder: 220,
	},
];
