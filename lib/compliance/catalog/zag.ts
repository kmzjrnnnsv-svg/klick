import type { CatalogRequirement, CatalogSection } from "./types";

// ZAG / PSD2 inkl. RTS (EU) 2018/389. Authoring-Quelle:
// docs/regulatory/anforderungskatalog-2026-10.md, Abschnitt 7 (Tabellen 7.1–7.2).
// IT- und Vorfallthemen laufen seit 2025 über DORA (§ 53 Abs. 1 S. 3, § 54 Abs. 7).
// Paraphrasen, kein Rechtsrat.

export const ZAG_SECTIONS: CatalogSection[] = [
	{ code: "ERL", title: "Erlaubnis, Kapital und Beteiligungen", sortOrder: 10 },
	{
		code: "ORG",
		title: "Organisation, Auslagerung und Aufsicht",
		sortOrder: 20,
	},
	{ code: "SEC", title: "Sicherheit, SCA und Betrug", sortOrder: 30 },
	{ code: "KUN", title: "Kunden und Zivilrecht", sortOrder: 40 },
	{ code: "AUS", title: "Ausblick", sortOrder: 50 },
];

const FE = ["financial_entity"] as const;

export const ZAG_REQUIREMENTS: CatalogRequirement[] = [
	{
		code: "§1(1)",
		sectionCode: "ERL",
		title: "Einordnung der Zahlungsdienste",
		requirementText:
			"Die erbrachten Dienste werden den Zahlungsdiensten des § 1 Abs. 1 S. 2 ZAG zugeordnet (z. B. Nr. 5 Akquisitionsgeschäft, Nr. 6 Finanztransfergeschäft); die Einordnung bestimmt Erlaubnisumfang, Kapital und Pflichten.",
		domain: "compliance",
		evidenceHints: ["Dienste-Mapping"],
		relatedRequirements: ["micar:Art.59"],
		sortOrder: 10,
	},
	{
		code: "§2",
		sectionCode: "ERL",
		title: "Ausnahmen prüfen",
		requirementText:
			"Bereichsausnahmen (z. B. begrenzte Netze, Handelsvertreter) werden geprüft und das Ergebnis dokumentiert; ggf. Anzeige an die BaFin bei Überschreiten der Schwellen.",
		domain: "compliance",
		evidenceHints: ["Abgrenzungsvermerk"],
		sortOrder: 20,
	},
	{
		code: "§10",
		sectionCode: "ERL",
		title: "Erlaubnisantrag",
		requirementText:
			"Der Erlaubnisantrag enthält u. a. Geschäftsplan mit Budget für drei Jahre, Beschreibung der Sicherungsmaßnahmen für Kundengelder, Governance und interne Kontrollmechanismen, Verfahren für Sicherheitsvorfälle und Beschwerden, Notfall- und Sicherheitskonzept, Angaben zu Geschäftsleitern, Inhabern bedeutender Beteiligungen und Auslagerungen.",
		domain: "compliance",
		appliesToRoles: [...FE],
		evidenceHints: ["Antragsdossier"],
		tools: {
			startup: ["BaFin-Antragsformulare", "Fachkanzlei"],
			scale: ["Klick Antrag"],
		},
		relatedRequirements: ["micar:Art.62-63"],
		sortOrder: 30,
	},
	{
		code: "§12",
		sectionCode: "ERL",
		title: "Anfangskapital",
		requirementText:
			"Das Anfangskapital beträgt je Zahlungsdienst 20 000, 50 000 oder 125 000 € (Akquisitionsgeschäft/Finanztransfer: 125 000 €) und ist bei Antragstellung nachzuweisen.",
		domain: "compliance",
		appliesToRoles: [...FE],
		evidenceHints: ["Kapitalnachweis", "Bankbestätigung"],
		relatedRequirements: ["micar:Art.67"],
		sortOrder: 40,
	},
	{
		code: "§14",
		sectionCode: "ERL",
		title: "Inhaberkontrolle",
		requirementText:
			"Der beabsichtigte Erwerb oder die Erhöhung einer bedeutenden Beteiligung wird unverzüglich angezeigt und von der BaFin innerhalb der Beurteilungsfrist geprüft; Angaben nach Inhaberkontrollverordnung.",
		domain: "governance",
		appliesToRoles: [...FE],
		evidenceHints: ["Anzeigen nach InhKontrollV"],
		relatedRequirements: ["micar:Art.83-85"],
		sortOrder: 50,
	},
	{
		code: "§15",
		sectionCode: "ERL",
		title: "Laufende Eigenmittel",
		requirementText:
			"Zahlungsinstitute halten laufend Eigenmittel nach einer der Methoden A, B oder C (PSD2-Anhang), mindestens jedoch das Anfangskapital; die Berechnung wird dokumentiert und gemeldet.",
		domain: "compliance",
		appliesToRoles: [...FE],
		evidenceHints: ["Eigenmittelberechnung"],
		tools: {
			startup: ["Excel-Modell", "Klick Eigenmittel"],
			scale: ["Regnology"],
		},
		relatedRequirements: ["micar:Art.67"],
		sortOrder: 60,
	},
	{
		code: "§17",
		sectionCode: "ORG",
		title: "Sicherung der Kundengelder",
		requirementText:
			"Entgegengenommene Gelder werden getrennt gehalten und bis zum Ende des folgenden Geschäftstags auf ein offenes Treuhandkonto bei einem Kreditinstitut eingezahlt oder durch Versicherung bzw. Garantie gesichert.",
		domain: "custody",
		appliesToRoles: [...FE],
		evidenceHints: ["Treuhandvertrag", "Abstimmungen"],
		relatedRequirements: ["zag-marisk:BTO1", "micar:Art.70"],
		sortOrder: 70,
	},
	{
		code: "§22-24",
		sectionCode: "ORG",
		title: "Rechnungslegung, Jahresabschlussprüfung, Prüferpflichten",
		requirementText:
			"Jahresabschluss und Lagebericht werden aufgestellt und geprüft; der Prüfer wird der BaFin angezeigt und prüft zusätzlich die Einhaltung der aufsichtlichen Pflichten (u. a. Kundengeldsicherung, Eigenmittel, Organisation, GwG).",
		domain: "compliance",
		appliesToRoles: [...FE],
		evidenceHints: ["Prüfungsbericht", "Prüferanzeige"],
		tools: { startup: ["Prüfer mit ZAG-Erfahrung"], scale: ["dieselben"] },
		sortOrder: 80,
	},
	{
		code: "§25",
		sectionCode: "ORG",
		title: "Agenten",
		requirementText:
			"Agenten werden der BaFin mit Angaben zu Person, Kontrollmechanismen und Geschäftsleitern angezeigt, vertraglich gebunden und überwacht; das Institut haftet für sie.",
		domain: "payments",
		appliesToRoles: ["financial_entity", "agent"],
		evidenceHints: ["Agentenverträge", "Anzeigen"],
		relatedRequirements: ["zag-marisk:BTO3"],
		sortOrder: 90,
	},
	{
		code: "§26",
		sectionCode: "ORG",
		title: "Auslagerung",
		requirementText:
			"Wesentliche betriebliche Aufgaben dürfen nur ausgelagert werden, wenn Qualität der Kontrollen und Aufsicht nicht beeinträchtigt werden; die Absicht ist der BaFin anzuzeigen, Verantwortung bleibt beim Institut.",
		domain: "supplier",
		appliesToRoles: [...FE],
		evidenceHints: ["Auslagerungsregister", "Anzeigen"],
		relatedRequirements: ["zag-marisk:AT9", "dora:Art.28(1-2)", "micar:Art.73"],
		sortOrder: 100,
	},
	{
		code: "§27",
		sectionCode: "ORG",
		title: "Ordnungsgemäße Geschäftsorganisation",
		requirementText:
			"Das Institut verfügt über eine ordnungsgemäße Geschäftsorganisation: Risikomanagement, interne Kontrollverfahren, Notfallkonzept, Dokumentation, EDV-gestützte Verfahren zur Geldwäscheprävention, Sicherungsmaßnahmen nach GwG (konkretisiert durch die ZAG-MaRisk).",
		domain: "governance",
		appliesToRoles: [...FE],
		evidenceHints: ["ZAG-MaRisk-Umsetzung"],
		relatedRequirements: ["zag-marisk:AT3", "zag-marisk:AT4.3.2", "gwg:§6"],
		sortOrder: 110,
	},
	{
		code: "§28",
		sectionCode: "ORG",
		title: "Anzeigepflichten",
		requirementText:
			"Änderungen bei Geschäftsleitern, Beteiligungen, Agenten, Zweigniederlassungen, Auslagerungen und wesentlichen Umständen werden der BaFin nach der Anzeigenverordnung unverzüglich angezeigt.",
		domain: "compliance",
		appliesToRoles: [...FE],
		evidenceHints: ["Anzeigenregister"],
		tools: { startup: ["BaFin-MVP"], scale: ["dieselben"] },
		relatedRequirements: ["micar:Art.69"],
		sortOrder: 120,
	},
	{
		code: "§29",
		sectionCode: "ORG",
		title: "Monatsausweise und Meldungen",
		requirementText:
			"Das Institut reicht bei der Bundesbank Monatsausweise und weitere Meldungen nach der Zahlungsinstituts-Rechnungslegungs- und Meldeverordnung fristgerecht ein.",
		domain: "compliance",
		appliesToRoles: [...FE],
		evidenceHints: ["Meldebelege"],
		tools: { startup: ["Bundesbank-ExtraNet"], scale: ["Regnology"] },
		sortOrder: 130,
	},
	{
		code: "§38-39",
		sectionCode: "ORG",
		title: "Passporting",
		requirementText:
			"Die Erbringung von Zahlungsdiensten in anderen EU-Staaten über Zweigniederlassung, Agenten oder grenzüberschreitend wird der BaFin notifiziert; die Aufnahme erfolgt nach Fristablauf.",
		domain: "compliance",
		appliesToRoles: [...FE],
		evidenceHints: ["Notifizierungen"],
		relatedRequirements: ["micar:Art.65"],
		sortOrder: 140,
	},
	{
		code: "§46",
		sectionCode: "ORG",
		title: "Zugang zu Zahlungssystemen",
		requirementText:
			"Der Zugang zu Zahlungssystemen (direkt oder indirekt über eine Sponsorbank) ist objektiv, verhältnismäßig und nichtdiskriminierend zu gewähren; Teilnahmeverträge und technische Anbindung sind dokumentiert.",
		domain: "payments",
		appliesToRoles: [...FE],
		evidenceHints: ["Teilnahmeverträge"],
		tools: {
			startup: ["Sponsorbank (z. B. Banking Circle)"],
			scale: ["Form3", "Volante"],
		},
		sortOrder: 150,
	},
	{
		code: "§48-52",
		sectionCode: "KUN",
		title: "Zahlungsauslöse- und Kontoinformationsdienste",
		requirementText:
			"Werden Zahlungsauslöse- oder Kontoinformationsdienste angeboten oder Konten für solche Dienste geführt, gelten Pflichten zu Schnittstellen, Authentifizierung, Datenverwendung und Haftung.",
		guidance:
			"Nur falls angeboten — sonst in der Anwendbarkeit mit Begründung auf „nicht anwendbar“ setzen.",
		domain: "payments",
		appliesToRoles: [...FE],
		evidenceHints: ["Schnittstellen-Dokumentation"],
		tools: { startup: ["finAPI", "Tink"], scale: ["dieselben"] },
		sortOrder: 160,
	},
	{
		code: "§53(1)",
		sectionCode: "SEC",
		title:
			"Risikominderung und Kontrollen für operationelle und Sicherheitsrisiken",
		requirementText:
			"Das Institut verfügt über angemessene Risikominderungsmaßnahmen und Kontrollmechanismen zur Beherrschung operationeller und sicherheitsrelevanter Risiken — unbeschadet DORA Kapitel II, das die IKT-Anforderungen bestimmt.",
		domain: "operations",
		appliesToRoles: [...FE],
		evidenceHints: ["Verweis auf DORA-Rahmenwerk"],
		relatedRequirements: ["dora:Art.6(1-4)", "dora:Art.9(1)"],
		sortOrder: 200,
	},
	{
		code: "§53(2)",
		sectionCode: "SEC",
		title:
			"Jährliche Bewertung der operationellen und Sicherheitsrisiken an die BaFin",
		requirementText:
			"Das Institut übermittelt der BaFin jährlich eine aktualisierte, umfassende Bewertung der operationellen und sicherheitsrelevanten Risiken und der Angemessenheit der Risikominderungsmaßnahmen (BaFin-Vorlage, Rundschreiben 05/2024).",
		domain: "compliance",
		appliesToRoles: [...FE],
		legalBasisRefs: ["BaFin RS 05/2024"],
		evidenceHints: ["Jahresbericht nach BaFin-Vorlage"],
		relatedRequirements: ["zag-marisk:BT3", "dora:Art.6(5)"],
		sortOrder: 210,
	},
	{
		code: "§54",
		sectionCode: "SEC",
		title: "Meldung schwerwiegender Betriebs- oder Sicherheitsvorfälle",
		requirementText:
			"Schwerwiegende Betriebs- oder Sicherheitsvorfälle werden gemeldet — für Zahlungsinstitute seit 17.01.2025 über das DORA-Meldewesen (Art. 19/23); Kunden werden bei Auswirkungen unverzüglich informiert.",
		domain: "incident",
		appliesToRoles: [...FE],
		evidenceHints: ["Meldungen über DORA-Verfahren"],
		relatedRequirements: ["dora:Art.19", "dora:Art.23"],
		sortOrder: 220,
	},
	{
		code: "§55",
		sectionCode: "SEC",
		title: "Starke Kundenauthentifizierung",
		requirementText:
			"Bei Online-Kontozugriff, elektronischen Zahlungsvorgängen und risikobehafteten Handlungen wird eine starke Kundenauthentifizierung (zwei von drei Faktoren, bei Fernzahlungen mit dynamischer Verknüpfung) verlangt; Ausnahmen nach RTS 2018/389 werden registriert.",
		domain: "fraud",
		appliesToRoles: [...FE],
		legalBasisRefs: ["RTS (EU) 2018/389"],
		evidenceHints: ["SCA-Konzept", "Ausnahmeregister"],
		tools: {
			startup: ["Netcetera 3DS", "Nevis"],
			scale: ["Transmit Security", "iProov"],
		},
		relatedRequirements: ["iso27001:A.8.5", "dora:Art.9(4)(d)"],
		sortOrder: 230,
	},
	{
		code: "RTS-Art.2",
		sectionCode: "SEC",
		title: "Transaktionsüberwachung zur Betrugserkennung",
		requirementText:
			"Mechanismen zur Transaktionsüberwachung erkennen nicht autorisierte oder betrügerische Zahlungsvorgänge anhand risikobasierter Faktoren (Kompromittierungslisten, Betrag, Muster, Malware-Anzeichen, Gerät).",
		domain: "fraud",
		appliesToRoles: [...FE],
		legalBasisRefs: ["RTS (EU) 2018/389 Art. 2"],
		evidenceHints: ["Regelwerk"],
		tools: { startup: ["SEON", "Sardine"], scale: ["Featurespace", "Feedzai"] },
		sortOrder: 240,
	},
	{
		code: "RTS-Art.3",
		sectionCode: "SEC",
		title: "Prüfung der Sicherheitsmaßnahmen",
		requirementText:
			"Die Umsetzung der Sicherheitsmaßnahmen wird dokumentiert, regelmäßig getestet und von unabhängigen Prüfer:innen bewertet; bei Nutzung der TRA-Ausnahme wird die Methodik geprüft.",
		domain: "fraud",
		appliesToRoles: [...FE],
		legalBasisRefs: ["RTS (EU) 2018/389 Art. 3"],
		evidenceHints: ["Prüfberichte"],
		relatedRequirements: ["dora:Art.24", "iso27001:9.2"],
		sortOrder: 250,
	},
	{
		code: "RTS-Art.18-21",
		sectionCode: "SEC",
		title: "Transaktionsrisikoanalyse (TRA)",
		requirementText:
			"Wird die TRA-Ausnahme genutzt, bleiben die Betrugsraten je Schwellenwert unter den Referenzwerten; sie werden vierteljährlich überwacht, Überschreitungen gemeldet und die Nutzung ggf. eingestellt.",
		domain: "fraud",
		appliesToRoles: [...FE],
		legalBasisRefs: ["RTS (EU) 2018/389 Art. 18–21"],
		evidenceHints: ["Betrugsquoten-Reports"],
		sortOrder: 260,
	},
	{
		code: "EBA-Betrug",
		sectionCode: "SEC",
		title: "Betrugsstatistik an die Bundesbank",
		requirementText:
			"Statistische Daten zu Betrugsfällen im Zahlungsverkehr werden halbjährlich nach den EBA-Leitlinien an die Bundesbank gemeldet.",
		domain: "compliance",
		appliesToRoles: [...FE],
		legalBasisRefs: ["EBA/GL/2018/05"],
		evidenceHints: ["Meldebelege"],
		tools: { startup: ["Bundesbank-ExtraNet"], scale: ["dieselben"] },
		sortOrder: 270,
	},
	{
		code: "§62",
		sectionCode: "KUN",
		title: "Beschwerdeverfahren",
		requirementText:
			"Zahlungsdienstleister richten ein Beschwerdeverfahren ein und beantworten Beschwerden grundsätzlich binnen 15 Geschäftstagen (in Ausnahmefällen 35) in Textform; Informationen zum Verfahren und zur Schlichtungsstelle werden bereitgestellt.",
		domain: "conduct",
		appliesToRoles: [...FE],
		evidenceHints: ["Beschwerderegister"],
		tools: { startup: ["Klick Beschwerden", "Zendesk"], scale: ["Freshdesk"] },
		relatedRequirements: ["micar:Art.71"],
		sortOrder: 300,
	},
	{
		code: "BGB-675c",
		sectionCode: "KUN",
		title: "Zivilrechtliche Informations- und Haftungspflichten",
		requirementText:
			"Vorvertragliche und laufende Informationspflichten (Art. 248 EGBGB), Haftung für nicht autorisierte Zahlungen, Erstattungsfristen und Preisangaben sind in AGB und Preisverzeichnis umgesetzt.",
		domain: "conduct",
		appliesToRoles: [...FE],
		evidenceHints: ["AGB", "Preis- und Leistungsverzeichnis"],
		sortOrder: 310,
	},

	// ── Ausblick ────────────────────────────────────────────────────────────
	{
		code: "VO2024-886",
		sectionCode: "AUS",
		title: "Echtzeitüberweisungen und Empfängerüberprüfung (VoP)",
		requirementText:
			"Zahlungs- und E-Geld-Institute müssen Echtzeitüberweisungen empfangen und senden können und vor Ausführung eine Empfängerüberprüfung anbieten; Gebühren dürfen Standardüberweisungen nicht übersteigen.",
		domain: "payments",
		appliesToRoles: [...FE],
		effectiveFrom: "2027-04-09",
		legalStatus: "upcoming",
		evidenceHints: ["Testnachweise", "Konfiguration"],
		sortOrder: 400,
	},
	{
		code: "PSD3",
		sectionCode: "AUS",
		title: "PSD3 / Payment Services Regulation",
		requirementText:
			"Das neue EU-Zahlungsdienstepaket soll PSD2 ablösen (einheitliches Regime für Zahlungs- und E-Geld-Dienste, Betrugsregeln, Datenzugang); Anwendungsbeginn nach Inkrafttreten mit Übergangsfrist — Erlaubnis kann Übergangsantrag erfordern.",
		domain: "compliance",
		appliesToRoles: [...FE],
		effectiveFrom: "2028-06-30",
		legalStatus: "draft",
		evidenceHints: ["Horizon-Scanning-Vermerk"],
		sortOrder: 410,
	},
];
