import type { CatalogRequirement, CatalogSection } from "./types";

// NIS2 – Richtlinie (EU) 2022/2555, umgesetzt durch das BSIG (NIS2UmsuCG, in
// Kraft seit Dezember 2025). Authoring-Quelle:
// docs/regulatory/anforderungskatalog-2026-10.md, Abschnitt 3.
//
// Für DORA-Finanzunternehmen gelten die §§ 30, 31, 32, 35, 36, 38 und 39 BSIG
// nicht (§ 28 Abs. 6 Nr. 1 BSIG). Übrig bleiben Betroffenheitsprüfung und
// Registrierung (§ 33 BSIG). Jede Anforderung trägt den DORA-Hinweis in
// `guidance`, damit Prüfer und Mandanten die Abgrenzung direkt sehen.

export const NIS2_SECTIONS: CatalogSection[] = [
	{ code: "A", title: "Anwendbarkeit und Betroffenheit", sortOrder: 10 },
	{ code: "B", title: "Governance (Art. 20 / § 38 BSIG)", sortOrder: 20 },
	{
		code: "C",
		title: "Risikomanagementmaßnahmen (Art. 21 / §§ 30–31 BSIG)",
		sortOrder: 30,
	},
	{ code: "D", title: "Meldepflichten (Art. 23 / § 32 BSIG)", sortOrder: 40 },
	{
		code: "E",
		title: "Registrierung und Zertifizierung (Art. 24, 27 / §§ 33–34 BSIG)",
		sortOrder: 50,
	},
	{ code: "F", title: "Informationsaustausch (Art. 29)", sortOrder: 60 },
	{ code: "G", title: "Anlage 1 BSIG – Managed Services", sortOrder: 70 },
];

export const NIS2_REQUIREMENTS: CatalogRequirement[] = [
	// ---------------------------------------------------------------- A
	{
		code: "Art.2-3",
		sectionCode: "A",
		title: "Betroffenheitsprüfung und Einstufung",
		requirementText:
			"Eine Einrichtung unterliegt den NIS2-Pflichten, wenn sie einem Sektor der Anhänge I oder II angehört und die Größenschwellen erreicht (mindestens mittleres Unternehmen). § 28 Abs. 1 BSIG definiert besonders wichtige, § 28 Abs. 2 BSIG wichtige Einrichtungen; die Einstufung ist zu prüfen und zu dokumentieren.",
		guidance:
			"NIS2-Anhang I nennt im Finanzbereich Kreditinstitute und Finanzmarktinfrastrukturen; ein reines Zahlungs- oder Krypto-Institut kann vollständig außerhalb liegen – mit einer späteren Banklizenz ändert sich das. Für DORA-Finanzunternehmen: Prüfung erforderlich – die Ausnahme setzt voraus, dass die Einrichtung überhaupt vom BSIG erfasst ist (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: ["Art. 2–3 RL (EU) 2022/2555", "§ 28 BSIG"],
		domain: "governance",
		appliesToRoles: ["any"],
		evidenceHints: ["Betroffenheitsanalyse"],
		relatedRequirements: ["iso27001:4.1", "iso27001:4.3", "iso27001:A.5.31"],
		recommendations: [
			{
				level: "must",
				text: "BSI-Betroffenheitsprüfung durchführen, Ergebnis mit Datum und Annahmen ablegen und bei Lizenzwechsel oder neuem Geschäftsfeld wiederholen.",
				source: "intern",
			},
			{
				level: "should",
				text: "Schwellenwerte (Mitarbeitende, Umsatz, Bilanzsumme) jährlich mit dem Jahresabschluss abgleichen.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Liegt eine dokumentierte Betroffenheitsanalyse mit Sektor- und Größenprüfung vor?",
			"Wird die Einstufung bei Änderungen von Geschäftsmodell, Lizenz oder Größe erneut geprüft?",
		],
		pitfalls: [
			"Die Prüfung nur auf die Finanzlizenz zu stützen und Nicht-Finanz-Tätigkeiten (z. B. Managed Services, Cloud) zu übersehen.",
		],
		tools: {
			startup: ["BSI-Betroffenheitsprüfung (online, kostenlos)"],
			scale: [],
		},
		sortOrder: 10,
	},
	{
		code: "Art.4",
		sectionCode: "A",
		title: "Lex specialis DORA",
		requirementText:
			"Enthalten sektorspezifische Rechtsakte der Union Anforderungen an Risikomanagement oder Meldepflichten, die in ihrer Wirkung den NIS2-Pflichten mindestens gleichwertig sind, gehen diese vor. § 28 Abs. 6 Nr. 1 BSIG nimmt Finanzunternehmen im Sinne der DORA von den §§ 30, 31, 32, 35, 36, 38 und 39 BSIG aus.",
		guidance:
			"Die Inanspruchnahme der Ausnahme ist mit Verweis auf den DORA-Anwendungsbereich (Art. 2 DORA) schriftlich zu begründen und Prüfern vorzulegen. Für DORA-Finanzunternehmen: gilt – die Ausnahme umfasst nur die genannten Paragrafen, Betroffenheitsprüfung und Registrierung nach § 33 BSIG bleiben bestehen (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: ["Art. 4 RL (EU) 2022/2555", "§ 28 Abs. 6 BSIG"],
		domain: "governance",
		appliesToRoles: ["any"],
		evidenceHints: ["Dokumentierte Ausnahmebegründung"],
		relatedRequirements: ["iso27001:4.1", "iso27001:A.5.31", "dora:Art.6(1-4)"],
		recommendations: [
			{
				level: "must",
				text: "Ausnahmebegründung als kurzes Memo mit Rechtsgrundlagen, Datum und Freigabe der Geschäftsleitung ablegen; bei Änderung des Lizenzstatus aktualisieren.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Ist dokumentiert, welche BSIG-Pflichten wegen DORA entfallen und welche bestehen bleiben?",
		],
		pitfalls: [
			"Aus der DORA-Ausnahme eine vollständige Freistellung von NIS2 abzuleiten und die Registrierungspflicht zu übersehen.",
		],
		sortOrder: 20,
	},

	// ---------------------------------------------------------------- B
	{
		code: "Art.20(1)",
		sectionCode: "B",
		title: "Billigung und Überwachung durch die Geschäftsleitung",
		requirementText:
			"Die Geschäftsleitung billigt die Risikomanagementmaßnahmen nach Art. 21 und überwacht deren Umsetzung; sie haftet für Verstöße gegen diese Pflicht (§ 38 Abs. 1–2 BSIG). Eine Übertragung der Verantwortung auf Dritte ist nicht zulässig.",
		guidance:
			"Billigungsbeschlüsse, regelmäßige Berichte an die Geschäftsleitung und deren Behandlung sind nachzuhalten. Für DORA-Finanzunternehmen: gilt nicht – DORA Art. 5 deckt die Verantwortung des Leitungsorgans ab (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: ["Art. 20 Abs. 1 RL (EU) 2022/2555", "§ 38 BSIG"],
		domain: "governance",
		appliesToRoles: ["any"],
		evidenceHints: [
			"Beschluss der Geschäftsleitung zum Maßnahmenkatalog",
			"Berichtsprotokolle",
		],
		relatedRequirements: ["iso27001:5.1", "iso27001:9.3", "dora:Art.5(2)"],
		recommendations: [
			{
				level: "must",
				text: "Jährlicher Beschluss der Geschäftsleitung zum Maßnahmenkatalog plus mindestens quartalsweiser Statusbericht mit Kennzahlen.",
				source: "BSI IT-Grundschutz",
				ref: "ISMS.1 Sicherheitsmanagement",
			},
		],
		auditQuestions: [
			"Hat die Geschäftsleitung die Risikomanagementmaßnahmen förmlich gebilligt?",
			"Wie und wie oft berichtet die Informationssicherheit an die Geschäftsleitung?",
		],
		pitfalls: [
			"Billigung nur durch ISB oder IT-Leitung – die Pflicht trifft die Geschäftsleitung persönlich.",
		],
		sortOrder: 30,
	},
	{
		code: "Art.20(2)",
		sectionCode: "B",
		title: "Schulung der Geschäftsleitung und der Mitarbeitenden",
		requirementText:
			"Mitglieder der Geschäftsleitung nehmen regelmäßig an Schulungen teil, um ausreichende Kenntnisse und Fähigkeiten zur Erkennung und Bewertung von Risiken und Risikomanagementpraktiken im Bereich der Cybersicherheit zu erwerben (§ 38 Abs. 3 BSIG). Vergleichbare Schulungen sind den Mitarbeitenden regelmäßig anzubieten.",
		guidance:
			"Teilnahmenachweise der Geschäftsleitung getrennt dokumentieren und Inhalte an die Rolle anpassen (Risikobewertung, Vorfallsreaktion, Haftung). Für DORA-Finanzunternehmen: gilt nicht – DORA Art. 5 Abs. 4 verlangt die Schulung des Leitungsorgans gleichwertig (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: ["Art. 20 Abs. 2 RL (EU) 2022/2555", "§ 38 Abs. 3 BSIG"],
		domain: "hr",
		appliesToRoles: ["any"],
		evidenceHints: [
			"Schulungsnachweise der Geschäftsleitung",
			"Schulungsplan",
			"Teilnahmelisten",
		],
		relatedRequirements: [
			"dora:Art.5(4)",
			"iso27001:7.2",
			"iso27001:7.3",
			"iso27001:A.6.3",
		],
		recommendations: [
			{
				level: "should",
				text: "Geschäftsleitungs-Schulung mindestens jährlich; Mitarbeitende jährlich plus Phishing-Übungen.",
				source: "ENISA",
				ref: "ENISA Technical Implementation Guidance 2025",
			},
		],
		auditQuestions: [
			"Wann hat die Geschäftsleitung zuletzt an einer Cybersicherheitsschulung teilgenommen, und ist das belegt?",
		],
		sortOrder: 40,
	},

	// ---------------------------------------------------------------- C
	{
		code: "Art.21(1)",
		sectionCode: "C",
		title: "Geeignete und verhältnismäßige Risikomanagementmaßnahmen",
		requirementText:
			"Einrichtungen ergreifen geeignete, verhältnismäßige technische, operative und organisatorische Maßnahmen, um Risiken für die Sicherheit der Netz- und Informationssysteme zu beherrschen und Auswirkungen von Sicherheitsvorfällen zu verhindern oder gering zu halten. Die Maßnahmen folgen einem gefahrenübergreifenden Ansatz, berücksichtigen den Stand der Technik und einschlägige Normen und stehen im Verhältnis zu Risikoexposition, Größe und Schadenswahrscheinlichkeit (§ 30 Abs. 1 BSIG).",
		guidance:
			"Ein ISMS nach ISO 27001 oder BSI IT-Grundschutz erfüllt den Rahmen; die Verhältnismäßigkeit ist in der Risikoanalyse zu begründen. Für DORA-Finanzunternehmen: gilt nicht – DORA Kapitel II (Art. 5–16) tritt an die Stelle der §§ 30–31 BSIG; eine Mapping-Tabelle NIS2 → DORA erleichtert Prüfern den Nachvollzug (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: ["Art. 21 Abs. 1 RL (EU) 2022/2555", "§§ 30–31 BSIG"],
		domain: "governance",
		appliesToRoles: ["any"],
		evidenceHints: [
			"Mapping-Tabelle NIS2 → DORA für Prüfer",
			"Maßnahmenkatalog mit Verhältnismäßigkeitsbegründung",
		],
		relatedRequirements: ["iso27001:6.1.3", "iso27001:8.1", "dora:Art.6(1-4)"],
		recommendations: [
			{
				level: "must",
				text: "Ein Referenzrahmenwerk (ISO 27001 oder IT-Grundschutz) wählen und die NIS2-Maßnahmen darauf abbilden, statt ein zweites Regelwerk zu pflegen.",
				source: "BSI IT-Grundschutz",
			},
			{
				level: "should",
				text: "Die ENISA-Umsetzungshilfe als Prüfraster für jede Mindestmaßnahme nutzen.",
				source: "ENISA",
				ref: "ENISA Technical Implementation Guidance 2025",
			},
		],
		auditQuestions: [
			"Wie ist die Angemessenheit der Maßnahmen gegenüber dem Risiko begründet?",
			"Werden Stand der Technik und einschlägige Normen nachweisbar berücksichtigt?",
		],
		pitfalls: [
			"Die zehn Mindestmaßnahmen als Checkliste abzuhaken, ohne die risikobasierte Herleitung zu dokumentieren.",
		],
		tools: { startup: ["GRC-Tool-Mapping"], scale: [] },
		sortOrder: 50,
	},
	{
		code: "Art.21(2)(a)",
		sectionCode: "C",
		title: "Konzepte für Risikoanalyse und Sicherheit von Informationssystemen",
		requirementText:
			"Die Einrichtung verfügt über Konzepte zur Risikoanalyse und zur Sicherheit von Informationssystemen (§ 30 Abs. 2 Nr. 1 BSIG). Dazu gehören eine Informationssicherheitsleitlinie, eine Methodik zur Risikobewertung und ein dokumentiertes Risikoregister mit Behandlungsplan.",
		guidance:
			"Risikoanalyse mindestens jährlich und anlassbezogen wiederholen; Ergebnisse an die Geschäftsleitung berichten. Für DORA-Finanzunternehmen: gilt nicht – DORA Art. 6 und 8 (IKT-Risikomanagementrahmen, Identifizierung) decken die Anforderung ab (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: [
			"Art. 21 Abs. 2 Buchst. a RL (EU) 2022/2555",
			"§ 30 Abs. 2 Nr. 1 BSIG",
		],
		domain: "risk",
		appliesToRoles: ["any"],
		evidenceHints: [
			"Informationssicherheitsleitlinie",
			"Risikomethodik",
			"Risikoregister",
			"Risikobehandlungsplan",
		],
		relatedRequirements: [
			"iso27001:6.1.2",
			"iso27001:A.5.1",
			"dora:Art.6(1-4)",
			"dora:Art.8(1-4)",
		],
		recommendations: [
			{
				level: "must",
				text: "Risikoanalyse auf einem Inventar der kritischen Geschäftsprozesse und der zugehörigen Assets aufsetzen.",
				source: "BSI IT-Grundschutz",
				ref: "BSI-Standard 200-3",
			},
		],
		auditQuestions: [
			"Nach welcher Methodik werden Risiken identifiziert, bewertet und behandelt?",
		],
		sortOrder: 60,
	},
	{
		code: "Art.21(2)(b)",
		sectionCode: "C",
		title: "Bewältigung von Sicherheitsvorfällen",
		requirementText:
			"Die Einrichtung verfügt über Verfahren zur Bewältigung von Sicherheitsvorfällen: Erkennung, Analyse, Eindämmung, Reaktion, Wiederherstellung und Nachbereitung (§ 30 Abs. 2 Nr. 2 BSIG).",
		guidance:
			"Rollen, Eskalationswege und die Schnittstelle zur Meldepflicht nach § 32 BSIG festlegen und mindestens jährlich üben. Für DORA-Finanzunternehmen: gilt nicht – DORA Art. 17 (IKT-Vorfallmanagement) deckt die Anforderung ab (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: [
			"Art. 21 Abs. 2 Buchst. b RL (EU) 2022/2555",
			"§ 30 Abs. 2 Nr. 2 BSIG",
		],
		domain: "incident",
		appliesToRoles: ["any"],
		evidenceHints: [
			"Incident-Response-Plan",
			"Vorfallregister",
			"Übungsprotokolle",
		],
		relatedRequirements: ["iso27001:A.5.24", "iso27001:A.5.26", "dora:Art.17"],
		recommendations: [
			{
				level: "must",
				text: "Playbooks für die häufigsten Szenarien (Ransomware, Kontoübernahme, Datenabfluss) mit klaren Entscheidungs- und Meldepunkten.",
				source: "ENISA",
				ref: "ENISA Technical Implementation Guidance 2025",
			},
		],
		auditQuestions: [
			"Wie werden Vorfälle erkannt, klassifiziert und eskaliert?",
			"Gibt es Lessons-Learned-Auswertungen zu vergangenen Vorfällen?",
		],
		pitfalls: [
			"Incident-Response-Plan ohne Verknüpfung zur 24-Stunden-Frühwarnung – die Einstufung als erheblich muss im Prozess verankert sein.",
		],
		sortOrder: 70,
	},
	{
		code: "Art.21(2)(c)",
		sectionCode: "C",
		title: "Aufrechterhaltung des Betriebs",
		requirementText:
			"Die Einrichtung stellt die Aufrechterhaltung des Betriebs sicher, insbesondere durch Backup-Management, Wiederherstellung nach einem Notfall und Krisenmanagement (§ 30 Abs. 2 Nr. 3 BSIG).",
		guidance:
			"Wiederanlaufzeiten (RTO/RPO) aus der Business-Impact-Analyse ableiten und die Wiederherstellung regelmäßig testen. Für DORA-Finanzunternehmen: gilt nicht – DORA Art. 11–12 (Geschäftsfortführung, Backup und Wiederherstellung) decken die Anforderung ab (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: [
			"Art. 21 Abs. 2 Buchst. c RL (EU) 2022/2555",
			"§ 30 Abs. 2 Nr. 3 BSIG",
		],
		domain: "continuity",
		appliesToRoles: ["any"],
		evidenceHints: [
			"Business-Impact-Analyse",
			"Backup-Konzept",
			"Notfall- und Wiederanlaufpläne",
			"Testprotokolle",
			"Krisenstabsordnung",
		],
		relatedRequirements: [
			"iso27001:A.5.30",
			"iso27001:A.8.13",
			"dora:Art.11(1-2)",
			"dora:Art.12(1)",
		],
		recommendations: [
			{
				level: "must",
				text: "Mindestens eine offline oder unveränderlich gespeicherte Backup-Kopie; jährlicher Wiederherstellungstest der kritischen Systeme.",
				source: "BSI IT-Grundschutz",
				ref: "CON.3 Datensicherungskonzept",
			},
		],
		auditQuestions: [
			"Wann wurde zuletzt eine vollständige Wiederherstellung aus dem Backup getestet?",
		],
		sortOrder: 80,
	},
	{
		code: "Art.21(2)(d)",
		sectionCode: "C",
		title: "Sicherheit der Lieferkette",
		requirementText:
			"Die Einrichtung gewährleistet die Sicherheit der Lieferkette einschließlich sicherheitsbezogener Aspekte der Beziehungen zu unmittelbaren Anbietern und Diensteanbietern (§ 30 Abs. 2 Nr. 4 BSIG). Zu berücksichtigen sind die Schwachstellen jedes Anbieters, die Qualität seiner Produkte und Cybersicherheitspraxis sowie Ergebnisse koordinierter Risikobewertungen auf EU-Ebene.",
		guidance:
			"Dienstleisterregister mit Kritikalität, Sicherheitsanforderungen im Vertrag und regelmäßiger Überprüfung führen. Für DORA-Finanzunternehmen: gilt nicht – DORA Kapitel V (Art. 28–30, IKT-Drittparteienrisiko) deckt die Anforderung ab (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: [
			"Art. 21 Abs. 2 Buchst. d RL (EU) 2022/2555",
			"§ 30 Abs. 2 Nr. 4 BSIG",
		],
		domain: "supplier",
		appliesToRoles: ["any"],
		evidenceHints: [
			"Dienstleisterregister",
			"Sicherheitsklauseln in Verträgen",
			"Lieferantenbewertungen",
		],
		relatedRequirements: [
			"iso27001:A.5.19",
			"iso27001:A.5.20",
			"iso27001:A.5.21",
			"dora:Art.28(1-2)",
		],
		recommendations: [
			{
				level: "should",
				text: "Sicherheitsanforderungen als Standardanhang in jeden Dienstleistervertrag aufnehmen (Meldepflichten, Auditrechte, Exit).",
				source: "ENISA",
				ref: "ENISA Technical Implementation Guidance 2025",
			},
		],
		auditQuestions: [
			"Welche Dienstleister sind kritisch, und wie werden deren Sicherheitsmaßnahmen geprüft?",
		],
		pitfalls: [
			"Nur Erstanbieter erfassen und Unterauftragnehmer (z. B. die Cloud-Infrastruktur hinter einem SaaS) ignorieren.",
		],
		sortOrder: 90,
	},
	{
		code: "Art.21(2)(e)",
		sectionCode: "C",
		title: "Sicherheit bei Erwerb, Entwicklung und Wartung",
		requirementText:
			"Die Einrichtung gewährleistet Sicherheitsmaßnahmen bei Erwerb, Entwicklung und Wartung von Netz- und Informationssystemen, einschließlich Management und Offenlegung von Schwachstellen (§ 30 Abs. 2 Nr. 5 BSIG).",
		guidance:
			"Richtlinie für sichere Entwicklung, Patch-Prozess mit Fristen je Schweregrad und eine Kontaktstelle für Schwachstellenmeldungen (Coordinated Vulnerability Disclosure) einrichten. Für DORA-Finanzunternehmen: gilt nicht – DORA Art. 9 Abs. 4 (Schutz und Prävention, Patch- und Änderungsmanagement) deckt die Anforderung ab (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: [
			"Art. 21 Abs. 2 Buchst. e RL (EU) 2022/2555",
			"§ 30 Abs. 2 Nr. 5 BSIG",
		],
		domain: "development",
		appliesToRoles: ["any"],
		evidenceHints: [
			"Richtlinie sichere Entwicklung",
			"Patch-Management-Prozess",
			"Schwachstellenscans",
			"Disclosure-Policy (security.txt)",
		],
		relatedRequirements: [
			"iso27001:A.8.8",
			"iso27001:A.8.25",
			"iso27001:A.8.32",
			"dora:Art.9(4)(f)",
		],
		recommendations: [
			{
				level: "must",
				text: "security.txt und Disclosure-Prozess veröffentlichen; Schwachstellenscans mindestens monatlich, bei internetexponierten Systemen fortlaufend.",
				source: "BSI IT-Grundschutz",
				ref: "OPS.1.1.3 Patch- und Änderungsmanagement",
			},
		],
		auditQuestions: [
			"Innerhalb welcher Fristen werden kritische Schwachstellen behoben, und wie wird das überwacht?",
		],
		sortOrder: 100,
	},
	{
		code: "Art.21(2)(f)",
		sectionCode: "C",
		title: "Bewertung der Wirksamkeit der Maßnahmen",
		requirementText:
			"Die Einrichtung verfügt über Konzepte und Verfahren zur Bewertung der Wirksamkeit ihrer Risikomanagementmaßnahmen im Bereich der Cybersicherheit (§ 30 Abs. 2 Nr. 6 BSIG).",
		guidance:
			"Interne Audits, Kennzahlen, Penetrationstests und Managementbewertung in einem Prüfplan bündeln. Für DORA-Finanzunternehmen: gilt nicht – DORA Art. 6 Abs. 5–6 (interne Revision, Überprüfung des Rahmens) und Kapitel IV (Tests) decken die Anforderung ab (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: [
			"Art. 21 Abs. 2 Buchst. f RL (EU) 2022/2555",
			"§ 30 Abs. 2 Nr. 6 BSIG",
		],
		domain: "governance",
		appliesToRoles: ["any"],
		evidenceHints: [
			"Auditprogramm",
			"Auditberichte",
			"Kennzahlen-Dashboard",
			"Managementbewertung",
		],
		relatedRequirements: [
			"iso27001:9.1",
			"iso27001:9.2",
			"iso27001:9.3",
			"dora:Art.6(5)",
		],
		recommendations: [
			{
				level: "should",
				text: "Jährliches internes Audit über alle zehn Mindestmaßnahmen und mindestens jährlicher Penetrationstest internetexponierter Systeme.",
				source: "ENISA",
				ref: "ENISA Technical Implementation Guidance 2025",
			},
		],
		auditQuestions: [
			"Wie wird gemessen, ob die Maßnahmen wirken, und wer bewertet die Ergebnisse?",
		],
		pitfalls: [
			"Wirksamkeit nur über das Vorhandensein von Dokumenten zu belegen statt über Tests und Kennzahlen.",
		],
		sortOrder: 110,
	},
	{
		code: "Art.21(2)(g)",
		sectionCode: "C",
		title: "Cyberhygiene und Schulungen",
		requirementText:
			"Die Einrichtung setzt grundlegende Verfahren der Cyberhygiene um und führt Schulungen im Bereich der Cybersicherheit durch (§ 30 Abs. 2 Nr. 7 BSIG).",
		guidance:
			"Cyberhygiene umfasst u. a. Passwortregeln, Updates, Härtung, Zero-Trust-Grundsätze und Awareness; Schulungen rollenbasiert und wiederkehrend planen. Für DORA-Finanzunternehmen: gilt nicht – DORA Art. 13 Abs. 6 (Sensibilisierungsprogramme und Schulungen) deckt die Anforderung ab (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: [
			"Art. 21 Abs. 2 Buchst. g RL (EU) 2022/2555",
			"§ 30 Abs. 2 Nr. 7 BSIG",
		],
		domain: "hr",
		appliesToRoles: ["any"],
		evidenceHints: [
			"Awareness-Konzept",
			"Schulungsnachweise",
			"Phishing-Simulationsergebnisse",
			"Härtungsrichtlinien",
		],
		relatedRequirements: ["iso27001:7.3", "iso27001:A.6.3", "dora:Art.13(6)"],
		recommendations: [
			{
				level: "should",
				text: "Onboarding-Schulung vor Zugangsvergabe, jährliche Auffrischung und quartalsweise Phishing-Simulation.",
				source: "BSI IT-Grundschutz",
				ref: "ORP.3 Sensibilisierung und Schulung",
			},
		],
		auditQuestions: [
			"Welche Cyberhygiene-Grundregeln gelten, und wie wird ihre Einhaltung geprüft?",
		],
		sortOrder: 120,
	},
	{
		code: "Art.21(2)(h)",
		sectionCode: "C",
		title: "Kryptografie und Verschlüsselung",
		requirementText:
			"Die Einrichtung verfügt über Konzepte und Verfahren für den Einsatz von Kryptografie und gegebenenfalls Verschlüsselung (§ 30 Abs. 2 Nr. 8 BSIG).",
		guidance:
			"Kryptokonzept mit zugelassenen Algorithmen, Schlüssellebenszyklus und Verantwortlichkeiten; Transportverschlüsselung durchgängig, Verschlüsselung ruhender Daten nach Klassifizierung. Für DORA-Finanzunternehmen: gilt nicht – DORA Art. 9 Abs. 2 und 4 (Verschlüsselung, Schlüsselmanagement) decken die Anforderung ab (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: [
			"Art. 21 Abs. 2 Buchst. h RL (EU) 2022/2555",
			"§ 30 Abs. 2 Nr. 8 BSIG",
		],
		domain: "crypto",
		appliesToRoles: ["any"],
		evidenceHints: [
			"Kryptokonzept",
			"Schlüsselinventar",
			"TLS-Konfigurationsnachweise",
		],
		relatedRequirements: [
			"iso27001:A.8.24",
			"dora:Art.9(2)",
			"dora:Art.9(4)(d)",
		],
		recommendations: [
			{
				level: "must",
				text: "Algorithmen und Schlüssellängen an BSI TR-02102 ausrichten und jährlich prüfen.",
				source: "BSI IT-Grundschutz",
				ref: "BSI TR-02102-1",
			},
		],
		auditQuestions: [
			"Welche Algorithmen und Schlüssellängen sind zugelassen, und wo ist das festgelegt?",
			"Wie werden Schlüssel erzeugt, gespeichert, rotiert und vernichtet?",
		],
		pitfalls: [
			"Verschlüsselung ohne Schlüsselmanagement – der Schlüssel liegt neben den Daten.",
		],
		sortOrder: 130,
	},
	{
		code: "Art.21(2)(i)",
		sectionCode: "C",
		title: "Personalsicherheit, Zugriffskontrolle und Anlagenmanagement",
		requirementText:
			"Die Einrichtung gewährleistet die Sicherheit des Personals, Konzepte für die Zugriffskontrolle und das Management von Anlagen (§ 30 Abs. 2 Nr. 9 BSIG).",
		guidance:
			"Asset-Inventar als Grundlage, Berechtigungen nach Need-to-know mit regelmäßiger Rezertifizierung, Prozesse für Eintritt, Wechsel und Austritt. Für DORA-Finanzunternehmen: gilt nicht – DORA Art. 8 (Identifizierung) und Art. 9 Abs. 4 Buchst. c (Zugriffskontrolle) decken die Anforderung ab (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: [
			"Art. 21 Abs. 2 Buchst. i RL (EU) 2022/2555",
			"§ 30 Abs. 2 Nr. 9 BSIG",
		],
		domain: "access",
		appliesToRoles: ["any"],
		evidenceHints: [
			"Asset-Inventar",
			"Berechtigungskonzept",
			"Rezertifizierungsprotokolle",
			"Onboarding-/Offboarding-Checklisten",
		],
		relatedRequirements: [
			"iso27001:A.5.9",
			"iso27001:A.5.15",
			"iso27001:A.6.1",
			"dora:Art.9(4)(c)",
		],
		recommendations: [
			{
				level: "must",
				text: "Privilegierte Zugänge getrennt verwalten, quartalsweise rezertifizieren und beim Austritt am selben Tag entziehen.",
				source: "BSI IT-Grundschutz",
				ref: "ORP.4 Identitäts- und Berechtigungsmanagement",
			},
		],
		auditQuestions: [
			"Wie oft werden Berechtigungen überprüft, und wer gibt sie frei?",
		],
		sortOrder: 140,
	},
	{
		code: "Art.21(2)(j)",
		sectionCode: "C",
		title: "Multi-Faktor-Authentisierung und gesicherte Kommunikation",
		requirementText:
			"Die Einrichtung verwendet Lösungen zur Multi-Faktor-Authentisierung oder kontinuierlichen Authentisierung, gesicherte Sprach-, Video- und Textkommunikation sowie gegebenenfalls gesicherte Notfallkommunikationssysteme (§ 30 Abs. 2 Nr. 10 BSIG).",
		guidance:
			"MFA für alle Fernzugänge, Administrationszugänge und Cloud-Konten; Notfallkommunikation (z. B. Messenger außerhalb der eigenen Infrastruktur) im Krisenplan festlegen. Für DORA-Finanzunternehmen: gilt nicht – DORA Art. 9 Abs. 4 Buchst. d (starke Authentifizierung) und Art. 11 (Kommunikation im Krisenfall) decken die Anforderung ab (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: [
			"Art. 21 Abs. 2 Buchst. j RL (EU) 2022/2555",
			"§ 30 Abs. 2 Nr. 10 BSIG",
		],
		domain: "access",
		appliesToRoles: ["any"],
		evidenceHints: [
			"MFA-Abdeckungsreport",
			"Richtlinie Kommunikationsmittel",
			"Notfallkommunikationsplan",
		],
		relatedRequirements: [
			"iso27001:A.5.17",
			"iso27001:A.8.5",
			"dora:Art.9(4)(d)",
			"dora:Art.11(1-2)",
		],
		recommendations: [
			{
				level: "must",
				text: "Phishing-resistente Verfahren (FIDO2/Passkeys) für privilegierte Konten; SMS-Codes nur als Übergang.",
				source: "ENISA",
				ref: "ENISA Technical Implementation Guidance 2025",
			},
		],
		auditQuestions: [
			"Für welche Konten ist MFA erzwungen, und wie werden Ausnahmen behandelt?",
		],
		pitfalls: [
			"MFA nur für Endnutzer, aber nicht für Admin-, Service- und Break-Glass-Konten.",
		],
		sortOrder: 150,
	},

	// ---------------------------------------------------------------- D
	{
		code: "Art.23",
		sectionCode: "D",
		title: "Meldung erheblicher Sicherheitsvorfälle an das BSI",
		requirementText:
			"Erhebliche Sicherheitsvorfälle sind dem BSI zu melden: Frühwarnung unverzüglich, spätestens 24 Stunden nach Kenntnis; Meldung mit Erstbewertung spätestens 72 Stunden nach Kenntnis; Abschlussbericht spätestens einen Monat nach der Meldung (§ 32 BSIG). Empfänger der Dienste sind über erhebliche Vorfälle und mögliche Abhilfemaßnahmen zu informieren, soweit sie betroffen sein könnten.",
		guidance:
			"Erheblichkeitskriterien (schwerwiegende Betriebsstörung, finanzieller Verlust, erheblicher Schaden für Dritte) im Incident-Prozess hinterlegen und Fristen automatisch anstoßen. Für DORA-Finanzunternehmen: gilt nicht – die Meldung schwerwiegender IKT-Vorfälle an die BaFin nach DORA Art. 19 tritt an die Stelle der BSI-Meldung (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: ["Art. 23 RL (EU) 2022/2555", "§ 32 BSIG"],
		domain: "incident",
		appliesToRoles: ["any"],
		evidenceHints: [
			"Meldeprozess mit Fristen",
			"Meldebestätigungen des BSI",
			"Vorfallregister",
			"Vorlagen für die Kundeninformation",
		],
		relatedRequirements: [
			"dora:Art.19",
			"iso27001:A.5.5",
			"iso27001:A.5.24",
			"iso27001:A.5.25",
		],
		recommendations: [
			{
				level: "must",
				text: "Entscheidungsbaum zur Erheblichkeit mit Bereitschaftsregelung und vorformulierten Meldetexten hinterlegen.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Wer entscheidet innerhalb von 24 Stunden über die Erheblichkeit und löst die Frühwarnung aus?",
			"Ist das BSI-Meldeportal eingerichtet und der Zugang getestet?",
		],
		pitfalls: [
			"Die 24-Stunden-Frist läuft ab Kenntnis, nicht ab abgeschlossener Analyse – die Frühwarnung darf unvollständig sein.",
		],
		sortOrder: 160,
	},

	// ---------------------------------------------------------------- E
	{
		code: "Art.24",
		sectionCode: "E",
		title: "Zertifizierte IKT-Produkte und -Dienste",
		requirementText:
			"Mitgliedstaaten können wichtige und besonders wichtige Einrichtungen verpflichten, bestimmte IKT-Produkte, -Dienste und -Prozesse zu nutzen, die nach europäischen Schemata für die Cybersicherheitszertifizierung (Cybersecurity Act) zertifiziert sind. Die Kommission kann solche Nutzungspflichten per Durchführungsrechtsakt festlegen.",
		guidance:
			"Derzeit besteht keine konkrete Nutzungspflicht; bei Beschaffung kritischer Komponenten Zertifizierungen (z. B. EUCC, BSI-Zertifikate) als Auswahlkriterium dokumentieren. Für DORA-Finanzunternehmen: nicht von der Ausnahme erfasst, derzeit aber ohne konkrete Nutzungspflicht; Zertifizierungen fließen in die Drittparteienbewertung nach DORA ein (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: [
			"Art. 24 RL (EU) 2022/2555",
			"VO (EU) 2019/881 (Cybersecurity Act)",
		],
		domain: "governance",
		appliesToRoles: ["any"],
		evidenceHints: [
			"Beschaffungsrichtlinie mit Zertifizierungskriterien",
			"Zertifikatsnachweise kritischer Komponenten",
		],
		relatedRequirements: [
			"iso27001:A.5.21",
			"iso27001:A.5.23",
			"dora:Art.28(1-2)",
		],
		recommendations: [
			{
				level: "could",
				text: "Zertifizierungsstatus (EUCC, BSI, ISO 27001 des Anbieters) als Pflichtfeld im Dienstleisterregister führen.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Werden Zertifizierungen bei der Auswahl kritischer IKT-Produkte und -Dienste berücksichtigt und dokumentiert?",
		],
		sortOrder: 170,
	},
	{
		code: "Art.27",
		sectionCode: "E",
		title: "Registrierung beim BSI",
		requirementText:
			"Wichtige und besonders wichtige Einrichtungen registrieren sich spätestens drei Monate nach erstmaliger oder erneuter Erfüllung der Kriterien beim BSI und übermitteln Name, Anschrift, Kontaktdaten einschließlich E-Mail-Adresse und Telefonnummer, Sektor und Teilsektor, zuständige Aufsichtsbehörde sowie die Mitgliedstaaten der Diensterbringung (§ 33 BSIG). Änderungen sind unverzüglich, spätestens binnen zwei Wochen mitzuteilen; die Einrichtung muss für das BSI jederzeit erreichbar sein.",
		guidance:
			"Der Zugang zum BSI-Portal erfolgt über ein ELSTER-Organisationszertifikat – rechtzeitig beantragen und eine funktionale Kontaktadresse mit Vertretungsregelung hinterlegen. Für DORA-Finanzunternehmen: gilt, falls betroffen – die Registrierungspflicht ist von der Ausnahme nicht erfasst (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: ["Art. 27 RL (EU) 2022/2555", "§ 33 BSIG"],
		domain: "governance",
		appliesToRoles: ["any"],
		evidenceHints: ["Registrierungsbestätigung", "Änderungsmeldungen"],
		relatedRequirements: ["iso27001:A.5.5", "iso27001:A.5.31"],
		recommendations: [
			{
				level: "must",
				text: "ELSTER-Organisationszertifikat frühzeitig beantragen (Bearbeitungszeit einplanen) und Registrierungsdaten als jährliche Wiedervorlage führen.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Liegt die Registrierungsbestätigung vor, und wurden Änderungen fristgerecht gemeldet?",
			"Ist die hinterlegte Kontaktstelle jederzeit erreichbar?",
		],
		pitfalls: [
			"Registrierung an eine persönliche E-Mail-Adresse binden – beim Austritt reißt die Erreichbarkeit ab.",
		],
		tools: {
			startup: ["BSI-Portal", "ELSTER-Organisationszertifikat"],
			scale: [],
		},
		sortOrder: 180,
	},
	{
		code: "§34BSIG",
		sectionCode: "E",
		title: "Besondere Registrierung bestimmter Digitalanbieter",
		requirementText:
			"Anbieter von DNS-Diensten, TLD-Namensregister, Domain-Registrierungsdienste, Anbieter von Cloud-Computing-, Rechenzentrums-, Content-Delivery-, Managed- und Managed-Security-Services sowie Online-Marktplätze, Online-Suchmaschinen und soziale Netzwerke registrieren sich nach § 34 BSIG mit zusätzlichen Angaben, insbesondere zur Hauptniederlassung und zu den EU-Mitgliedstaaten der Diensterbringung.",
		guidance:
			"Relevant nur, wenn das Unternehmen neben dem Finanzgeschäft solche Digitaldienste anbietet (z. B. als Cloud- oder Managed-Service-Anbieter); die Hauptniederlassung bestimmt die zuständige Aufsicht in der EU. Für DORA-Finanzunternehmen: nur einschlägig, wenn zusätzlich ein Digitaldienst angeboten wird; die Registrierung ist von der Ausnahme nicht erfasst (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: ["Art. 27 Abs. 2 RL (EU) 2022/2555", "§ 34 BSIG"],
		domain: "governance",
		appliesToRoles: ["any"],
		evidenceHints: [
			"Prüfvermerk zur Einordnung als Digitalanbieter",
			"Registrierungsbestätigung",
		],
		relatedRequirements: ["iso27001:4.3", "iso27001:A.5.31"],
		recommendations: [
			{
				level: "should",
				text: "Jedes Produkt bzw. jeden Dienst gegen die Liste der Digitalanbieter einordnen und die Prüfung im Neue-Produkte-Prozess wiederholen.",
				source: "intern",
			},
		],
		auditQuestions: [
			"Wurde geprüft, ob Teile des Angebots als Cloud-, Managed- oder sonstiger Digitaldienst nach § 34 BSIG gelten?",
		],
		sortOrder: 190,
	},

	// ---------------------------------------------------------------- F
	{
		code: "Art.29",
		sectionCode: "F",
		title: "Freiwilliger Austausch von Cybersicherheitsinformationen",
		requirementText:
			"Einrichtungen können untereinander freiwillig einschlägige Cybersicherheitsinformationen austauschen – etwa zu Cyberbedrohungen, Beinahe-Vorfällen, Schwachstellen, Taktiken und Indikatoren –, sofern der Austausch dem Schutz vor Sicherheitsvorfällen dient und innerhalb vertrauenswürdiger Gemeinschaften erfolgt.",
		guidance:
			"Die Teilnahme an der Allianz für Cybersicherheit des BSI oder einer Branchen-ISAC ist kostengünstig und wird von Prüfern positiv gewertet; Vertraulichkeit und Datenschutz des Austauschs regeln. Für DORA-Finanzunternehmen: freiwillig – DORA Art. 45 enthält eine gleichlautende Regelung, eine Ausnahme ist nicht erforderlich (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: ["Art. 29 RL (EU) 2022/2555"],
		domain: "governance",
		appliesToRoles: ["any"],
		evidenceHints: [
			"Mitgliedschaftsnachweis",
			"Austauschvereinbarung",
			"Threat-Intelligence-Feeds im Monitoring",
		],
		relatedRequirements: ["iso27001:A.5.6", "iso27001:A.5.7", "dora:Art.45"],
		recommendations: [
			{
				level: "could",
				text: "Kostenlose Mitgliedschaft in der Allianz für Cybersicherheit und Abonnement der CERT-Bund-Warnmeldungen einrichten.",
				source: "BSI IT-Grundschutz",
			},
		],
		auditQuestions: [
			"Nimmt die Einrichtung an einem Informationsaustausch teil, und wie fließen Erkenntnisse in die Risikoanalyse ein?",
		],
		tools: { startup: ["Allianz für Cybersicherheit", "MISP"], scale: [] },
		sortOrder: 200,
	},

	// ---------------------------------------------------------------- G
	{
		code: "Anlage1",
		sectionCode: "G",
		title: "Volle BSIG-Pflichten für Nicht-Finanz-Tätigkeiten",
		requirementText:
			"Erbringt ein Unternehmen Dienste aus den Sektoren der Anlage 1 BSIG – etwa Cloud-Computing, Rechenzentrums- oder Managed Services für Dritte – und erreicht die Schwellen von 50 Mitarbeitenden oder 10 Mio. € Jahresumsatz bzw. Bilanzsumme, ist es für diese Tätigkeit wichtige oder besonders wichtige Einrichtung mit sämtlichen BSIG-Pflichten (§§ 28, 30–33, 38 BSIG).",
		guidance:
			"Eine Plattform, die Nicht-EU-Zahlungsanbietern als White-Label- oder Managed Service angeboten wird, kann eine eigene NIS2-Einrichtung sein – vor dem Produktdesign prüfen und ggf. ein eigenes BSIG-Programm aufsetzen. Für DORA-Finanzunternehmen: gilt, wenn das Unternehmen anderen IKT-Dienste anbietet – die Ausnahme erfasst nur das Finanzgeschäft, nicht die Tätigkeit als Managed-Service- oder Cloud-Anbieter (§ 28 Abs. 6 BSIG).",
		legalBasisRefs: ["Anlage 1 BSIG", "§ 28 BSIG"],
		domain: "governance",
		appliesToRoles: ["any"],
		evidenceHints: [
			"Eigenes BSIG-Programm",
			"Betroffenheitsanalyse je Geschäftsfeld",
		],
		relatedRequirements: ["iso27001:4.1", "iso27001:4.3", "iso27001:A.5.31"],
		recommendations: [
			{
				level: "must",
				text: "Vor dem Launch eines Managed-Service- oder White-Label-Angebots die NIS2-Einordnung rechtlich prüfen lassen und den ISMS-Scope darauf ausweiten.",
				source: "intern",
			},
			{
				level: "should",
				text: "Das ISO-27001-ISMS so zuschneiden, dass die zehn Mindestmaßnahmen nach § 30 BSIG für den Managed-Service-Scope nachweisbar abgedeckt sind.",
				source: "BSI IT-Grundschutz",
			},
		],
		auditQuestions: [
			"Bietet das Unternehmen Dritten IKT-Dienste an, und wurde dafür eine eigene Betroffenheitsprüfung durchgeführt?",
			"Werden die Schwellenwerte für diesen Geschäftsbereich überwacht?",
		],
		pitfalls: [
			"Das SaaS-Angebot als bloße Nebentätigkeit des Finanzgeschäfts einzustufen – maßgeblich ist, ob der Dienst für Dritte erbracht wird.",
		],
		sortOrder: 210,
	},
];
