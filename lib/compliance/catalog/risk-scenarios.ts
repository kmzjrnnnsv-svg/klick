import type { LicenceStage } from "@/db/schema/enums";
import type { RISK_CATEGORIES } from "@/db/schema/grc";
import { stageAtLeast } from "./required-functions";

// Risikoszenarien für den Risiko-Assistenten (/risiken/neu): Startpunkte je
// Rahmenwerk mit typischer Auswirkung, Schutzzielen, typisch betroffenen
// Schadensarten und mildernden Controls. Gefiltert nach aktiven
// Rahmenwerken (eines genügt) und Lizenzstufe. Inhalte nach Modellwissen
// und gängigen Gefährdungskatalogen (BSI-Grundschutz, ISO 27005, MaRisk
// AT 2.2, EBA-Leitlinien) — fachlich prüfen, bevor sie als vollständig
// gelten.

export type RiskCategory = (typeof RISK_CATEGORIES)[number];
export type ProtectionGoal =
	| "confidentiality"
	| "integrity"
	| "availability"
	| "authenticity";

export const PROTECTION_GOALS: readonly ProtectionGoal[] = [
	"confidentiality",
	"integrity",
	"availability",
	"authenticity",
];

export type ScenarioGroup =
	| "infosec"
	| "resilience"
	| "thirdparty"
	| "finance"
	| "payments"
	| "crypto"
	| "conduct"
	| "aml"
	| "privacy"
	| "product";

export const SCENARIO_GROUPS: readonly { key: ScenarioGroup; label: string }[] =
	[
		{ key: "infosec", label: "Informationssicherheit" },
		{ key: "resilience", label: "Betrieb und Ausfall" },
		{ key: "thirdparty", label: "Dienstleister und Lieferkette" },
		{ key: "finance", label: "Finanzen und Risikoinventur" },
		{ key: "payments", label: "Zahlungsverkehr und Kundengelder" },
		{ key: "crypto", label: "Kryptowerte und Verwahrung" },
		{ key: "conduct", label: "Kundenschutz und Marktverhalten" },
		{ key: "aml", label: "Geldwäsche, Sanktionen, Travel Rule" },
		{ key: "privacy", label: "Datenschutz" },
		{ key: "product", label: "Produkte mit digitalen Elementen" },
	];

export type RiskScenario = {
	code: string;
	group: ScenarioGroup;
	title: string;
	// typische konkrete Auswirkung (Vorschlag für „Was würde passieren?“)
	impactHint: string;
	category: RiskCategory;
	frameworks: readonly string[];
	appliesFromStage?: LicenceStage;
	protectionGoals: readonly ProtectionGoal[];
	// typisch betroffene Schadensarten (Schlüssel aus der Risikomethodik)
	dimensions: readonly string[];
	controls: readonly string[];
};

const ISMS = ["iso27001", "nis2", "dora"] as const;
const AML = ["gwg", "amlr"] as const;

export const RISK_SCENARIOS: readonly RiskScenario[] = [
	// ── Informationssicherheit ────────────────────────────────────────
	{
		code: "RS-ISM-01",
		group: "infosec",
		title: "Ransomware verschlüsselt Systeme und Daten",
		impactHint:
			"Zentrale Systeme und Dateiablagen sind verschlüsselt, Betrieb steht, Daten werden zusätzlich veröffentlicht oder erpresst.",
		category: "ict_cyber",
		frameworks: ISMS,
		protectionGoals: ["availability", "confidentiality", "integrity"],
		dimensions: ["outage", "data", "financial", "customers"],
		controls: ["CC-OPS-02", "CC-BCM-03", "CC-OPS-03", "CC-LOG-02", "CC-INC-04"],
	},
	{
		code: "RS-ISM-02",
		group: "infosec",
		title: "Phishing führt zur Übernahme eines Kontos",
		impactHint:
			"Angreifer meldet sich mit gestohlenen Zugangsdaten an, liest Postfächer, löst Zahlungen aus oder verschafft sich weitere Rechte.",
		category: "ict_cyber",
		frameworks: ISMS,
		protectionGoals: ["confidentiality", "authenticity", "integrity"],
		dimensions: ["data", "financial", "image"],
		controls: ["CC-IAM-03", "CC-HR-03", "CC-LOG-02", "CC-NET-03"],
	},
	{
		code: "RS-ISM-03",
		group: "infosec",
		title: "Missbrauch privilegierter Zugänge durch Innentäter:innen",
		impactHint:
			"Eine berechtigte Person kopiert, verändert oder löscht Daten oder Konfigurationen außerhalb ihres Auftrags.",
		category: "ict_cyber",
		frameworks: ISMS,
		protectionGoals: ["confidentiality", "integrity"],
		dimensions: ["data", "legal", "image"],
		controls: ["CC-IAM-04", "CC-IAM-05", "CC-GOV-11", "CC-LOG-01", "CC-HR-01"],
	},
	{
		code: "RS-ISM-04",
		group: "infosec",
		title: "Abfluss vertraulicher Daten (E-Mail, Cloud-Freigabe, USB)",
		impactHint:
			"Vertrauliche Unterlagen oder Kundendaten gelangen an Unbefugte, versehentlich oder absichtlich.",
		category: "ict_cyber",
		frameworks: ISMS,
		protectionGoals: ["confidentiality"],
		dimensions: ["data", "legal", "image", "persons"],
		controls: ["CC-AST-09", "CC-AST-02", "CC-AST-07", "CC-CRY-01"],
	},
	{
		code: "RS-ISM-05",
		group: "infosec",
		title: "Bekannte Schwachstelle wird ausgenutzt, bevor sie gepatcht ist",
		impactHint:
			"Eine öffentlich bekannte Lücke in einem erreichbaren System wird ausgenutzt; Angreifer erhält Zugriff oder legt den Dienst lahm.",
		category: "ict_cyber",
		frameworks: ISMS,
		protectionGoals: ["confidentiality", "integrity", "availability"],
		dimensions: ["outage", "data", "customers"],
		controls: ["CC-OPS-03", "CC-DEV-04", "CC-RSK-05", "CC-NET-02"],
	},
	{
		code: "RS-ISM-06",
		group: "infosec",
		title: "Fehlkonfiguration macht Daten oder Systeme öffentlich",
		impactHint:
			"Ein Speicher, eine Datenbank oder eine Verwaltungsoberfläche ist ohne Schutz aus dem Internet erreichbar.",
		category: "ict_cyber",
		frameworks: ISMS,
		protectionGoals: ["confidentiality", "integrity"],
		dimensions: ["data", "legal", "image"],
		controls: ["CC-OPS-04", "CC-DEV-06", "CC-NET-01", "CC-TST-01"],
	},
	{
		code: "RS-ISM-07",
		group: "infosec",
		title: "Überlastungsangriff (DDoS) auf Kundenkanäle",
		impactHint:
			"Website, App oder Schnittstellen sind stunden- oder tagelang nicht erreichbar.",
		category: "ict_cyber",
		frameworks: ISMS,
		protectionGoals: ["availability"],
		dimensions: ["outage", "customers", "image"],
		controls: ["CC-NET-02", "CC-OPS-05", "CC-BCM-04", "CC-INC-04"],
	},
	{
		code: "RS-ISM-08",
		group: "infosec",
		title: "Diebstahl oder Verlust eines Endgeräts",
		impactHint:
			"Ein Laptop oder Smartphone mit Zugängen und lokalen Daten geht verloren.",
		category: "ict_cyber",
		frameworks: ISMS,
		protectionGoals: ["confidentiality"],
		dimensions: ["data", "persons"],
		controls: ["CC-PHY-04", "CC-OPS-01", "CC-CRY-01", "CC-IAM-03"],
	},
	{
		code: "RS-ISM-09",
		group: "infosec",
		title: "Manipulierte Software-Abhängigkeit (Lieferkettenangriff)",
		impactHint:
			"Eine Bibliothek oder ein Build-Werkzeug enthält Schadcode, der mit dem nächsten Release ausgeliefert wird.",
		category: "ict_cyber",
		frameworks: [...ISMS, "cra"],
		protectionGoals: ["integrity", "confidentiality"],
		dimensions: ["data", "customers", "image"],
		controls: ["CC-DEV-05", "CC-DEV-03", "CC-DEV-01", "CC-PRD-03"],
	},
	{
		code: "RS-ISM-10",
		group: "infosec",
		title: "Angriff bleibt unbemerkt (fehlende Protokollierung)",
		impactHint:
			"Ein Einbruch wird erst nach Wochen entdeckt; Umfang und Ursache lassen sich nicht mehr klären, Meldefristen sind verpasst.",
		category: "ict_cyber",
		frameworks: ISMS,
		protectionGoals: ["integrity", "confidentiality"],
		dimensions: ["data", "legal", "supervisory"],
		controls: ["CC-LOG-01", "CC-LOG-02", "CC-LOG-03", "CC-INC-02"],
	},
	{
		code: "RS-ISM-11",
		group: "infosec",
		title: "Social Engineering: gefälschte Zahlungsanweisung (CEO-Fraud)",
		impactHint:
			"Mitarbeitende überweisen auf Anweisung einer vermeintlichen Führungskraft oder eines Lieferanten an Betrüger.",
		category: "aml_fraud",
		frameworks: [...ISMS, "zag", "micar"],
		protectionGoals: ["authenticity", "integrity"],
		dimensions: ["financial", "image"],
		controls: ["CC-HR-03", "CC-GOV-11", "CC-FRD-01"],
	},

	// ── Betrieb und Ausfall ───────────────────────────────────────────
	{
		code: "RS-BCM-01",
		group: "resilience",
		title: "Ausfall von Rechenzentrum oder Cloud-Region",
		impactHint:
			"Produktivsysteme sind nicht erreichbar, bis auf einen anderen Standort umgeschaltet ist.",
		category: "operational",
		frameworks: ISMS,
		protectionGoals: ["availability"],
		dimensions: ["outage", "customers", "financial"],
		controls: ["CC-BCM-04", "CC-BCM-01", "CC-BCM-05", "CC-TPR-06"],
	},
	{
		code: "RS-BCM-02",
		group: "resilience",
		title: "Datensicherung lässt sich nicht wiederherstellen",
		impactHint:
			"Nach einem Fehler oder Angriff fehlen Daten dauerhaft, weil Sicherungen unvollständig oder nicht getestet sind.",
		category: "operational",
		frameworks: ISMS,
		protectionGoals: ["availability", "integrity"],
		dimensions: ["outage", "data", "legal"],
		controls: ["CC-BCM-03", "CC-BCM-05"],
	},
	{
		code: "RS-BCM-03",
		group: "resilience",
		title: "Wiederanlauf dauert länger als die Zielzeit",
		impactHint:
			"Eine kritische Funktion bleibt länger aus als in der Business-Impact-Analyse erlaubt (RTO/RPO überschritten).",
		category: "operational",
		frameworks: ["dora", "nis2", "iso27001", "zag-marisk", "kwg"],
		protectionGoals: ["availability"],
		dimensions: ["outage", "customers", "supervisory"],
		controls: ["CC-BCM-02", "CC-BCM-01", "CC-BCM-05", "CC-AST-04"],
	},
	{
		code: "RS-BCM-04",
		group: "resilience",
		title: "Strom-, Netz- oder Kommunikationsausfall",
		impactHint:
			"Standort oder Anbindung fällt aus; Mitarbeitende und Systeme können nicht arbeiten.",
		category: "operational",
		frameworks: ["nis2", "iso27001", "dora"],
		protectionGoals: ["availability"],
		dimensions: ["outage", "customers"],
		controls: ["CC-PHY-02", "CC-BCM-04", "CC-IAM-07"],
	},
	{
		code: "RS-BCM-05",
		group: "resilience",
		title: "Naturereignis oder Brand am Standort",
		impactHint:
			"Hochwasser, Sturm oder Brand macht Büro oder Technik unbenutzbar.",
		category: "operational",
		frameworks: ["nis2", "iso27001"],
		protectionGoals: ["availability"],
		dimensions: ["outage", "financial"],
		controls: ["CC-PHY-02", "CC-PHY-01", "CC-BCM-01"],
	},
	{
		code: "RS-BCM-06",
		group: "resilience",
		title: "Ausfall einer Schlüsselperson",
		impactHint:
			"Wissen und Berechtigungen liegen bei einer Person; bei Krankheit oder Kündigung stehen Prozesse still.",
		category: "operational",
		frameworks: [...ISMS, "zag-marisk", "kwg", "micar"],
		protectionGoals: ["availability"],
		dimensions: ["outage", "supervisory"],
		controls: ["CC-GOV-02", "CC-OPS-08", "CC-BCM-01"],
	},
	{
		code: "RS-BCM-07",
		group: "resilience",
		title: "Fehlerhafte Änderung legt Kernsystem lahm",
		impactHint:
			"Ein Release oder eine Konfigurationsänderung führt zu Ausfall oder falschen Buchungen; Rückweg fehlt.",
		category: "ict_cyber",
		frameworks: ["dora", "iso27001", "zag-marisk", "kwg"],
		protectionGoals: ["availability", "integrity"],
		dimensions: ["outage", "customers", "financial"],
		controls: ["CC-DEV-06", "CC-DEV-07", "CC-DEV-04"],
	},
	{
		code: "RS-BCM-08",
		group: "resilience",
		title: "Ausfall wirkt auf Dienstempfänger und Allgemeinheit",
		impactHint:
			"Kunden oder nachgelagerte Einrichtungen können ihren eigenen Dienst nicht erbringen (Kaskadeneffekt).",
		category: "operational",
		frameworks: ["nis2", "dora"],
		protectionGoals: ["availability"],
		dimensions: ["customers", "supervisory", "image"],
		controls: ["CC-BCM-02", "CC-INC-03", "CC-GOV-09"],
	},

	// ── Dienstleister und Lieferkette ─────────────────────────────────
	{
		code: "RS-TPR-01",
		group: "thirdparty",
		title: "Ausfall eines kritischen IKT-Dienstleisters",
		impactHint:
			"Der Anbieter eines kritischen Dienstes (Cloud, Kernbank, Wallet, KYC) fällt aus oder stellt den Dienst ein.",
		category: "third_party",
		frameworks: [...ISMS, "micar", "zag", "kwg"],
		protectionGoals: ["availability"],
		dimensions: ["outage", "customers", "supervisory"],
		controls: ["CC-TPR-05", "CC-TPR-06", "CC-BCM-01", "CC-TPR-03"],
	},
	{
		code: "RS-TPR-02",
		group: "thirdparty",
		title: "Konzentration auf einen Anbieter",
		impactHint:
			"Mehrere kritische Funktionen hängen am selben Anbieter oder Rechenzentrum; ein Ausfall trifft alles gleichzeitig.",
		category: "third_party",
		frameworks: ["dora", "zag-marisk", "kwg", "micar"],
		protectionGoals: ["availability"],
		dimensions: ["outage", "customers", "supervisory"],
		controls: ["CC-TPR-07", "CC-AST-04", "CC-TPR-06"],
	},
	{
		code: "RS-TPR-03",
		group: "thirdparty",
		title: "Sicherheitsvorfall beim Dienstleister",
		impactHint:
			"Beim Dienstleister werden Daten oder Zugänge kompromittiert, die auch uns betreffen; Meldung kommt spät oder gar nicht.",
		category: "third_party",
		frameworks: ISMS,
		protectionGoals: ["confidentiality", "integrity"],
		dimensions: ["data", "legal", "supervisory", "persons"],
		controls: ["CC-TPR-04", "CC-TPR-05", "CC-INC-03", "CC-PRV-04"],
	},
	{
		code: "RS-TPR-04",
		group: "thirdparty",
		title: "Ausstieg aus einem Vertrag nicht durchführbar",
		impactHint:
			"Bei Kündigung, Insolvenz oder Anordnung der Aufsicht lassen sich Daten und Dienst nicht rechtzeitig übertragen.",
		category: "third_party",
		frameworks: ["dora", "zag-marisk", "kwg", "micar"],
		protectionGoals: ["availability"],
		dimensions: ["outage", "supervisory", "financial"],
		controls: ["CC-TPR-06", "CC-TPR-04"],
	},
	{
		code: "RS-TPR-05",
		group: "thirdparty",
		title: "Wesentliche Auslagerung ohne Steuerung und Prüfrechte",
		impactHint:
			"Eine ausgelagerte Funktion ist vertraglich nicht steuerbar; Weisungs-, Prüf- und Kündigungsrechte fehlen, Anzeige an die Aufsicht fehlt.",
		category: "third_party",
		frameworks: ["zag", "zag-marisk", "kwg", "micar"],
		appliesFromStage: "2_casp_zag",
		protectionGoals: ["integrity", "availability"],
		dimensions: ["supervisory", "legal"],
		controls: ["CC-TPR-10", "CC-TPR-04", "CC-TPR-09"],
	},
	{
		code: "RS-TPR-06",
		group: "thirdparty",
		title: "Unbekannte Unterauftragnehmer in der Kette",
		impactHint:
			"Der Dienstleister gibt Leistungen weiter; Standort, Sicherheit und Datenzugriff der Subunternehmer sind unbekannt.",
		category: "third_party",
		frameworks: ["dora", "nis2", "dsgvo"],
		protectionGoals: ["confidentiality", "availability"],
		dimensions: ["data", "supervisory", "persons"],
		controls: ["CC-TPR-07", "CC-PRV-04", "CC-TPR-04"],
	},

	// ── Finanzen und Risikoinventur (MaRisk AT 2.2) ───────────────────
	{
		code: "RS-FIN-01",
		group: "finance",
		title: "Operationelles Risiko: Prozessfehler mit Schaden",
		impactHint:
			"Manuelle Fehler, fehlende Kontrollen oder unklare Zuständigkeiten führen zu Fehlbuchungen, Erstattungen oder Bußgeldern.",
		category: "operational",
		frameworks: ["zag-marisk", "kwg", "micar"],
		appliesFromStage: "2_casp_zag",
		protectionGoals: ["integrity"],
		dimensions: ["financial", "customers", "supervisory"],
		controls: ["CC-RSK-07", "CC-OPS-08", "CC-GOV-11"],
	},
	{
		code: "RS-FIN-02",
		group: "finance",
		title: "Liquiditätsengpass",
		impactHint:
			"Zahlungsverpflichtungen (Auszahlungen, Rücktausch, Lieferanten) können nicht fristgerecht bedient werden.",
		category: "market_liquidity",
		frameworks: ["zag-marisk", "kwg", "micar"],
		appliesFromStage: "2_casp_zag",
		protectionGoals: ["availability"],
		dimensions: ["financial", "clientAssets", "supervisory"],
		controls: ["CC-RSK-06", "CC-CAP-01"],
	},
	{
		code: "RS-FIN-03",
		group: "finance",
		title: "Eigenmittel unterschreiten die Mindestanforderung",
		impactHint:
			"Verluste oder Wachstum drücken die Eigenmittel unter die Anforderung; Meldung und Maßnahmen der Aufsicht folgen.",
		category: "financial",
		frameworks: ["micar", "zag", "kwg"],
		appliesFromStage: "2_casp_zag",
		protectionGoals: ["integrity"],
		dimensions: ["supervisory", "financial"],
		controls: ["CC-CAP-01", "CC-RSK-06", "CC-REG-01"],
	},
	{
		code: "RS-FIN-04",
		group: "finance",
		title: "Adressenausfall eines Kunden oder Partners",
		impactHint:
			"Ein Kreditnehmer, Kontrahent oder eine Partnerbank fällt aus; Forderungen müssen abgeschrieben werden.",
		category: "financial",
		frameworks: ["kwg", "zag-marisk"],
		appliesFromStage: "3_emi",
		protectionGoals: ["integrity"],
		dimensions: ["financial", "clientAssets"],
		controls: ["CC-RSK-06"],
	},
	{
		code: "RS-FIN-05",
		group: "finance",
		title: "Marktpreisrisiko aus eigenen Positionen",
		impactHint:
			"Kursverluste bei eigenen Beständen (Kryptowerte, Devisen, Wertpapiere) belasten das Ergebnis.",
		category: "market_liquidity",
		frameworks: ["kwg", "micar"],
		appliesFromStage: "2_casp_zag",
		protectionGoals: ["integrity"],
		dimensions: ["financial"],
		controls: ["CC-RSK-06"],
	},
	{
		code: "RS-FIN-06",
		group: "finance",
		title: "Geschäftsmodell trägt nicht (strategisches Risiko)",
		impactHint:
			"Erträge bleiben hinter dem Plan; Kosten der Regulierung übersteigen die Einnahmen.",
		category: "strategic",
		frameworks: ["zag-marisk", "kwg", "micar"],
		appliesFromStage: "2_casp_zag",
		protectionGoals: ["availability"],
		dimensions: ["financial", "supervisory"],
		controls: ["CC-GOV-23", "CC-RSK-06"],
	},
	{
		code: "RS-FIN-07",
		group: "finance",
		title: "Reputationsschaden mit Abfluss von Kunden",
		impactHint:
			"Negative Berichte oder Vorfälle führen zu Kündigungen, Abflüssen und Problemen mit Bank- oder Vertriebspartnern.",
		category: "strategic",
		frameworks: ["zag-marisk", "kwg", "micar"],
		appliesFromStage: "2_casp_zag",
		protectionGoals: ["integrity"],
		dimensions: ["image", "financial", "customers"],
		controls: ["CC-INC-04", "CC-CND-05"],
	},
	{
		code: "RS-FIN-08",
		group: "finance",
		title: "Modellrisiko: falsche Berechnung oder Bewertung",
		impactHint:
			"Ein Rechenmodell (Eigenmittel, Risikoscoring, Preise) liefert falsche Ergebnisse; Entscheidungen beruhen darauf.",
		category: "operational",
		frameworks: ["kwg", "zag-marisk"],
		appliesFromStage: "3_emi",
		protectionGoals: ["integrity"],
		dimensions: ["financial", "supervisory"],
		controls: ["CC-RSK-06", "CC-GOV-13"],
	},
	{
		code: "RS-FIN-09",
		group: "finance",
		title: "Neues Produkt ohne Risikoprüfung eingeführt",
		impactHint:
			"Ein neues Produkt, ein neuer Markt oder Kryptowert startet ohne Neue-Produkte-Prozess; Risiken und Pflichten sind ungeklärt.",
		category: "compliance_legal",
		frameworks: ["zag-marisk", "kwg", "micar"],
		appliesFromStage: "2_casp_zag",
		protectionGoals: ["integrity"],
		dimensions: ["supervisory", "legal", "financial"],
		controls: ["CC-GOV-24", "CC-GOV-10"],
	},

	// ── Zahlungsverkehr und Kundengelder (ZAG) ────────────────────────
	{
		code: "RS-PAY-01",
		group: "payments",
		title: "Insolvenz der Bank mit dem Treuhandkonto",
		impactHint:
			"Die Bank, bei der Kundengelder gesichert sind, fällt aus; Kundengelder sind gebunden oder gefährdet.",
		category: "third_party",
		frameworks: ["zag", "micar"],
		appliesFromStage: "2_casp_zag",
		protectionGoals: ["availability"],
		dimensions: ["clientAssets", "customers", "supervisory"],
		controls: ["CC-CUS-01", "CC-CUS-03", "CC-TPR-07"],
	},
	{
		code: "RS-PAY-02",
		group: "payments",
		title: "Zahlungsbetrug über Kundenkonten",
		impactHint:
			"Betrüger lösen über übernommene Kundenkonten Zahlungen aus; Erstattungspflicht und Betrugsquote steigen.",
		category: "aml_fraud",
		frameworks: ["zag", "micar"],
		protectionGoals: ["authenticity", "integrity"],
		dimensions: ["financial", "customers", "supervisory"],
		controls: ["CC-FRD-01", "CC-FRD-02", "CC-AML-06"],
	},
	{
		code: "RS-PAY-03",
		group: "payments",
		title: "Ausfall des Zahlungsdienstes",
		impactHint:
			"Überweisungen, Echtzeitzahlungen oder Kartenzahlungen sind nicht möglich; Kunden können nicht zahlen.",
		category: "operational",
		frameworks: ["zag", "dora"],
		protectionGoals: ["availability"],
		dimensions: ["outage", "customers", "supervisory"],
		controls: ["CC-PAY-01", "CC-PAY-03", "CC-BCM-04"],
	},
	{
		code: "RS-PAY-04",
		group: "payments",
		title: "Agent oder Vertriebspartner hält Pflichten nicht ein",
		impactHint:
			"Ein Agent verletzt Sorgfalts- oder Informationspflichten; das Institut haftet gegenüber Kunden und Aufsicht.",
		category: "third_party",
		frameworks: ["zag", "micar"],
		appliesFromStage: "1_agent",
		protectionGoals: ["integrity"],
		dimensions: ["supervisory", "legal", "image"],
		controls: ["CC-PAY-01", "CC-AML-10", "CC-TPR-05"],
	},
	{
		code: "RS-PAY-05",
		group: "payments",
		title: "Kundengelder nicht täglich abgestimmt",
		impactHint:
			"Differenzen zwischen Kundenguthaben und gesicherten Geldern bleiben unentdeckt.",
		category: "operational",
		frameworks: ["zag", "micar"],
		appliesFromStage: "2_casp_zag",
		protectionGoals: ["integrity"],
		dimensions: ["clientAssets", "supervisory"],
		controls: ["CC-CUS-03", "CC-CUS-01"],
	},

	// ── Kryptowerte und Verwahrung (MiCAR) ────────────────────────────
	{
		code: "RS-CRY-01",
		group: "crypto",
		title: "Verlust privater Schlüssel",
		impactHint:
			"Schlüssel oder Seed-Material gehen verloren oder werden zerstört; Kundenkryptowerte sind nicht mehr zugänglich.",
		category: "custody_keys",
		frameworks: ["micar"],
		protectionGoals: ["availability"],
		dimensions: ["clientAssets", "financial", "supervisory"],
		controls: ["CC-KEY-01", "CC-CRY-03", "CC-BCM-03"],
	},
	{
		code: "RS-CRY-02",
		group: "crypto",
		title: "Kompromittierung der Hot Wallet",
		impactHint:
			"Angreifer erlangt Signaturrechte über die Hot Wallet und transferiert Kryptowerte ab.",
		category: "custody_keys",
		frameworks: ["micar"],
		protectionGoals: ["confidentiality", "integrity"],
		dimensions: ["clientAssets", "financial", "image", "supervisory"],
		controls: ["CC-KEY-01", "CC-IAM-04", "CC-LOG-02", "CC-CUS-01"],
	},
	{
		code: "RS-CRY-03",
		group: "crypto",
		title: "Fehler oder Angriff in einem Smart Contract",
		impactHint:
			"Ein genutzter Smart Contract (eigener oder fremder) hat eine Lücke; Werte werden blockiert oder abgezogen.",
		category: "custody_keys",
		frameworks: ["micar"],
		protectionGoals: ["integrity"],
		dimensions: ["clientAssets", "financial", "image"],
		controls: ["CC-DEV-04", "CC-DEV-02", "CC-GOV-24"],
	},
	{
		code: "RS-CRY-04",
		group: "crypto",
		title: "Fork, Reorganisation oder Ausfall einer Blockchain",
		impactHint:
			"Transaktionen werden rückgängig gemacht oder doppelt verbucht; ein Netzwerk steht still.",
		category: "operational",
		frameworks: ["micar"],
		protectionGoals: ["integrity", "availability"],
		dimensions: ["clientAssets", "customers", "outage"],
		controls: ["CC-CUS-03", "CC-OPS-08", "CC-INC-04"],
	},
	{
		code: "RS-CRY-05",
		group: "crypto",
		title: "Stablecoin verliert die Bindung (Depeg)",
		impactHint:
			"Ein genutzter oder emittierter Stablecoin weicht deutlich vom Referenzwert ab; Rücktauschwelle droht.",
		category: "market_liquidity",
		frameworks: ["micar"],
		protectionGoals: ["integrity"],
		dimensions: ["clientAssets", "financial", "image"],
		controls: ["CC-RSK-06", "CC-CAP-01"],
	},
	{
		code: "RS-CRY-06",
		group: "crypto",
		title: "Rücktauschforderungen übersteigen die verfügbare Liquidität",
		impactHint:
			"Viele Kunden wollen gleichzeitig auszahlen oder zurücktauschen; Reserven sind nicht schnell genug liquide.",
		category: "market_liquidity",
		frameworks: ["micar"],
		appliesFromStage: "2_casp_zag",
		protectionGoals: ["availability"],
		dimensions: ["clientAssets", "customers", "supervisory"],
		controls: ["CC-RSK-06", "CC-CUS-01"],
	},
	{
		code: "RS-CRY-07",
		group: "crypto",
		title: "Kundenkryptowerte nicht getrennt vom eigenen Bestand",
		impactHint:
			"Eigene und Kundenbestände sind vermischt; bei Insolvenz sind Kundenwerte nicht eindeutig zuordenbar.",
		category: "custody_keys",
		frameworks: ["micar"],
		protectionGoals: ["integrity"],
		dimensions: ["clientAssets", "supervisory", "legal"],
		controls: ["CC-CUS-01", "CC-CUS-02", "CC-CUS-03"],
	},
	{
		code: "RS-CRY-08",
		group: "crypto",
		title: "Angriff über Bridge, Oracle oder Drittprotokoll",
		impactHint:
			"Ein angebundenes Protokoll wird manipuliert (Preis-Oracle, Cross-Chain-Bridge); Bestände oder Preise sind falsch.",
		category: "ict_cyber",
		frameworks: ["micar"],
		protectionGoals: ["integrity"],
		dimensions: ["clientAssets", "financial"],
		controls: ["CC-TPR-03", "CC-RSK-05", "CC-GOV-24"],
	},
	{
		code: "RS-CRY-09",
		group: "crypto",
		title: "Ausfall des Liquiditäts- oder Börsenpartners",
		impactHint:
			"Der Handelspartner für Ausführung oder Liquidität fällt aus; Kundenaufträge können nicht ausgeführt werden.",
		category: "third_party",
		frameworks: ["micar"],
		protectionGoals: ["availability"],
		dimensions: ["customers", "clientAssets", "outage"],
		controls: ["CC-TPR-06", "CC-TPR-07", "CC-CND-03"],
	},

	// ── Kundenschutz und Marktverhalten ───────────────────────────────
	{
		code: "RS-CND-01",
		group: "conduct",
		title: "Marktmissbrauch über die eigene Plattform",
		impactHint:
			"Insiderhandel oder Marktmanipulation läuft über die Plattform und wird nicht erkannt oder nicht gemeldet.",
		category: "compliance_legal",
		frameworks: ["micar"],
		protectionGoals: ["integrity"],
		dimensions: ["supervisory", "image", "legal"],
		controls: ["CC-CND-04", "CC-LOG-02"],
	},
	{
		code: "RS-CND-02",
		group: "conduct",
		title: "Unerkannter Interessenkonflikt",
		impactHint:
			"Eigenhandel, Vergütung oder Beteiligungen beeinflussen Entscheidungen zulasten der Kunden.",
		category: "compliance_legal",
		frameworks: ["micar", "zag-marisk", "kwg"],
		protectionGoals: ["integrity"],
		dimensions: ["supervisory", "image", "customers"],
		controls: ["CC-CND-06", "CC-GOV-11"],
	},
	{
		code: "RS-CND-03",
		group: "conduct",
		title: "Irreführende Werbung oder unvollständige Kundeninformation",
		impactHint:
			"Werbung verspricht mehr als das Produkt hält oder Risikohinweise fehlen; Beschwerden und Maßnahmen der Aufsicht folgen.",
		category: "compliance_legal",
		frameworks: ["micar", "zag"],
		protectionGoals: ["integrity"],
		dimensions: ["supervisory", "image", "legal"],
		controls: ["CC-CND-01", "CC-CND-03"],
	},
	{
		code: "RS-CND-04",
		group: "conduct",
		title: "Beschwerden werden nicht fristgerecht bearbeitet",
		impactHint:
			"Kundenbeschwerden bleiben liegen; Fristen der Aufsicht werden verletzt, Probleme bleiben unentdeckt.",
		category: "compliance_legal",
		frameworks: ["micar", "zag"],
		protectionGoals: ["integrity"],
		dimensions: ["customers", "supervisory"],
		controls: ["CC-CND-05"],
	},
	{
		code: "RS-CND-05",
		group: "conduct",
		title: "Meldung an die Aufsicht verspätet oder falsch",
		impactHint:
			"Anzeigen, Meldungen oder Berichte gehen zu spät oder fehlerhaft an BaFin, Bundesbank oder FIU.",
		category: "compliance_legal",
		frameworks: ["micar", "zag", "kwg", "dora", "nis2"],
		protectionGoals: ["integrity"],
		dimensions: ["supervisory", "legal"],
		controls: ["CC-REG-01", "CC-INC-03", "CC-GOV-10"],
	},

	// ── Geldwäsche, Sanktionen, Travel Rule ───────────────────────────
	{
		code: "RS-AML-01",
		group: "aml",
		title: "Produkt wird zur Geldwäsche missbraucht",
		impactHint:
			"Kriminelle nutzen Konten, Wallets oder Zahlungen, um Herkunft von Geldern zu verschleiern.",
		category: "aml_fraud",
		frameworks: AML,
		protectionGoals: ["integrity"],
		dimensions: ["supervisory", "legal", "image"],
		controls: ["CC-AML-01", "CC-AML-04", "CC-AML-06"],
	},
	{
		code: "RS-AML-02",
		group: "aml",
		title: "Lücke im Sanktions- oder PEP-Screening",
		impactHint:
			"Eine gelistete Person oder ein sanktioniertes Unternehmen wird nicht erkannt und bedient.",
		category: "compliance_legal",
		frameworks: ["sanctions", ...AML],
		protectionGoals: ["integrity"],
		dimensions: ["supervisory", "legal", "image"],
		controls: ["CC-SAN-01", "CC-SAN-02"],
	},
	{
		code: "RS-AML-03",
		group: "aml",
		title: "Travel-Rule-Daten fehlen oder sind falsch",
		impactHint:
			"Bei Kryptowertetransfers fehlen Angaben zu Auftraggeber oder Begünstigtem; Transfers müssten zurückgewiesen werden.",
		category: "compliance_legal",
		frameworks: ["tfr"],
		protectionGoals: ["integrity"],
		dimensions: ["supervisory", "legal"],
		controls: ["CC-TR-01", "CC-TR-03"],
	},
	{
		code: "RS-AML-04",
		group: "aml",
		title: "Transfers mit selbst gehosteten Wallets ohne Prüfung",
		impactHint:
			"Transfers von oder an nicht verwahrte Adressen laufen ohne Zuordnung zum Kunden und ohne Risikoprüfung.",
		category: "aml_fraud",
		frameworks: ["tfr", ...AML],
		protectionGoals: ["integrity"],
		dimensions: ["supervisory", "legal"],
		controls: ["CC-TR-02", "CC-AML-06"],
	},
	{
		code: "RS-AML-05",
		group: "aml",
		title: "Mixer, Privacy Coins oder Darknet-Bezug",
		impactHint:
			"Kryptowerte mit Bezug zu Mixern, Darknet-Märkten oder anonymisierenden Coins werden angenommen.",
		category: "aml_fraud",
		frameworks: ["micar", ...AML],
		protectionGoals: ["integrity"],
		dimensions: ["supervisory", "image"],
		controls: ["CC-AML-06", "CC-AML-01"],
	},
	{
		code: "RS-AML-06",
		group: "aml",
		title: "Verdachtsmeldung verspätet oder unterlassen",
		impactHint:
			"Ein Verdachtsfall wird nicht oder zu spät an die FIU gemeldet; Durchführungsverbot wird nicht beachtet.",
		category: "compliance_legal",
		frameworks: AML,
		protectionGoals: ["integrity"],
		dimensions: ["supervisory", "legal"],
		controls: ["CC-AML-07", "CC-AML-03"],
	},
	{
		code: "RS-AML-07",
		group: "aml",
		title: "Kundenidentifizierung umgangen",
		impactHint:
			"Gefälschte Dokumente, Deepfakes oder Strohleute bestehen das Onboarding.",
		category: "aml_fraud",
		frameworks: AML,
		protectionGoals: ["authenticity"],
		dimensions: ["supervisory", "legal", "financial"],
		controls: ["CC-AML-05", "CC-AML-04"],
	},
	{
		code: "RS-AML-08",
		group: "aml",
		title: "Geschäft mit Hochrisikoländern ohne verstärkte Sorgfalt",
		impactHint:
			"Kunden oder Transaktionen mit Bezug zu Hochrisikoländern werden wie normale Fälle behandelt.",
		category: "compliance_legal",
		frameworks: ["sanctions", ...AML],
		protectionGoals: ["integrity"],
		dimensions: ["supervisory", "legal"],
		controls: ["CC-SAN-02", "CC-AML-04"],
	},

	// ── Datenschutz ───────────────────────────────────────────────────
	{
		code: "RS-PRV-01",
		group: "privacy",
		title: "Datenpanne mit Meldepflicht",
		impactHint:
			"Personenbezogene Daten werden offengelegt, verändert oder gehen verloren; Meldung binnen 72 Stunden nötig.",
		category: "compliance_legal",
		frameworks: ["dsgvo"],
		protectionGoals: ["confidentiality", "integrity"],
		dimensions: ["persons", "legal", "image"],
		controls: ["CC-PRV-05", "CC-INC-03", "CC-CRY-02"],
	},
	{
		code: "RS-PRV-02",
		group: "privacy",
		title: "Betroffenenrechte nicht fristgerecht erfüllt",
		impactHint:
			"Auskunfts- oder Löschanfragen werden nicht innerhalb eines Monats beantwortet.",
		category: "compliance_legal",
		frameworks: ["dsgvo"],
		protectionGoals: ["integrity"],
		dimensions: ["persons", "legal"],
		controls: ["CC-PRV-02", "CC-AST-10"],
	},
	{
		code: "RS-PRV-03",
		group: "privacy",
		title: "Unzulässige Übermittlung in ein Drittland",
		impactHint:
			"Ein Dienstleister verarbeitet Daten außerhalb der EU ohne gültige Grundlage.",
		category: "compliance_legal",
		frameworks: ["dsgvo"],
		protectionGoals: ["confidentiality"],
		dimensions: ["persons", "legal"],
		controls: ["CC-PRV-04", "CC-TPR-04"],
	},
	{
		code: "RS-PRV-04",
		group: "privacy",
		title: "Verarbeitung ohne Rechtsgrundlage oder Folgenabschätzung",
		impactHint:
			"Eine neue Verarbeitung (Profiling, Monitoring) startet ohne Rechtsgrundlage oder ohne nötige Datenschutz-Folgenabschätzung.",
		category: "compliance_legal",
		frameworks: ["dsgvo"],
		protectionGoals: ["integrity"],
		dimensions: ["persons", "legal"],
		controls: ["CC-PRV-01", "CC-PRV-03", "CC-PRV-06"],
	},

	// ── Produkte (CRA) ────────────────────────────────────────────────
	{
		code: "RS-PRD-01",
		group: "product",
		title: "Aktiv ausgenutzte Schwachstelle im eigenen Produkt",
		impactHint:
			"Eine Lücke im ausgelieferten Produkt wird ausgenutzt; Meldung binnen 24 Stunden und Update für alle Kunden nötig.",
		category: "ict_cyber",
		frameworks: ["cra"],
		protectionGoals: ["integrity", "confidentiality", "availability"],
		dimensions: ["customers", "legal", "image"],
		controls: ["CC-PRD-02", "CC-PRD-05", "CC-INC-03"],
	},
	{
		code: "RS-PRD-02",
		group: "product",
		title: "Produkt ohne Konformitätsbewertung in Verkehr gebracht",
		impactHint:
			"Ein Produkt wird ohne Konformitätsbewertung, Dokumentation oder CE-Kennzeichnung verkauft.",
		category: "compliance_legal",
		frameworks: ["cra"],
		protectionGoals: ["integrity"],
		dimensions: ["legal", "financial"],
		controls: ["CC-PRD-08", "CC-PRD-07", "CC-PRD-01"],
	},
];

export const SCENARIO_BY_CODE = new Map(RISK_SCENARIOS.map((s) => [s.code, s]));

export function applicableScenarios(
	frameworks: readonly string[],
	stage: LicenceStage,
): RiskScenario[] {
	const set = new Set(frameworks);
	return RISK_SCENARIOS.filter(
		(s) =>
			s.frameworks.some((f) => set.has(f)) &&
			stageAtLeast(stage, s.appliesFromStage),
	);
}
