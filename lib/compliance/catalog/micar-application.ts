import type { ApplicationItem } from "../application";

// MiCAR-Antragsmappe (Art. 62(2) MiCAR, DelVO (EU) 2025/305 RTS, ITS zum
// Antragsformat; Businessplan 18.1). Jeder Bestandteil verknüpft Module der
// Plattform; die Vollständigkeit leitet /antrag aus deren Zustand ab.
// Orientierung, kein Rechtsrat — das Dossier prüft die Kanzlei.

export const MICAR_APPLICATION: readonly ApplicationItem[] = [
	{
		code: "MA-01",
		title: "Antragsteller: Name, LEI, Website, Satzung",
		legalBasis: "Art. 62(2)(a)–(b) MiCAR",
		description:
			"Firma, Rechtsform, LEI, Handelsregister, Website, Satzung/Gesellschaftsvertrag, Anschrift des Sitzes und der Hauptverwaltung in der EU (Art. 59(2)).",
		route: "/einstellungen",
		checks: [{ kind: "manual", hint: "Unterlagen im Dossier abgelegt" }],
	},
	{
		code: "MA-02",
		title: "Geschäftsplan: Dienste, Märkte, Vertrieb",
		legalBasis: "Art. 62(2)(c) MiCAR",
		description:
			"Programme of operations: welche Kryptowerte-Dienstleistungen, in welchen Mitgliedstaaten, wie und wo vermarktet; Kundensegmente, Volumenplanung über drei Jahre.",
		route: "/organisation?tab=geltungsbereich",
		checks: [
			{ kind: "scope", framework: "micar" },
			{ kind: "manual", hint: "Geschäftsplan (Businessplan) beigefügt" },
		],
	},
	{
		code: "MA-03",
		title: "Aufsichtsrechtliche Sicherheitsvorkehrungen (Eigenmittel)",
		legalBasis: "Art. 62(2)(d), Art. 67, Anhang IV MiCAR",
		description:
			"Nachweis von Mindestkapital bzw. ¼ der fixen Gemeinkosten; freigegebener Eigenmittel-Lauf, Kapitalnachweis, ggf. Versicherungspolice.",
		route: "/eigenmittel",
		checks: [{ kind: "own_funds" }, { kind: "controls", codes: ["CC-CAP-01"] }],
	},
	{
		code: "MA-04",
		title: "Governance-Regelungen",
		legalBasis: "Art. 62(2)(e), Art. 68 MiCAR",
		description:
			"Organisationsstruktur, Pflichtfunktionen mit Vertretung, Richtlinienhandbuch, Aufzeichnungssystem, Geschäftsfortführung.",
		route: "/organisation?tab=rollen",
		checks: [
			{
				kind: "functions",
				functions: [
					"management_body",
					"compliance",
					"internal_audit",
					"risk_control",
				],
			},
			{ kind: "controls", codes: ["CC-GOV-01", "CC-GOV-02", "CC-GOV-08"] },
			{ kind: "documents", templateCodes: ["RL-ISMS-LEITLINIE", "BE-ROLLEN"] },
		],
	},
	{
		code: "MA-05",
		title: "Fit & Proper der Mitglieder des Leitungsorgans",
		legalBasis: "Art. 62(2)(f), Art. 68(1) MiCAR",
		description:
			"Guter Ruf, Kenntnisse, Fähigkeiten, Erfahrung, Zeitbudget; Führungszeugnisse, Lebensläufe, Erklärungen zu Interessenkonflikten.",
		route: "/organisation?tab=rollen",
		checks: [{ kind: "controls", codes: ["CC-GOV-22"] }],
	},
	{
		code: "MA-06",
		title: "Gesellschafter mit qualifizierten Beteiligungen",
		legalBasis: "Art. 62(2)(g), Art. 83–85 MiCAR",
		description:
			"Identität, Beteiligungshöhe, UBO-Kette, Nachweis der Zuverlässigkeit und Mittelherkunft; Inhaberkontrollverfahren.",
		route: "/organisation?tab=gesellschafter",
		checks: [
			{ kind: "shareholders" },
			{ kind: "controls", codes: ["CC-GOV-22"] },
		],
	},
	{
		code: "MA-07",
		title: "IKT-Systeme und Sicherheitsvorkehrungen (DORA)",
		legalBasis: "Art. 62(2)(h), Art. 68(7) MiCAR; VO (EU) 2022/2554",
		description:
			"Beschreibung der IKT-Systeme, IKT-Risikomanagementrahmen, Strategie für digitale Resilienz, Vorfall- und Notfallmanagement, Drittparteienrisiko.",
		route: "/rahmenwerke/dora",
		checks: [
			{
				kind: "controls",
				codes: [
					"CC-GOV-15",
					"CC-RSK-04",
					"CC-INC-01",
					"CC-BCM-01",
					"CC-TPR-01",
				],
			},
			{
				kind: "documents",
				templateCodes: ["KZ-IKT-RISIKORAHMEN", "RL-VORFALL", "PL-NOTFALL"],
			},
		],
	},
	{
		code: "MA-08",
		title: "Trennung von Kundenkryptowerten und Kundengeldern",
		legalBasis: "Art. 62(2)(i), Art. 70 MiCAR",
		description:
			"Segregationskonzept: eigene Wallets/Konten, Kundengelder bis Ende des Folgetags bei Kreditinstitut oder Zentralbank, tägliche Abstimmung, keine Eigennutzung.",
		route: "/controls/CC-CUS-01",
		checks: [
			{ kind: "controls", codes: ["CC-CUS-01", "CC-CUS-03"] },
			{ kind: "documents", templateCodes: ["KZ-KUNDENVERMOEGEN"] },
		],
	},
	{
		code: "MA-09",
		title: "Beschwerdeverfahren",
		legalBasis: "Art. 62(2)(j), Art. 71 MiCAR; DelVO 2025/1141",
		description:
			"Veröffentlichtes, kostenloses Verfahren mit Register, Fristen (Eingangsbestätigung, Antwort) und Auswertung.",
		route: "/beschwerden",
		checks: [
			{ kind: "controls", codes: ["CC-CND-05"] },
			{ kind: "documents", templateCodes: ["RL-BESCHWERDEN"] },
		],
	},
	{
		code: "MA-10",
		title: "Interessenkonflikte",
		legalBasis: "Art. 62(2)(k), Art. 72 MiCAR",
		description:
			"Richtlinie und Register zu Erkennung, Verhinderung, Steuerung und Offenlegung von Interessenkonflikten.",
		route: "/organisation?tab=konflikte",
		checks: [
			{ kind: "controls", codes: ["CC-CND-06"] },
			{ kind: "documents", templateCodes: ["RL-INTERESSENKONFLIKTE"] },
		],
	},
	{
		code: "MA-11",
		title: "Auslagerungen",
		legalBasis: "Art. 62(2)(l), Art. 73 MiCAR",
		description:
			"Beschreibung ausgelagerter Funktionen, Dienstleisterregister, Verträge mit Prüf- und Zugangsrechten, Exit-Pläne.",
		route: "/dienstleister",
		checks: [
			{ kind: "providers", filter: "outsourcing" },
			{ kind: "controls", codes: ["CC-TPR-10", "CC-TPR-04"] },
		],
	},
	{
		code: "MA-12",
		title: "Verhinderung von Geldwäsche und Terrorismusfinanzierung",
		legalBasis: "Art. 62(2)(e) MiCAR; GwG §§ 4–7, 10 ff.",
		description:
			"Freigegebene Risikoanalyse, Geldwäschebeauftragte:r, interne Sicherungsmaßnahmen, Sorgfaltspflichten, Monitoring, Verdachtsmeldeprozess.",
		route: "/aml",
		checks: [
			{ kind: "aml_risk_analysis" },
			{ kind: "functions", functions: ["aml_officer"] },
			{
				kind: "controls",
				codes: ["CC-AML-02", "CC-AML-04", "CC-AML-06", "CC-AML-07"],
			},
		],
	},
	{
		code: "MA-13",
		title: "Verwahrrichtlinie und Schlüsselmanagement",
		legalBasis: "Art. 62(2)(m), Art. 75 MiCAR",
		description:
			"Verwahrrichtlinie, Kundenregister, Positionsauszüge, Schlüsselzeremonie, Haftung bei Verlust.",
		route: "/controls/CC-CUS-02",
		checks: [
			{ kind: "controls", codes: ["CC-CUS-02", "CC-KEY-01"] },
			{ kind: "documents", templateCodes: ["RL-VERWAHRUNG"] },
		],
		services: ["custody"],
	},
	{
		code: "MA-14",
		title: "Handelsplattform: Regelwerk und Marktmissbrauchserkennung",
		legalBasis: "Art. 62(2)(n), Art. 76, Art. 92 MiCAR",
		description:
			"Betriebsregeln, Zulassung von Kryptowerten, Überwachung verdächtiger Aufträge.",
		route: "/controls/CC-CND-04",
		checks: [{ kind: "controls", codes: ["CC-CND-04", "CC-CND-03"] }],
		services: ["platform"],
	},
	{
		code: "MA-15",
		title: "Geschäftspolitik Tausch, Best Execution, Transfer-Bedingungen",
		legalBasis: "Art. 62(2)(o)–(q), Art. 77, 78, 82 MiCAR",
		description:
			"Nichtdiskriminierende Geschäftspolitik und Preisveröffentlichung (Tausch), Best-Execution-Richtlinie (Ausführung), Kundenvertrag mit Rechten, Pflichten, Gebühren (Transfer).",
		route: "/controls/CC-CND-03",
		checks: [
			{ kind: "controls", codes: ["CC-CND-03"] },
			{ kind: "documents", templateCodes: ["RL-GESCHAEFTSPOLITIK"] },
		],
		services: ["exchange", "execution", "transfer", "fiat_onramp"],
	},
	{
		code: "MA-16",
		title: "Plan für die geordnete Abwicklung",
		legalBasis: "Art. 62(2)(d) i. V. m. Art. 74 MiCAR",
		description:
			"Wind-down-Plan: Rückgabe von Kundenvermögen, Kommunikation, Mittel für den Abwicklungszeitraum.",
		route: "/controls/CC-WND-01",
		checks: [
			{ kind: "controls", codes: ["CC-WND-01"] },
			{ kind: "documents", templateCodes: ["PL-ABWICKLUNG"] },
		],
	},
	{
		code: "MA-17",
		title: "Kryptowerte, auf die sich die Dienste beziehen",
		legalBasis: "Art. 62(2)(r), Art. 48 ff. MiCAR",
		description:
			"Liste der Kryptowerte (EMT nur mit zugelassenem Emittenten und Whitepaper), Netzwerke, Aufnahmeprüfung.",
		route: "/kryptowerte",
		checks: [{ kind: "crypto_assets" }],
	},
];
