import type { ApplicationItem } from "../application";

// ZAG-Erlaubnisantrag (§ 10 Abs. 2 ZAG, PSD2 Art. 5, EBA/GL/2017/09;
// Businessplan 18.2). Verknüpft mit den Modulen; Vollständigkeit abgeleitet.
// Orientierung, kein Rechtsrat.

export const ZAG_APPLICATION: readonly ApplicationItem[] = [
	{
		code: "ZA-01",
		title: "Geschäftsmodell und Einordnung der Zahlungsdienste",
		legalBasis: "§ 10 Abs. 2 Nr. 1, § 1 Abs. 1 ZAG",
		description:
			"Welche Zahlungsdienste (z. B. Nr. 5 Akquisitionsgeschäft, Nr. 6 Finanztransfer), Ausnahmen (§ 2) geprüft, Geltungsbereich beschrieben.",
		route: "/organisation?tab=geltungsbereich",
		checks: [
			{ kind: "scope", framework: "zag" },
			{ kind: "controls", codes: ["CC-GOV-10"] },
		],
	},
	{
		code: "ZA-02",
		title: "Geschäftsplan mit Budgetplanung für drei Jahre",
		legalBasis: "§ 10 Abs. 2 Nr. 2 ZAG",
		description:
			"Planbilanzen, Plan-GuV, Liquidität, Annahmen; Nachweis angemessener Systeme, Ressourcen und Verfahren.",
		route: "/eigenmittel",
		checks: [
			{ kind: "manual", hint: "Geschäftsplan und Finanzplanung beigefügt" },
		],
	},
	{
		code: "ZA-03",
		title: "Anfangskapital und laufende Eigenmittel",
		legalBasis: "§§ 12, 15 ZAG",
		description:
			"Kapitalnachweis (125 000 € für Akquisitionsgeschäft), Eigenmittelmethode A/B/C, erster freigegebener Lauf.",
		route: "/eigenmittel",
		checks: [{ kind: "own_funds" }, { kind: "controls", codes: ["CC-CAP-01"] }],
	},
	{
		code: "ZA-04",
		title: "Sicherung der Kundengelder",
		legalBasis: "§ 10 Abs. 2 Nr. 4, § 17 ZAG",
		description:
			"Treuhandkonto bei CRR-Kreditinstitut oder Versicherung/Garantie; tägliche Abstimmung außerhalb des Betriebsbereichs (BTO 1).",
		route: "/controls/CC-CUS-01",
		checks: [
			{ kind: "controls", codes: ["CC-CUS-01", "CC-CUS-03"] },
			{ kind: "documents", templateCodes: ["KZ-KUNDENVERMOEGEN"] },
		],
	},
	{
		code: "ZA-05",
		title: "Unternehmenssteuerung und interne Kontrollverfahren inkl. GwG",
		legalBasis: "§ 10 Abs. 2 Nr. 5 und 6, § 27 ZAG, GwG §§ 4–7",
		description:
			"Geschäftsorganisation, Risikomanagement, Compliance, Interne Revision, Geldwäschebeauftragte:r, freigegebene Risikoanalyse.",
		route: "/organisation?tab=rollen",
		checks: [
			{
				kind: "functions",
				functions: [
					"management_body",
					"compliance",
					"aml_officer",
					"internal_audit",
				],
			},
			{ kind: "aml_risk_analysis" },
			{ kind: "controls", codes: ["CC-GOV-02", "CC-RSK-01", "CC-AML-02"] },
		],
	},
	{
		code: "ZA-06",
		title: "Sicherheits-, Notfall- und Vorfallkonzept",
		legalBasis: "§ 10 Abs. 2 Nr. 7–9, §§ 53, 54 ZAG; DORA",
		description:
			"Verfahren für operationelle und Sicherheitsrisiken, Vorfallmeldung (DORA Art. 23), Notfall- und Geschäftsfortführungsplan, Datenschutz- und Sicherheitsgrundsätze.",
		route: "/vorfaelle",
		checks: [
			{
				kind: "controls",
				codes: ["CC-RSK-07", "CC-INC-01", "CC-INC-03", "CC-BCM-01"],
			},
			{ kind: "documents", templateCodes: ["RL-VORFALL", "PL-NOTFALL"] },
		],
	},
	{
		code: "ZA-07",
		title: "Organisationsstruktur: Agenten, Zweigstellen, Auslagerungen",
		legalBasis: "§ 10 Abs. 2 Nr. 10, §§ 25, 26 ZAG",
		description:
			"Prozesslandkarte, Einsatz von Agenten, Auslagerungsregister mit Wesentlichkeitsbewertung und Verträgen.",
		route: "/dienstleister",
		checks: [
			{ kind: "processes", min: 3 },
			{ kind: "providers", filter: "any" },
			{ kind: "controls", codes: ["CC-TPR-10"] },
		],
	},
	{
		code: "ZA-08",
		title: "Inhaber bedeutender Beteiligungen",
		legalBasis: "§ 10 Abs. 2 Nr. 11, § 14 ZAG, InhKontrollV",
		description:
			"Identität, Beteiligungshöhe, Zuverlässigkeit, Mittelherkunft; Anzeige nach InhKontrollV.",
		route: "/organisation?tab=gesellschafter",
		checks: [{ kind: "shareholders" }],
	},
	{
		code: "ZA-09",
		title: "Geschäftsleiter: Zuverlässigkeit und fachliche Eignung",
		legalBasis: "§ 10 Abs. 2 Nr. 12, § 10 Abs. 1 ZAG",
		description:
			"Lebensläufe, Führungszeugnisse, Erklärungen, Nachweis theoretischer und praktischer Kenntnisse.",
		route: "/organisation?tab=rollen",
		checks: [{ kind: "controls", codes: ["CC-GOV-22"] }],
	},
	{
		code: "ZA-10",
		title: "Abschlussprüfer, Rechtsform, Sitz und Hauptverwaltung",
		legalBasis: "§ 10 Abs. 2 Nr. 13–15 ZAG",
		description:
			"Bestellter Abschlussprüfer, Satzung, Nachweis von Sitz und Hauptverwaltung im Inland.",
		route: "/einstellungen",
		checks: [{ kind: "manual", hint: "Unterlagen im Dossier abgelegt" }],
	},
];
