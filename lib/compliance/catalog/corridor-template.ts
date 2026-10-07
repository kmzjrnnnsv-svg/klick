// Korridor-Vorlage (Businessplan 16.4 / 23.1): acht Schritte als Aufgaben-
// paket je neuem Zielland plus 15-Fragen-Länderdossier als Checkliste.
// Orientierung, kein Rechtsrat.

export type CorridorStep = {
	order: number;
	title: string;
	description: string;
	offsetDays: number;
	ownerFunction:
		| "management_body"
		| "compliance"
		| "aml_officer"
		| "outsourcing_officer"
		| "isb_ciso"
		| "risk_control";
};

export const CORRIDOR_STEPS: readonly CorridorStep[] = [
	{
		order: 1,
		title: "Länderdossier erstellen (15 Fragen)",
		description:
			"Regulierung, Lizenzpflicht, Reverse Solicitation, AML-Regime, Travel Rule, Sanktionen, Steuern, Datenschutz, Banken.",
		offsetDays: 14,
		ownerFunction: "compliance",
	},
	{
		order: 2,
		title: "Länderrisiko bewerten und Stance festlegen",
		description:
			"EU-Hochrisikoliste, FATF, Sanktionen, Korruptionsindex → allowed / enhanced_dd / blocked im Jurisdiktionsregister.",
		offsetDays: 21,
		ownerFunction: "aml_officer",
	},
	{
		order: 3,
		title:
			"Partner-VASP / Bank identifizieren und Due Diligence (AMLR Art. 37)",
		description:
			"Lizenz im Zielland, AML-Programm, Reputation, Travel-Rule-Fähigkeit, Prüfberichte; Zustimmung der Geschäftsleitung.",
		offsetDays: 45,
		ownerFunction: "outsourcing_officer",
	},
	{
		order: 4,
		title: "Vertrag mit DORA-Art.-30-Klauseln und Travel-Rule-Protokoll",
		description:
			"Leistungsbeschreibung, Datenstandort, Audit-Rechte, Exit, Vorfallmeldung; IVMS101-Kompatibilität.",
		offsetDays: 75,
		ownerFunction: "outsourcing_officer",
	},
	{
		order: 5,
		title: "AML-Risikoanalyse und Monitoring-Regeln um den Korridor erweitern",
		description: "Länderfaktor, Schwellen, typische Muster; Freigabe der GL.",
		offsetDays: 80,
		ownerFunction: "aml_officer",
	},
	{
		order: 6,
		title: "Technische Integration und Sicherheitsprüfung",
		description:
			"API-Anbindung, Schlüsselmanagement, Logging, Pentest des Korridor-Pfads.",
		offsetDays: 100,
		ownerFunction: "isb_ciso",
	},
	{
		order: 7,
		title: "Pilot mit Limiten und erweitertem Monitoring",
		description:
			"Volumen- und Betragslimite, tägliche Review der Treffer, Lessons Learned.",
		offsetDays: 120,
		ownerFunction: "risk_control",
	},
	{
		order: 8,
		title: "GL-Beschluss: Korridor aktiv, Anzeigepflichten geprüft",
		description:
			"Beschluss im Register; Anzeige an BaFin bei wesentlicher Änderung (Art. 69 MiCAR / § 28 ZAG).",
		offsetDays: 150,
		ownerFunction: "management_body",
	},
];

export const CORRIDOR_DOSSIER_QUESTIONS: readonly string[] = [
	"Welche Behörde beaufsichtigt Zahlungs- und Kryptowerte-Dienste im Zielland?",
	"Braucht die Erbringung an Kunden im Zielland eine lokale Lizenz oder Registrierung?",
	"Gilt Reverse Solicitation — und wie wird sie dokumentiert?",
	"Welches AML-Regime gilt (FATF-Status, Hochrisikoliste, lokale Schwellen)?",
	"Ist die Travel Rule umgesetzt — Schwelle, Datenfelder, Protokolle?",
	"Welche Sanktionslisten sind zusätzlich zu EU/UN zu beachten (OFAC, lokal)?",
	"Welche Steuern/Meldepflichten entstehen (DAC8/CARF-Partner, Quellensteuer)?",
	"Welches Datenschutzrecht gilt und ist ein Drittlandtransfer zulässig (Art. 44 ff. DSGVO)?",
	"Welche Banken/Partner bieten Fiat-Settlement und akzeptieren Krypto-Zahlungsflüsse?",
	"Welche Stablecoins sind lokal zulässig (EMT-Emittenten, lokale Token)?",
	"Wie hoch sind Länder-, Konvertierungs- und Liquiditätsrisiko (BTR 2–4)?",
	"Welche Verbraucherschutz- und Informationspflichten gelten?",
	"Gibt es Kapitalverkehrskontrollen oder Meldepflichten (AWV-Pendant)?",
	"Welche Streitbeilegungs- und Beschwerdewege sind vorgeschrieben?",
	"Welche Exit-Szenarien bestehen (Partnerausfall, Regulierungswechsel, Sanktionen)?",
];
