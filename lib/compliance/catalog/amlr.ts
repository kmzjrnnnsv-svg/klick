import type { CatalogRequirement, CatalogSection } from "./types";

// AMLR – Verordnung (EU) 2024/1624 (gilt ab 10.07.2027). Authoring-Quelle:
// docs/regulatory/anforderungskatalog-2026-10.md, Abschnitt 6.3. Nachfolger
// des GwG in den harmonisierten Teilen. Paraphrasen, kein Rechtsrat.

export const AMLR_SECTIONS: CatalogSection[] = [
	{
		code: "ORG",
		title: "Interne Richtlinien, Risikobewertung, Compliance (Art. 9–11)",
		sortOrder: 10,
	},
	{ code: "SOR", title: "Sorgfaltspflichten (Art. 19–28)", sortOrder: 20 },
	{
		code: "KRY",
		title: "Krypto-spezifische Pflichten (Art. 37, 40)",
		sortOrder: 30,
	},
];

const OBL = ["aml_obliged", "financial_entity", "agent"] as const;
const FROM = "2027-07-10" as const;

export const AMLR_REQUIREMENTS: CatalogRequirement[] = [
	{
		code: "Art.9",
		sectionCode: "ORG",
		title: "Interne Richtlinien, Verfahren und Kontrollen; Compliance-Manager",
		requirementText:
			"Verpflichtete verfügen über interne Richtlinien, Verfahren und Kontrollen zur Risikominderung, benennen ein Mitglied des Leitungsorgans als Compliance-Manager und sorgen für eine unabhängige Prüfung der Maßnahmen.",
		domain: "aml",
		appliesToRoles: [...OBL],
		effectiveFrom: FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Rollenmodell", "Richtlinienhandbuch"],
		relatedRequirements: ["gwg:§4", "gwg:§6"],
		sortOrder: 10,
	},
	{
		code: "Art.10",
		sectionCode: "ORG",
		title: "Unternehmensweite Risikobewertung",
		requirementText:
			"Verpflichtete ermitteln und bewerten die Risiken aus Kunden, Ländern, Produkten, Transaktionen und Kanälen auf Basis der supranationalen und nationalen Risikobewertungen, dokumentieren sie und aktualisieren sie regelmäßig.",
		domain: "aml",
		appliesToRoles: [...OBL],
		effectiveFrom: FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Risikobewertung"],
		relatedRequirements: ["gwg:§5"],
		sortOrder: 20,
	},
	{
		code: "Art.11",
		sectionCode: "ORG",
		title: "Compliance Officer",
		requirementText:
			"Ein Compliance Officer auf ausreichend hoher Hierarchieebene ist für die tägliche Umsetzung der Richtlinien und die Meldung an die FIU verantwortlich und berichtet dem Compliance-Manager.",
		domain: "aml",
		appliesToRoles: [...OBL],
		effectiveFrom: FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Bestellung"],
		relatedRequirements: ["gwg:§7"],
		sortOrder: 30,
	},
	{
		code: "Art.19-28",
		sectionCode: "SOR",
		title: "Harmonisierte Sorgfaltspflichten",
		requirementText:
			"Identifizierung und Überprüfung von Kunden und wirtschaftlich Berechtigten, Zweck der Geschäftsbeziehung, laufende Überwachung und Aktualisierung — mit EU-weit einheitlichen Schwellen (u. a. 1 000 € bei Krypto-Transfers mit Gelegenheitskunden) und Datenanforderungen.",
		domain: "aml",
		appliesToRoles: [...OBL],
		effectiveFrom: FROM,
		legalStatus: "upcoming",
		evidenceHints: ["KYC-Datenmodell", "Arbeitsanweisung"],
		relatedRequirements: ["gwg:§10", "gwg:§11-13"],
		sortOrder: 100,
	},
	{
		code: "Art.28-RTS",
		sectionCode: "SOR",
		title: "AMLA-RTS zum KYC-Datenumfang",
		requirementText:
			"Die technischen Regulierungsstandards der AMLA legen fest, welche Daten zur Identifizierung und Überprüfung mindestens zu erheben sind; Datenmodelle und Formulare werden daran ausgerichtet.",
		domain: "aml",
		appliesToRoles: [...OBL],
		effectiveFrom: FROM,
		legalStatus: "upcoming",
		legalBasisRefs: ["AMLA-RTS zu Art. 28"],
		evidenceHints: ["Datenmodell-Mapping"],
		sortOrder: 110,
	},
	{
		code: "Art.37",
		sectionCode: "KRY",
		title: "Grenzüberschreitende Krypto-Korrespondenzbeziehungen",
		requirementText:
			"Vor Aufnahme einer grenzüberschreitenden Korrespondenzbeziehung mit einem Nicht-EU-Kryptowerte-Dienstleister werden dessen Zulassung, Aufsicht, AML-Programm und Reputation geprüft, Verantwortlichkeiten dokumentiert und die Zustimmung der Leitung eingeholt.",
		domain: "aml",
		appliesToRoles: [...OBL],
		effectiveFrom: FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Due-Diligence-Akten Partner-VASPs"],
		relatedRequirements: ["gwg:§15", "tfr:Art.19-21"],
		sortOrder: 200,
	},
	{
		code: "Art.40",
		sectionCode: "KRY",
		title: "Risikominderung bei Transfers mit selbst gehosteten Adressen",
		requirementText:
			"Für Transfers von oder an selbst gehostete Adressen ergreifen Kryptowerte-Dienstleister risikobasierte Minderungsmaßnahmen — u. a. Identifizierung und Überprüfung des Eigentums oder der Kontrolle der Adresse durch den Kunden, zusätzliche Informationen zur Herkunft, verstärkte Überwachung.",
		domain: "aml",
		appliesToRoles: [...OBL],
		effectiveFrom: FROM,
		legalStatus: "upcoming",
		evidenceHints: ["Self-hosted-Wallet-Richtlinie", "Ownership-Nachweise"],
		relatedRequirements: ["tfr:Art.14(5)"],
		sortOrder: 210,
	},
];
