import type { RoleFunction } from "@/db/schema/enums";

// Interessierte Parteien (ISO 27001 4.2) und Kommunikationsmatrix
// (ISO 7.4, DORA Art. 14, NIS2 Art. 23, MiCAR Art. 71, GwG § 43) — Seed für
// die Betreiber-Org und CASP-Kunden. Kontakte sind Platzhalter; die Org
// trägt eigene Ansprechpartner ein.

export type CatalogParty = {
	key: string;
	name: string;
	type:
		| "regulator"
		| "customer"
		| "employee"
		| "supplier"
		| "shareholder"
		| "partner"
		| "public"
		| "community";
	expectations: string;
	requirements: string;
	relevantFrameworks: readonly string[];
	howAddressed: string;
	contact?: string;
	requires?: readonly string[];
};

export const INTERESTED_PARTIES: readonly CatalogParty[] = [
	{
		key: "bafin",
		name: "BaFin (Bundesanstalt für Finanzdienstleistungsaufsicht)",
		type: "regulator",
		expectations:
			"Zulassung und laufende Aufsicht: Governance, Eigenmittel, IKT-Risiko, Geldwäscheprävention, Meldungen in Frist.",
		requirements: "MiCAR, ZAG, ZAG-MaRisk, DORA, GwG, KWG",
		relevantFrameworks: ["micar", "zag", "zag-marisk", "dora", "gwg", "kwg"],
		howAddressed:
			"Antragsmappe, Pflichten-Kalender, Vorfallmeldungen über MVP-Portal, Jahresberichte.",
		contact: "MVP-Portal · poststelle@bafin.de",
		requires: ["micar", "zag", "zag-marisk", "gwg", "kwg", "dora"],
	},
	{
		key: "bundesbank",
		name: "Deutsche Bundesbank",
		type: "regulator",
		expectations: "Statistische Meldungen, Monatsausweise, AWV-Meldungen.",
		requirements: "§ 29 ZAG, AWV § 67, Zahlungsverkehrsstatistik",
		relevantFrameworks: ["zag", "awv"],
		howAddressed: "ExtraNet-Meldungen laut Pflichten-Kalender.",
		requires: ["zag", "awv"],
	},
	{
		key: "bsi",
		name: "BSI (Bundesamt für Sicherheit in der Informationstechnik)",
		type: "regulator",
		expectations: "Registrierung, Meldungen erheblicher Vorfälle, Nachweise.",
		requirements: "NIS2 / BSIG §§ 28, 30–33",
		relevantFrameworks: ["nis2"],
		howAddressed:
			"Betroffenheitsprüfung, Registrierung, Melde-Playbook 24 h/72 h.",
		requires: ["nis2"],
	},
	{
		key: "fiu",
		name: "FIU (Zentralstelle für Finanztransaktionsuntersuchungen)",
		type: "regulator",
		expectations:
			"Unverzügliche Verdachtsmeldungen über goAML, Auskunftsersuchen.",
		requirements: "§ 43 GwG, GwGMeldV",
		relevantFrameworks: ["gwg", "amlr"],
		howAddressed: "Prozess P-07, goAML-Zugang des GWB, Fristüberwachung § 46.",
		requires: ["gwg", "amlr"],
	},
	{
		key: "esas",
		name: "EBA / ESMA",
		type: "regulator",
		expectations:
			"Leitlinien und technische Standards; indirekte Erwartung über BaFin.",
		requirements: "DORA RTS/ITS, EBA-Leitlinien, MiCAR DelVOs",
		relevantFrameworks: ["dora", "micar", "zag"],
		howAddressed: "Rechtskataster (/rahmenwerke) und regulatorischer Kalender.",
		requires: ["dora", "micar", "zag"],
	},
	{
		key: "dsb",
		name: "Datenschutzaufsicht (Landesbeauftragte:r)",
		type: "regulator",
		expectations:
			"Rechtmäßige Verarbeitung, Meldungen von Datenpannen in 72 h, DSFA.",
		requirements: "DSGVO Art. 30, 32–35",
		relevantFrameworks: ["dsgvo"],
		howAddressed:
			"Verzeichnis der Verarbeitungstätigkeiten, DSB bestellt, Melde-Playbook.",
	},
	{
		key: "customers",
		name: "Kunden und Händler",
		type: "customer",
		expectations:
			"Verfügbarkeit, Sicherheit der Gelder und Daten, transparente Konditionen, schnelle Beschwerdebearbeitung.",
		requirements: "MiCAR Art. 66, 70, 71, 75, 82 · ZAG § 62 · DSGVO",
		relevantFrameworks: ["micar", "zag", "dsgvo", "iso27001"],
		howAddressed:
			"AGB/Preisveröffentlichung, Beschwerdeprozess, Störungsinformationen, Kontoauszüge.",
	},
	{
		key: "employees",
		name: "Mitarbeitende",
		type: "employee",
		expectations:
			"Klare Rollen, Schulung, sichere Arbeitsmittel, Hinweisgeberschutz.",
		requirements: "ISO 27001 A.6 · GwG § 6 · HinSchG · NIS2 Art. 20(2)",
		relevantFrameworks: ["iso27001", "gwg", "nis2"],
		howAddressed:
			"Schulungsplan, Kenntnisnahmen, Hinweisgeberkanal, Onboarding-/Offboarding-Pakete.",
	},
	{
		key: "ict-providers",
		name: "IKT-Dienstleister (Hosting, Custody-Technik, Analytics, KYC)",
		type: "supplier",
		expectations:
			"Klare Verträge, SLAs, Vorfall-Mitwirkung, Audit-Rechte, Exit-Unterstützung.",
		requirements: "DORA Art. 28–30 · ZAG-MaRisk AT 9 · MiCAR Art. 73",
		relevantFrameworks: ["dora", "zag-marisk", "micar"],
		howAddressed:
			"Dienstleister-Register, Art.-30-Klauseln, Due Diligence, Informationsregister.",
	},
	{
		key: "partner-bank",
		name: "Partnerbank (Treuhandkonto, Fiat-Anbindung)",
		type: "partner",
		expectations:
			"Nachweis der Compliance (DORA-Lieferantenpaket), saubere Mittelherkunft, Eskalationswege.",
		requirements: "DORA Art. 28–30 (als Dienstleister der Bank) · GwG § 10",
		relevantFrameworks: ["dora", "gwg", "zag"],
		howAddressed:
			"Lieferantenpaket, Eskalationskontakt im Krisenfall, regelmäßige Abstimmung.",
		requires: ["zag", "micar"],
	},
	{
		key: "shareholders",
		name: "Gesellschafter und Investoren",
		type: "shareholder",
		expectations:
			"Fortschritt zur Zulassung, Risikotransparenz, Kapitalbedarf, Inhaberkontrollverfahren.",
		requirements: "§ 2c KWG analog · MiCAR Art. 62/83 · ZAG § 14",
		relevantFrameworks: ["micar", "zag"],
		howAddressed:
			"Beschlussregister, Roadmap, Eigenmittelplanung, Gesellschafterregister.",
		requires: ["micar", "zag"],
	},
	{
		key: "public",
		name: "Öffentlichkeit und Presse",
		type: "public",
		expectations: "Verlässliche Information bei Störungen und Vorfällen.",
		requirements: "DORA Art. 14 · MiCAR Art. 66",
		relevantFrameworks: ["dora", "micar"],
		howAddressed: "Krisenkommunikationsplan, Sprecher:innen benannt.",
	},
	{
		key: "community",
		name: "Branchenverbände und Informationsaustausch (FS-ISAC, ACS, Verbände)",
		type: "community",
		expectations: "Austausch zu Bedrohungen und Best Practices.",
		requirements: "ISO 27001 A.5.6 · DORA Art. 45 · NIS2 Art. 29",
		relevantFrameworks: ["iso27001", "dora", "nis2"],
		howAddressed:
			"Mitgliedschaften dokumentieren, Threat-Intelligence-Feeds einbinden.",
	},
];

export type CatalogCommunication = {
	key: string;
	topic: string;
	partyKey?: string;
	audience: string;
	purpose: string;
	channel: string;
	frequency: string;
	trigger: "regular" | "incident" | "crisis" | "change";
	ownerFunction: RoleFunction;
	legalBasis: string;
	obligationCode?: string;
	contact?: string;
	requires?: readonly string[];
};

export const COMMUNICATIONS: readonly CatalogCommunication[] = [
	{
		key: "incident-bafin",
		topic: "Meldung schwerwiegender IKT-Vorfälle",
		partyKey: "bafin",
		audience: "BaFin (MVP-Portal, Fachverfahren DORA)",
		purpose:
			"Erstmeldung ≤ 4 h nach Einstufung / 24 h nach Kenntnis, Zwischen- und Abschlussbericht",
		channel: "MVP-Portal; Rückfall ikt-vorfall@bafin.de",
		frequency: "je Vorfall",
		trigger: "incident",
		ownerFunction: "incident_manager",
		legalBasis: "DORA Art. 19 · RTS 2025/301 · ITS 2025/302",
		contact: "ikt-vorfall@bafin.de",
		requires: ["dora"],
	},
	{
		key: "incident-bsi",
		topic: "Meldung erheblicher Sicherheitsvorfälle an das BSI",
		partyKey: "bsi",
		audience: "BSI-Meldeportal",
		purpose: "Frühwarnung 24 h, Meldung 72 h, Abschlussbericht 1 Monat",
		channel: "BSI-Meldeportal",
		frequency: "je Vorfall",
		trigger: "incident",
		ownerFunction: "incident_manager",
		legalBasis: "NIS2 Art. 23 · § 32 BSIG",
		requires: ["nis2"],
	},
	{
		key: "incident-dsb",
		topic: "Meldung von Verletzungen des Schutzes personenbezogener Daten",
		partyKey: "dsb",
		audience: "Datenschutzaufsicht, betroffene Personen",
		purpose: "Meldung ≤ 72 h; Information Betroffener bei hohem Risiko",
		channel: "Online-Meldeformular der Aufsicht",
		frequency: "je Vorfall",
		trigger: "incident",
		ownerFunction: "dpo",
		legalBasis: "DSGVO Art. 33, 34",
	},
	{
		key: "sar-fiu",
		topic: "Verdachtsmeldung an die FIU",
		partyKey: "fiu",
		audience: "FIU (goAML)",
		purpose: "Unverzügliche Meldung, Durchführungsverbot 3 Werktage",
		channel: "goAML",
		frequency: "je Fall",
		trigger: "incident",
		ownerFunction: "aml_officer",
		legalBasis: "§ 43, § 46 GwG",
		requires: ["gwg", "amlr"],
	},
	{
		key: "customer-outage",
		topic: "Störungsinformation an Kunden",
		partyKey: "customers",
		audience: "Händler und Endkunden",
		purpose:
			"Transparenz bei Nichtverfügbarkeit, Handlungsempfehlungen, Entwarnung",
		channel: "Statusseite, E-Mail, In-App",
		frequency: "je Störung",
		trigger: "incident",
		ownerFunction: "incident_manager",
		legalBasis: "DORA Art. 14(2) · MiCAR Art. 66",
	},
	{
		key: "crisis-press",
		topic: "Krisenkommunikation Presse und Öffentlichkeit",
		partyKey: "public",
		audience: "Presse, Öffentlichkeit, Social Media",
		purpose:
			"Abgestimmte Botschaften, benannte Sprecher:innen, Freigabe durch Krisenstab",
		channel: "Pressemitteilung, Website",
		frequency: "im Krisenfall",
		trigger: "crisis",
		ownerFunction: "crisis_team",
		legalBasis: "DORA Art. 14(1)",
	},
	{
		key: "crisis-bank",
		topic: "Eskalation an die Partnerbank",
		partyKey: "partner-bank",
		audience: "Partnerbank (Treuhandkonto)",
		purpose:
			"Verdacht auf Mittelabfluss, Kontosperre, Sicherheitsvorfall mit Zahlungsbezug",
		channel: "Hotline der Bank (Notfallkontakt), verschlüsselte E-Mail",
		frequency: "im Krisenfall",
		trigger: "crisis",
		ownerFunction: "crisis_team",
		legalBasis: "Vertrag Partnerbank · DORA Art. 30(3)",
		requires: ["zag", "micar"],
	},
	{
		key: "policy-change-staff",
		topic: "Richtlinienänderungen an Mitarbeitende",
		partyKey: "employees",
		audience: "alle Mitarbeitenden bzw. Verteilerkreis",
		purpose: "Veröffentlichung neuer Versionen, Kenntnisnahme einholen",
		channel: "Klick (Kenntnisnahme), Intranet",
		frequency: "je Veröffentlichung",
		trigger: "change",
		ownerFunction: "isb_ciso",
		legalBasis: "ISO 27001 7.3/7.4 · GwG § 6 Abs. 2 Nr. 6",
	},
	{
		key: "aml-report-mgmt",
		topic: "Jahresbericht der Geldwäschebeauftragten an die Leitung",
		audience: "Geschäftsleitung",
		purpose: "Lagebild, Statistik der Verdachtsmeldungen, Maßnahmen",
		channel: "Bericht, Sitzung der Geschäftsleitung",
		frequency: "jährlich",
		trigger: "regular",
		ownerFunction: "aml_officer",
		legalBasis: "§ 7 Abs. 5 GwG",
		obligationCode: "OBL-GWG-ANNUAL-REPORT",
		requires: ["gwg", "amlr"],
	},
	{
		key: "mgmt-review-results",
		topic: "Ergebnisse der Managementbewertung",
		audience: "Leitung, Funktionsträger:innen, Mitarbeitende (Auszug)",
		purpose: "Beschlüsse, Ziele, Ressourcen kommunizieren",
		channel: "Protokoll, Kurzbericht",
		frequency: "jährlich",
		trigger: "regular",
		ownerFunction: "isb_ciso",
		legalBasis: "ISO 27001 9.3",
		obligationCode: "OBL-ISMS-MGMT-REVIEW",
	},
	{
		key: "customer-terms",
		topic: "Änderungen von Preisen, AGB und Dienstbedingungen",
		partyKey: "customers",
		audience: "Kunden und Händler",
		purpose: "Vorab-Information mit Frist, Veröffentlichung auf der Website",
		channel: "E-Mail, Website",
		frequency: "je Änderung",
		trigger: "change",
		ownerFunction: "compliance",
		legalBasis: "MiCAR Art. 66, 77, 82 · ZAG § 54 BGB-analog",
		requires: ["micar", "zag"],
	},
	{
		key: "regulator-notice",
		topic: "Anzeigen wesentlicher Änderungen an die BaFin",
		partyKey: "bafin",
		audience: "BaFin",
		purpose:
			"Änderungen der Geschäftsleitung, Auslagerungen, Geschäftsmodell anzeigen",
		channel: "MVP-Portal",
		frequency: "je Änderung",
		trigger: "change",
		ownerFunction: "compliance",
		legalBasis: "MiCAR Art. 69 · § 28 ZAG",
		requires: ["micar", "zag"],
	},
];

export function applicableParties(
	frameworks: readonly string[],
): CatalogParty[] {
	const set = new Set(frameworks);
	return INTERESTED_PARTIES.filter(
		(p) => !p.requires || p.requires.some((f) => set.has(f)),
	);
}

export function applicableCommunications(
	frameworks: readonly string[],
): CatalogCommunication[] {
	const set = new Set(frameworks);
	return COMMUNICATIONS.filter(
		(c) => !c.requires || c.requires.some((f) => set.has(f)),
	);
}
