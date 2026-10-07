import type { CatalogRequirement, CatalogSection } from "./types";

// Sanktionsrecht (EU / AWG / OFAC-Praxis / FATF). Authoring-Quelle:
// docs/regulatory/anforderungskatalog-2026-10.md (Abschnitte 6, 8) und
// Businessplan 16/18.5. Rechtsstand Oktober 2026; Listen ändern sich laufend —
// gegen Primärquellen prüfen. Paraphrasen, kein Rechtsrat.

export const SANCTIONS_SECTIONS: CatalogSection[] = [
	{
		code: "SAN",
		title: "Sanktionen, Embargos, Hochrisikoländer",
		sortOrder: 10,
	},
];

export const SANCTIONS_REQUIREMENTS: CatalogRequirement[] = [
	{
		code: "EU-833-2014-Art.5b",
		sectionCode: "SAN",
		title: "Verbot von Kryptowerte-Dienstleistungen für russische Personen",
		requirementText:
			"Kryptowerte-Dienstleistungen, Wallet-, Konto- und Verwahrdienste dürfen russischen Staatsangehörigen, in Russland ansässigen Personen und dort niedergelassenen Organisationen nicht erbracht werden (Ausnahmen für EU-Staatsangehörige/Aufenthaltsberechtigte).",
		domain: "aml",
		legalBasisRefs: ["VO (EU) 833/2014 Art. 5b"],
		evidenceHints: ["Onboarding-Sperrregeln", "Screening-Protokolle"],
		relatedRequirements: ["gwg:§10"],
		sortOrder: 10,
	},
	{
		code: "EU-Pakete",
		sectionCode: "SAN",
		title: "Laufende EU-Sanktionspakete umsetzen",
		requirementText:
			"Neue Sanktionspakete (zuletzt 21. Paket, VO 2026/1848) werden zeitnah ausgewertet: gelistete Personen, Organisationen und Wallet-Adressen werden gesperrt, betroffene Kryptowerte, Dienstleister und Jurisdiktionen angepasst.",
		guidance:
			"Änderungsdienst abonnieren; jede Änderung erzeugt eine Aufgabe an die Geldwäschebeauftragte Person.",
		domain: "aml",
		legalBasisRefs: ["VO (EU) 2026/1848"],
		evidenceHints: ["Änderungsprotokoll", "Listen-Update-Nachweise"],
		sortOrder: 20,
	},
	{
		code: "AWG-§18",
		sectionCode: "SAN",
		title: "Strafbewehrte Embargoverstöße (AWG)",
		requirementText:
			"Verstöße gegen EU-Embargos und Bereitstellungsverbote sind nach § 18 AWG strafbar; das Unternehmen stellt durch Screening, Vier-Augen-Freigaben und Schulung sicher, dass keine verbotenen Transaktionen ausgeführt werden.",
		domain: "aml",
		evidenceHints: ["Schulungsnachweise", "Freigabeprotokolle"],
		sortOrder: 30,
	},
	{
		code: "OFAC",
		sectionCode: "SAN",
		title: "US-Sanktionen (OFAC) in der Praxis",
		requirementText:
			"Aufgrund von USD-Stablecoins, US-Gegenparteien und Bankpartnern werden OFAC-SDN-Listen und gelistete Wallet-Adressen zusätzlich gescreent; Secondary-Sanctions-Risiken werden in der Länderrisikobewertung berücksichtigt.",
		domain: "aml",
		evidenceHints: ["Screening-Konfiguration", "Länderrisikobewertung"],
		sortOrder: 40,
	},
	{
		code: "FATF",
		sectionCode: "SAN",
		title: "Hochrisikoländer (EU-Liste, FATF Grey/Black List)",
		requirementText:
			"Drittländer mit hohem Risiko nach der delegierten EU-Verordnung sowie FATF-Listen werden identifiziert; Geschäftsbeziehungen und Transaktionen mit Bezug dazu unterliegen verstärkter Sorgfalt oder werden blockiert (eigene Länderpolitik).",
		domain: "aml",
		evidenceHints: ["Jurisdiktionsregister", "Länderpolitik"],
		relatedRequirements: ["gwg:§15"],
		sortOrder: 50,
	},
	{
		code: "Screening",
		sectionCode: "SAN",
		title: "Täglicher automatisierter Listenabgleich",
		requirementText:
			"Kunden, wirtschaftlich Berechtigte, Gegenparteien und Adressen werden beim Onboarding und täglich automatisiert gegen aktuelle Sanktions- und PEP-Listen geprüft; Treffer werden dokumentiert bearbeitet, der Lauf wird nachgewiesen.",
		domain: "aml",
		evidenceHints: ["Tageslauf-Nachweise", "Trefferbearbeitung"],
		tools: {
			startup: ["ComplyAdvantage"],
			scale: ["LSEG World-Check", "Dow Jones R&C"],
		},
		relatedRequirements: ["gwg:§27ZAG-TM", "tfr:ONCHAIN"],
		sortOrder: 60,
	},
];
