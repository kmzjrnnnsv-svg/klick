import type { CatalogControl } from "./types";

// Common Controls für die Finanz-Rahmenwerke (P4): AML, Sanktionen, Travel
// Rule, Kundenvermögen/Verwahrung, Schlüssel, Kapital, Meldewesen, Wohlver-
// halten, Betrug/SCA, Zahlungsverkehr, Steuer/Statistik, Abwicklung. Authoring-
// Quelle: docs/regulatory/anforderungskatalog-2026-10.md, Abschnitte 4–8.
// Produkte sind Marktbeispiele, keine Empfehlung im Rechtssinn.

let order = 3000;
const next = () => {
	order += 10;
	return order;
};

export const PART_C: CatalogControl[] = [
	// ── Governance / Risiko / Dienstleister (Ergänzungen) ───────────────────
	{
		code: "CC-GOV-22",
		title: "Fit & Proper der Leitung und Inhaberkontrolle",
		description:
			"Geschäftsleiter:innen und Inhaber:innen bedeutender Beteiligungen sind zuverlässig und fachlich geeignet; Unterlagen liegen vor, Änderungen und Schwellenüberschreitungen (10/20/30/50 %) werden der Aufsicht angezeigt.",
		implementationGuidance:
			"Fit-&-Proper-Checkliste je Person (Lebenslauf, Führungszeugnis < 3 Monate, GZR, Schuldnerverzeichnis, Erklärungen, Zeitbudget, Interessenkonflikte) im Rollenregister; Gesellschafterregister mit UBO-Kette und Schwellen-Uhr (60 Arbeitstage Inhaberkontrolle).",
		domain: "governance",
		effort: "M",
		kind: "organizational",
		evidenceHints: [
			"Fit-&-Proper-Unterlagen",
			"Anzeigen nach InhKontrollV",
			"Gesellschafterregister",
		],
		recommendations: [
			{
				level: "must",
				text: "Unterlagen vor Antragstellung vollständig; Gültigkeit der Führungszeugnisse überwachen (Task bei Ablauf).",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"Für welche Personen liegen vollständige Fit-&-Proper-Unterlagen vor, und wann laufen sie ab?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-23",
		title: "Geschäfts- und Risikostrategie",
		description:
			"Eine von der Leitung beschlossene Geschäftsstrategie und eine konsistente Risikostrategie (inkl. ESG- und Krypto-Risiken) werden jährlich überprüft und an das Aufsichtsorgan kommuniziert.",
		implementationGuidance:
			"Strategiedokument mit Zielen, Risikoappetit und Planungshorizont; jährlicher GL-Beschluss (Pflichtbeschluss RES-ZAG-STRATEGY) und Protokoll der Besprechung mit dem Aufsichtsorgan.",
		domain: "governance",
		effort: "M",
		kind: "documentation",
		evidenceHints: [
			"Strategiedokumente",
			"Jahresbeschluss",
			"Überprüfungsprotokoll",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-GOV-24",
		title: "Neue-Produkte-Prozess (NPP) und Anpassungsprozesse",
		description:
			"Neue Produkte, Märkte, Vertriebswege und wesentliche Änderungen durchlaufen vor Einführung eine Risikoanalyse mit Beteiligung von Risikocontrolling, Compliance, Geldwäscheprävention und IT; Testphase und Freigabe sind dokumentiert.",
		implementationGuidance:
			"NPP-Richtlinie mit Checkliste (Risiko, AML, Datenschutz, IKT, Meldepflichten), Freigabe-Workflow `change` mit Flag „meldepflichtig“.",
		domain: "governance",
		effort: "M",
		kind: "process",
		evidenceHints: ["NPP-Richtlinie", "Freigabeprotokolle", "Testkonzepte"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-RSK-06",
		title:
			"Risikotragfähigkeit und Finanzrisiken (Adressen-, Marktpreis-, Liquiditätsrisiko)",
		description:
			"Kapital und Liquidität decken die wesentlichen Risiken; Adressenausfall- und Konzentrationslimite, Marktpreisrisiken aus Krypto-/Stablecoin-Beständen und ein mehrjähriger Finanzierungsplan werden überwacht.",
		implementationGuidance:
			"Risikotragfähigkeitskonzept (Risikodeckungspotenzial vs. Risikokapital), Limitsystem je Gegenpartei und Token, Liquiditätsplanung mit Stress-Szenario; quartalsweise an die Leitung.",
		domain: "risk",
		effort: "L",
		kind: "process",
		evidenceHints: [
			"Risikotragfähigkeitskonzept",
			"Limitüberwachung",
			"Liquiditätsplanung",
		],
		tools: {
			startup: ["Excel/Python-Modell", "Agicap"],
			scale: ["msg GillardonBSM", "avedos risk2value", "Kyriba"],
		},
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-RSK-07",
		title: "Operationelle Risiken und Schadensfalldatenbank",
		description:
			"Operationelle Risiken werden systematisch identifiziert (Self-Assessments), Schadensfälle in einer Datenbank mit Ursache, Betrag und Wiedererlangung erfasst und an das Risikomanagement rückgekoppelt.",
		implementationGuidance:
			"Tab Schadensfälle in /risiken; jährliches Risk-Self-Assessment je Prozess; Schwellen für Ad-hoc-Berichte.",
		domain: "risk",
		effort: "M",
		kind: "process",
		evidenceHints: ["Schadensfalldatenbank", "Risk-Self-Assessments"],
		tools: {
			startup: ["Klick Schadensfälle"],
			scale: ["avedos risk2value", "OneTrust"],
		},
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-TPR-10",
		title:
			"Auslagerungsmanagement: Wesentlichkeit, Anzeige, Auslagerungsbeauftragte:r",
		description:
			"Jede Auslagerung wird vor Vertragsschluss auf Wesentlichkeit geprüft; wesentliche Auslagerungen werden der Aufsicht angezeigt, zentral gesteuert und ohne Delegation der Verantwortung überwacht.",
		implementationGuidance:
			"Auslagerungsregister (gemeinsam mit dem DORA-Informationsregister), Risikoanalyse je Auslagerung, Anzeige über BaFin-MVP, benannte:r Auslagerungsbeauftragte:r.",
		domain: "supplier",
		effort: "M",
		kind: "process",
		evidenceHints: [
			"Auslagerungsregister",
			"Wesentlichkeitsanalysen",
			"BaFin-Anzeigen",
		],
		tools: {
			startup: ["Klick Dienstleister + BaFin-Excel"],
			scale: ["OneTrust TPRM", "Mitratech Prevalent"],
		},
		testMethodHint: "inspection",
		sortOrder: next(),
	},

	// ── AML ──────────────────────────────────────────────────────────────────
	{
		code: "CC-AML-01",
		title: "Unternehmensweite Geldwäsche-Risikoanalyse",
		description:
			"Risiken aus Kunden, Produkten, Transaktionen, Kanälen und Ländern — einschließlich Krypto-Spezifika (Mixer, Privacy Coins, Self-hosted Wallets) — werden jährlich analysiert, bewertet und von der Leitung genehmigt.",
		implementationGuidance:
			"Versionierte Risikoanalyse in /aml mit Dimensionen und Maßnahmen je Risikoklasse; Länderrisiko aus dem Jurisdiktionsregister; GL-Freigabe (Pflichtbeschluss RES-GWG-RISK).",
		domain: "aml",
		effort: "L",
		kind: "documentation",
		evidenceHints: ["Risikoanalyse mit Version und Freigabe"],
		tools: {
			startup: ["Excel-Vorlage", "Klick AML"],
			scale: ["Fenergo", "Hawk AI Risikomodule"],
		},
		recommendations: [
			{
				level: "must",
				text: "Krypto-spezifische Risikofaktoren (Self-hosted Wallets, Mixer, Hochrisiko-Jurisdiktionen) explizit bewerten.",
				source: "BaFin",
			},
		],
		auditQuestions: [
			"Wann wurde die Risikoanalyse zuletzt aktualisiert und von wem genehmigt?",
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AML-02",
		title: "Interne Sicherungsmaßnahmen und AML-Handbuch",
		description:
			"Grundsätze, Verfahren und Kontrollen zur Verhinderung von Geldwäsche und Terrorismusfinanzierung sind dokumentiert, Mitarbeitende werden zuverlässigkeitsgeprüft und regelmäßig geschult, ein Hinweisgebersystem besteht.",
		implementationGuidance:
			"AML-Handbuch als gelenktes Dokument, jährliche Pflichtschulung, Hinweisgeberkanal (/beschwerden), Zuverlässigkeitsprüfung im Onboarding-Paket.",
		domain: "aml",
		effort: "M",
		kind: "documentation",
		evidenceHints: ["AML-Handbuch", "Schulungsnachweise", "Hinweisgeberkanal"],
		tools: {
			startup: ["ACAMS", "lawpilots", "EQS Integrity Line"],
			scale: ["LegalTegrity"],
		},
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AML-03",
		title: "Geldwäschebeauftragte:r mit Stellvertretung",
		description:
			"Eine Geldwäschebeauftragte oder ein Geldwäschebeauftragter auf Führungsebene und eine Stellvertretung sind bestellt, der BaFin angezeigt und mit Befugnissen, Ressourcen und direktem Zugang zur Leitung ausgestattet.",
		implementationGuidance:
			"Rollenregister-Eintrag mit Bestellungsschreiben, BaFin-Anzeige als Nachweis, jährlicher Bericht an die Leitung (Pflichten-Kalender).",
		domain: "aml",
		effort: "S",
		kind: "organizational",
		evidenceHints: ["Bestellungsschreiben", "BaFin-Anzeige", "Jahresbericht"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AML-04",
		title: "Kunden-Sorgfaltspflichten (KYC/KYB) und Risikoklassifizierung",
		description:
			"Kunden werden identifiziert, wirtschaftlich Berechtigte ermittelt, Zweck und Art der Geschäftsbeziehung erfasst, PEP-Status geprüft und das Risiko klassifiziert; vereinfachte und verstärkte Sorgfalt sind definiert und begründet.",
		implementationGuidance:
			"KYC/KYB-Arbeitsanweisung mit Risikoklassen und Prüfschritten; AMLR-fähiges Datenmodell (RTS zu Art. 28); EDD-Akten für Hochrisikokunden.",
		domain: "aml",
		effort: "L",
		kind: "process",
		evidenceHints: [
			"KYC/KYB-Arbeitsanweisung",
			"Stichproben-Akten",
			"EDD-Dokumentation",
		],
		tools: { startup: ["Sumsub", "IDnow"], scale: ["Fenergo"] },
		recommendations: [
			{
				level: "should",
				text: "Datenmodell schon jetzt an die AMLA-RTS zu Art. 28 AMLR ausrichten, um 2027 keine Migration zu brauchen.",
				source: "intern",
			},
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AML-05",
		title: "Identifizierungsverfahren (Video-Ident, eID, QES)",
		description:
			"Die Identität natürlicher und juristischer Personen wird mit aufsichtskonformen Verfahren überprüft; Protokolle werden aufbewahrt.",
		implementationGuidance:
			"Nur BaFin-anerkannte Verfahren einsetzen; Ident-Protokolle an die Kundenakte binden; Dienstleister als Auslagerung steuern.",
		domain: "aml",
		effort: "M",
		kind: "technical",
		evidenceHints: ["Ident-Protokolle", "Verfahrensbeschreibung"],
		tools: { startup: ["IDnow", "WebID", "Nect"], scale: ["Sumsub", "Veriff"] },
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AML-06",
		title: "Transaktionsmonitoring (Fiat und On-Chain)",
		description:
			"Fiat- und Kryptotransaktionen werden EDV-gestützt gegen ein dokumentiertes Regelwerk überwacht (Schwellen, Muster, Blockchain-Analytics); Alerts werden bearbeitet, Regeln werden getunt.",
		implementationGuidance:
			"Monitoring-Regelwerk in /aml mit Rechtsgrundlage je Regel, Owner und Tuning-Datum; Betrieb in KYT-/TM-Systemen als gesteuerte Dienstleister.",
		domain: "aml",
		effort: "L",
		kind: "technical",
		evidenceHints: [
			"Monitoring-Regelwerk",
			"Alert-Bearbeitung",
			"Analytics-Konfiguration",
		],
		tools: {
			startup: ["Hawk AI", "ComplyAdvantage", "Chainalysis KYT", "Elliptic"],
			scale: ["Feedzai", "Napier", "TRM Labs"],
		},
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-AML-07",
		title: "Verdachtsmeldung, Durchführungsverbot und Tipping-off-Verbot",
		description:
			"Verdachtsfälle werden unverzüglich an die FIU (goAML) gemeldet, Transaktionen bis zur Zustimmung oder Fristablauf (drei Werktage) zurückgehalten; Mitarbeitende dürfen Betroffene nicht informieren.",
		implementationGuidance:
			"SAR-Workflow mit Stillhalte-Logik im Core-System, goAML-Registrierung, Register ohne Kunden-PII (/aml Verdachtsmeldungen), Mitarbeiterweisung Tipping-off.",
		domain: "aml",
		effort: "M",
		kind: "process",
		evidenceHints: ["SAR-Workflow", "goAML-Belege", "Stillhalte-Protokolle"],
		tools: { startup: ["goAML-Portal"], scale: ["Hawk AI", "Unit21"] },
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-AML-08",
		title: "Aufzeichnung und Aufbewahrung (fünf Jahre)",
		description:
			"Sorgfalts-, Transaktions- und Travel-Rule-Daten werden vollständig aufgezeichnet und fünf Jahre revisionssicher aufbewahrt; Löschkonzept berücksichtigt die Vorrangregel vor DSGVO-Löschfristen.",
		implementationGuidance:
			"Archivkonzept mit WORM-Speicher; Retention-Job nimmt GwG-pflichtige Daten aus; Löschkonzept dokumentiert die Abwägung.",
		domain: "aml",
		effort: "S",
		kind: "technical",
		evidenceHints: ["Archivkonzept", "Aufbewahrungsnachweise"],
		tools: { startup: ["S3 Object Lock"], scale: ["Revisionssicheres Archiv"] },
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AML-09",
		title: "Transparenzregister-Einsicht und Unstimmigkeitsmeldung",
		description:
			"Bei Firmenkunden wird das Transparenzregister eingesehen; Abweichungen zu den eigenen Feststellungen werden als Unstimmigkeitsmeldung gemeldet.",
		implementationGuidance:
			"KYB-Schritt mit Registerauszug; Unstimmigkeitsmeldung als dokumentierter Prozessschritt mit Frist.",
		domain: "aml",
		effort: "S",
		kind: "process",
		evidenceHints: ["Registerauszüge", "Unstimmigkeitsmeldungen"],
		tools: {
			startup: ["Transparenzregister-Portal", "North Data"],
			scale: ["Moody's Orbis"],
		},
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-AML-10",
		title: "Ausführung von Sorgfaltspflichten durch Dritte",
		description:
			"Werden Sorgfaltspflichten durch Dritte oder Dienstleister ausgeführt, bleibt die Verantwortung beim Verpflichteten; Verträge, Kontrollen und Datenzugriff sind geregelt.",
		implementationGuidance:
			"Vertrag mit Kontroll- und Auskunftsrechten, Stichprobenprüfung der Dienstleister-Akten, Eintrag im Auslagerungsregister.",
		domain: "aml",
		effort: "S",
		kind: "organizational",
		evidenceHints: ["Vertrag", "Kontrollnachweise"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},

	// ── Sanktionen ───────────────────────────────────────────────────────────
	{
		code: "CC-SAN-01",
		title: "Sanktions- und PEP-Screening",
		description:
			"Kunden, wirtschaftlich Berechtigte, Gegenparteien und Wallet-Adressen werden beim Onboarding und täglich gegen EU-, UN-, OFAC- und nationale Listen sowie PEP-Datenbanken geprüft; Treffer werden dokumentiert bearbeitet.",
		implementationGuidance:
			"Automatisierter Tageslauf mit Nachweis (control_tests method automated), Vier-Augen bei Trefferfreigabe, Fuzzy-Matching-Schwellen dokumentiert.",
		domain: "aml",
		effort: "M",
		kind: "technical",
		evidenceHints: ["Screening-Protokolle", "Trefferbearbeitung"],
		tools: {
			startup: ["ComplyAdvantage"],
			scale: ["LSEG World-Check", "Dow Jones R&C"],
		},
		testMethodHint: "automated",
		sortOrder: next(),
	},
	{
		code: "CC-SAN-02",
		title: "Länderrisiko, Hochrisikoländer und Embargos",
		description:
			"Jurisdiktionen sind nach EU-Hochrisikoliste, FATF-Status, Sanktionen und eigener Risikoeinschätzung klassifiziert; blockierte Länder und verstärkte Sorgfalt sind systemisch durchgesetzt.",
		implementationGuidance:
			"Jurisdiktionsregister (/aml Länder & Korridore) mit orgStance; Änderungen der EU-Liste erzeugen eine Aufgabe an den GWB.",
		domain: "aml",
		effort: "M",
		kind: "process",
		evidenceHints: ["Jurisdiktionsregister", "Änderungsprotokoll"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},

	// ── Travel Rule / Transfers ──────────────────────────────────────────────
	{
		code: "CC-TR-01",
		title: "Travel-Rule-Begleitdaten bei Kryptowertetransfers",
		description:
			"Bei jedem Kryptowertetransfer werden Originator- und Begünstigtendaten ohne Schwellenwert sicher und vor oder mit dem Transfer übermittelt; fehlende Daten werden erkannt, zurückgewiesen oder ausgesetzt.",
		implementationGuidance:
			"Travel-Rule-Protokoll (IVMS101) über Dienstleister, Regelwerk für fehlende Daten, Fallakten; Zwischenschaltung dokumentiert.",
		domain: "payments",
		effort: "M",
		kind: "technical",
		evidenceHints: ["Travel-Rule-Konzept", "Protokoll-Logs", "Fallakten"],
		tools: {
			startup: ["Notabene", "Sumsub Travel Rule", "TRISA"],
			scale: ["21 Analytics", "GTR"],
		},
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-TR-02",
		title: "Umgang mit selbst gehosteten Adressen",
		description:
			"Transfers von oder an selbst gehostete Adressen über 1 000 € werden auf Eigentum bzw. Kontrolle des Kunden geprüft; Risikominderungsmaßnahmen sind definiert.",
		implementationGuidance:
			"Ownership-Nachweis per Message Signing oder Satoshi-Test, Richtlinie für Self-hosted Wallets (AMLR Art. 40 vorbereitet).",
		domain: "payments",
		effort: "M",
		kind: "technical",
		evidenceHints: ["Ownership-Nachweise", "Self-hosted-Wallet-Richtlinie"],
		tools: { startup: ["Notabene", "21 Analytics"], scale: ["dieselben"] },
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-TR-03",
		title: "Begleitdaten bei Geldtransfers (Fiat)",
		description:
			"Geldtransfers tragen vollständige Angaben zu Zahler und Zahlungsempfänger; unvollständige Transfers werden erkannt, zurückgewiesen oder ausgesetzt, wiederholte Verstöße gemeldet.",
		implementationGuidance:
			"SEPA-Felder im Payment-Hub konfiguriert, Prüfregeln für fehlende Angaben, Meldeweg.",
		domain: "payments",
		effort: "S",
		kind: "technical",
		evidenceHints: ["Zahlungsnachrichten-Konfiguration", "Prüfregeln"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},

	// ── Kundenvermögen / Verwahrung / Schlüssel ─────────────────────────────
	{
		code: "CC-CUS-01",
		title: "Trennung und Sicherung von Kundengeldern und Kundenkryptowerten",
		description:
			"Kundengelder liegen auf einem Treuhandkonto bei einem Kreditinstitut (Eingänge direkt, keine Eigenmittel), Kundenkryptowerte sind von eigenen Bestände getrennt verwahrt und werden nicht für eigene Rechnung genutzt.",
		implementationGuidance:
			"Treuhandvertrag, Omnibus-/Einzel-Wallets mit Segregationskonzept, Kontennachweise; Gelder bis Ende des Folgetags beim Kreditinstitut.",
		domain: "custody",
		effort: "L",
		kind: "process",
		evidenceHints: [
			"Treuhandvertrag",
			"Segregationskonzept",
			"Kontennachweise",
		],
		tools: {
			startup: ["Treuhandkonto bei CRR-Institut", "Fireblocks"],
			scale: ["Taurus", "BitGo"],
		},
		recommendations: [
			{
				level: "must",
				text: "Keine Eigenmittel auf dem Treuhandkonto; Vertrag regelt Insolvenzfestigkeit ausdrücklich.",
				source: "BaFin",
			},
		],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-CUS-02",
		title: "Verwahrrichtlinie, Kundenregister und Positionsauszüge",
		description:
			"Eine Verwahrrichtlinie regelt Verfahren und Haftung; je Kunde besteht ein Positionsregister, Kunden erhalten regelmäßige Positionsauszüge; Verluste werden bis zum Marktwert ersetzt.",
		implementationGuidance:
			"Verwahrrichtlinie als gelenktes Dokument, Kundenregister im System, quartalsweise Auszüge (Pflicht OBL-MICAR-STATEMENTS), Versicherung/Eigenmittel für Haftung.",
		domain: "custody",
		effort: "M",
		kind: "documentation",
		evidenceHints: ["Verwahrrichtlinie", "Positionsregister", "Kontoauszüge"],
		tools: {
			startup: ["Fireblocks", "Tangany", "Finoa"],
			scale: ["Taurus", "Ledger Enterprise"],
		},
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-CUS-03",
		title: "Tägliche Abstimmung von Kundengeldern und Positionen",
		description:
			"Kundengelder und Kundenpositionen werden täglich gegen Treuhandkonto und On-Chain-Bestände abgestimmt — durch eine Stelle außerhalb des operativen Betriebsbereichs; Differenzen werden eskaliert.",
		implementationGuidance:
			"Reconciliation-Job mit Protokoll, Vier-Augen-Prüfung, Prozess P-11; Differenzschwellen und Eskalationsweg definiert.",
		domain: "custody",
		effort: "M",
		kind: "process",
		evidenceHints: ["Reconciliation-Nachweise", "Eskalationsprotokolle"],
		tools: { startup: ["eigene Ledger-Logik"], scale: ["Kyriba", "Fragment"] },
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-KEY-01",
		title: "Schlüsselverwaltung für Kundenkryptowerte und Schlüsselzeremonie",
		description:
			"Private Schlüssel werden in HSM/MPC erzeugt, verteilt, rotiert und vernichtet; Zeremonien laufen unter Vier-Augen-Prinzip mit Protokoll, Backups liegen getrennt, Zugriff ist rollenbasiert.",
		implementationGuidance:
			"Schlüsselkonzept, Zeremonie-Protokolle, Schlüsselinventar in /assets (Typ key_material/hsm) mit Rotationsfälligkeit; Aufgabenpaket KEY_CEREMONY.",
		domain: "crypto",
		effort: "L",
		kind: "technical",
		evidenceHints: [
			"Schlüsselkonzept",
			"Zeremonie-Protokolle",
			"Schlüsselinventar",
		],
		tools: {
			startup: ["Fireblocks (MPC)", "AWS CloudHSM"],
			scale: ["Utimaco", "Thales Luna", "Taurus"],
		},
		testMethodHint: "inspection",
		sortOrder: next(),
	},

	// ── Kapital / Meldewesen / Antrag ────────────────────────────────────────
	{
		code: "CC-CAP-01",
		title: "Anfangskapital und laufende Eigenmittel",
		description:
			"Anfangskapital und laufende Eigenmittelanforderungen (MiCAR-Dienstklasse oder ¼ der fixen Gemeinkosten; ZAG-Methode A/B/C) werden berechnet, eingehalten, überwacht und gemeldet.",
		implementationGuidance:
			"/eigenmittel mit Quartalsberechnung und GL-Freigabe (Workflow own_funds), Puffer definiert, Meldung nach Pflichten-Kalender.",
		domain: "compliance",
		effort: "M",
		kind: "process",
		evidenceHints: ["Kapitalberechnung", "Kapitalnachweis", "Meldebelege"],
		tools: {
			startup: ["Excel-Modell", "Klick Eigenmittel"],
			scale: ["Regnology"],
		},
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-REG-01",
		title: "Anzeige- und Meldepflichten an die Aufsicht",
		description:
			"Änderungen der Leitung, Beteiligungen, Auslagerungen, Agenten und des Geschäftsmodells werden fristgerecht angezeigt; Monatsausweise und Statistiken werden abgegeben; ein Anzeigenregister weist die Erfüllung nach.",
		implementationGuidance:
			"Anzeigenregister aus /organisation Tab Aufsicht, Pflichten-Kalender mit Läufen (Monatsausweis, Statistik), Workflow `change` mit Flag meldepflichtig.",
		domain: "compliance",
		effort: "M",
		kind: "process",
		evidenceHints: ["Anzeigenregister", "Meldebelege", "MVP-Bestätigungen"],
		tools: {
			startup: ["BaFin-MVP", "Bundesbank-ExtraNet"],
			scale: ["Regnology"],
		},
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-REG-02",
		title:
			"Jahresbericht operationelle und Sicherheitsrisiken, Risikoberichterstattung",
		description:
			"Jährlich wird eine umfassende Bewertung der operationellen und Sicherheitsrisiken an die BaFin übermittelt und ein Risikobericht an Leitung und Aufsichtsorgan erstellt; Ad-hoc-Berichte bei wesentlichen Ereignissen.",
		implementationGuidance:
			"BaFin-Vorlage (RS 05/2024) aus Risiko- und Vorfallregister befüllen; Risikobericht BT 3 als Pflichten-Lauf mit Nachweis.",
		domain: "compliance",
		effort: "M",
		kind: "documentation",
		evidenceHints: ["Jahresbericht nach BaFin-Vorlage", "Risikobericht"],
		tools: { startup: ["Klick Export"], scale: ["Power BI", "GRC-Reporting"] },
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-REG-03",
		title: "Zulassungsantrag und Antragsdossier",
		description:
			"Der Erlaubnis-/Zulassungsantrag ist vollständig (Geschäftsplan, Governance, Fit & Proper, IKT, AML, Sicherung der Kundengelder, Beschwerden, Interessenkonflikte, Auslagerungen, Eigenmittel) und mit Nachweisen hinterlegt; Status und Lücken sind sichtbar.",
		implementationGuidance:
			"/antrag mit Mappen MiCAR Art. 62 und ZAG § 10; jeder Bestandteil verknüpft Dokumente, Nachweise, Controls und Register; Vollständigkeits-%.",
		domain: "compliance",
		effort: "L",
		kind: "documentation",
		evidenceHints: ["Antragsdossier", "Vollständigkeitsübersicht"],
		tools: {
			startup: ["Fachanwaltskanzlei", "Klick Antrag"],
			scale: ["Jira-Projektsteuerung"],
		},
		testMethodHint: "inspection",
		sortOrder: next(),
	},

	// ── Wohlverhalten / Kundenbeziehung ─────────────────────────────────────
	{
		code: "CC-CND-01",
		title:
			"Ehrliches, redliches und professionelles Handeln; faire Information und Marketing",
		description:
			"Kundeninformationen und Marketingmitteilungen sind fair, klar, nicht irreführend und enthalten Risikohinweise; Marketing durchläuft eine Compliance-Freigabe.",
		implementationGuidance:
			"Workflow `marketing` (Vertrieb → Compliance), Register der Werbemittel als Nachweise, Standard-Risikohinweise.",
		domain: "conduct",
		effort: "M",
		kind: "process",
		evidenceHints: ["Marketing-Freigabeprozess", "Risikohinweise"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-CND-02",
		title: "Offenlegung der Nachhaltigkeitsindikatoren",
		description:
			"Klima- und umweltbezogene Indikatoren der genutzten Konsensmechanismen werden auf der Website veröffentlicht und jährlich aktualisiert; die Datenquelle ist dokumentiert.",
		implementationGuidance:
			"Offenlegungsseite je unterstütztem Netzwerk mit CCRI-Daten; Pflichten-Lauf OBL-MICAR-SUSTAINABILITY.",
		domain: "conduct",
		effort: "S",
		kind: "documentation",
		evidenceHints: ["Offenlegungsseite", "Datenquelle"],
		tools: { startup: ["CCRI MiCA-Daten"], scale: ["dieselben"] },
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-CND-03",
		title:
			"Geschäftspolitik, Preisveröffentlichung, Best Execution und Transfer-AGB",
		description:
			"Für Tausch, Auftragsausführung und Transfers bestehen nichtdiskriminierende Geschäftspolitik, veröffentlichte Preise bzw. Methodik, eine Best-Execution-Richtlinie mit Monitoring und Kundenverträge mit Rechten, Pflichten, Gebühren und Fristen.",
		implementationGuidance:
			"Dokumentvorlagen Geschäftspolitik Tausch, Best Execution, Transfer-AGB; Veröffentlichung auf der Website; Monitoring-Stichproben.",
		domain: "conduct",
		effort: "M",
		kind: "documentation",
		evidenceHints: [
			"Geschäftspolitik",
			"Best-Execution-Richtlinie",
			"Transfer-AGB",
		],
		tools: {
			startup: ["B2C2", "Flowdesk", "Kaiko"],
			scale: ["Wyden", "Talos"],
		},
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-CND-04",
		title: "Marktmissbrauchsprävention und STOR",
		description:
			"Insiderhandel, unrechtmäßige Offenlegung und Marktmanipulation sind verboten und durch Mitarbeiterleitlinien, Handelsverbote und Überwachungssysteme adressiert; verdächtige Aufträge und Geschäfte werden der BaFin gemeldet (STOR).",
		implementationGuidance:
			"Surveillance-Konzept, Alarmprotokolle, STOR-Register ohne PII (/aml Verdachtsmeldungen kind micar_stor), Mitarbeitergeschäfte-Richtlinie.",
		domain: "conduct",
		effort: "M",
		kind: "technical",
		evidenceHints: [
			"Surveillance-Konzept",
			"Alarmprotokolle",
			"STOR-Meldungen",
		],
		tools: {
			startup: ["Solidus Labs"],
			scale: ["Eventus", "b-next", "Nasdaq Trade Surveillance"],
		},
		testMethodHint: "reperformance",
		sortOrder: next(),
	},
	{
		code: "CC-CND-05",
		title: "Beschwerdeverfahren mit Fristen",
		description:
			"Kunden können kostenlos Beschwerden einreichen; das Verfahren ist veröffentlicht, Beschwerden werden registriert, fristgerecht bestätigt und beantwortet, ausgewertet und berichtet.",
		implementationGuidance:
			"/beschwerden mit Uhren (Bestätigung, Antwort binnen zwei Monaten bzw. 15 Geschäftstagen bei Zahlungsdiensten), Beschwerderichtlinie als Vorlage, quartalsweise Auswertung.",
		domain: "conduct",
		effort: "M",
		kind: "process",
		evidenceHints: ["Beschwerderichtlinie", "Beschwerderegister", "Auswertung"],
		tools: {
			startup: ["Klick Beschwerden", "Zendesk"],
			scale: ["Salesforce Service Cloud"],
		},
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-CND-06",
		title: "Interessenkonflikte erkennen, verhindern, offenlegen",
		description:
			"Interessenkonflikte zwischen Unternehmen, Mitarbeitenden, Anteilseignern und Kunden werden identifiziert, durch Maßnahmen gemindert, offengelegt und in einem Register überprüft.",
		implementationGuidance:
			"Interessenkonfliktrichtlinie, Register in /organisation, jährliche Überprüfung, Mitarbeitergeschäfte-Regeln.",
		domain: "conduct",
		effort: "M",
		kind: "documentation",
		evidenceHints: ["Interessenkonfliktrichtlinie", "Konfliktregister"],
		tools: {
			startup: ["Klick Organisation"],
			scale: ["StarCompliance", "MCO"],
		},
		testMethodHint: "inspection",
		sortOrder: next(),
	},

	// ── Betrug / SCA ─────────────────────────────────────────────────────────
	{
		code: "CC-FRD-01",
		title: "Betrugsprävention und starke Kundenauthentifizierung",
		description:
			"Zahlungsvorgänge sind durch starke Kundenauthentifizierung (zwei von drei Faktoren, dynamische Verknüpfung) und Transaktionsüberwachung zur Betrugserkennung geschützt; Ausnahmen sind registriert; eine Kontaktstelle für sicherheitsrelevante Kundenbeschwerden besteht.",
		implementationGuidance:
			"SCA-Konzept mit Ausnahmeregister, Fraud-Regelwerk, Kundenkontaktstelle; Prüfberichte der Sicherheitsmaßnahmen.",
		domain: "fraud",
		effort: "L",
		kind: "technical",
		evidenceHints: [
			"SCA-Konzept",
			"Ausnahmeregister",
			"Fraud-Konzept",
			"Prüfberichte",
		],
		tools: {
			startup: ["SEON", "Sardine", "Netcetera 3DS"],
			scale: ["Featurespace", "Feedzai", "Nevis", "Transmit Security"],
		},
		testMethodHint: "pentest",
		sortOrder: next(),
	},
	{
		code: "CC-FRD-02",
		title: "Transaktionsrisikoanalyse (TRA) und Betrugsstatistik",
		description:
			"Betrugsraten je Ausnahmeschwelle werden quartalsweise berechnet und überwacht, Überschreitungen gemeldet; die Betrugsstatistik wird halbjährlich an die Bundesbank übermittelt.",
		implementationGuidance:
			"TRA-Quartalslauf und EBA-Betrugsstatistik als Pflichten-Läufe; Fraud-Plattform mit TRA-Reporting.",
		domain: "fraud",
		effort: "M",
		kind: "process",
		evidenceHints: ["Betrugsquoten-Reports", "Meldebelege"],
		tools: {
			startup: ["Fraud-Plattform mit TRA-Reporting"],
			scale: ["dieselben"],
		},
		testMethodHint: "reperformance",
		sortOrder: next(),
	},

	// ── Zahlungsverkehr / Kasse ──────────────────────────────────────────────
	{
		code: "CC-PAY-01",
		title: "Zahlungssystemzugang, Agenten und Passporting",
		description:
			"Der Zugang zu Zahlungssystemen (direkt oder über Sponsorbank) ist vertraglich gesichert; Agenten sind angezeigt, vertraglich gebunden und kontrolliert; grenzüberschreitende Erbringung ist notifiziert.",
		implementationGuidance:
			"Teilnahme-/Sponsorverträge, Agentenregister mit Kontrollnachweisen, Passporting-Notifizierungen als Aufsichtskontakte.",
		domain: "payments",
		effort: "M",
		kind: "organizational",
		evidenceHints: ["Teilnahmeverträge", "Agentenverträge", "Notifizierungen"],
		tools: {
			startup: ["Banking Circle (Sponsor)"],
			scale: ["Form3", "Volante"],
		},
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-PAY-02",
		title: "Kassenrecht: TSE, DSFinV-K, Belegausgabe, Verfahrensdokumentation",
		description:
			"Die Händlerkasse nutzt eine zertifizierte technische Sicherheitseinrichtung, exportiert nach DSFinV-K, gibt Belege aus, ist dem Finanzamt gemeldet und durch eine GoBD-Verfahrensdokumentation beschrieben.",
		implementationGuidance:
			"TSE-Zertifikat, DSFinV-K-Testexport, Belegausgabe-Konfiguration, Kassenmeldung, Verfahrensdokumentation als gelenktes Dokument.",
		domain: "payments",
		effort: "M",
		kind: "technical",
		evidenceHints: [
			"TSE-Zertifikat",
			"DSFinV-K-Export",
			"Verfahrensdokumentation",
		],
		tools: { startup: ["fiskaly", "Swissbit TSE"], scale: ["dieselben"] },
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-PAY-03",
		title: "Echtzeitüberweisungen und Empfängerüberprüfung (VoP)",
		description:
			"Empfang und Versand von Echtzeitüberweisungen sowie die Empfängerüberprüfung sind fristgerecht umgesetzt; Gebühren entsprechen der Verordnung.",
		implementationGuidance:
			"VoP-Dienst im Payment-Hub, Instant-Fähigkeit, Testnachweise vor dem Stichtag 09.04.2027.",
		domain: "payments",
		effort: "M",
		kind: "technical",
		evidenceHints: ["Testnachweise", "Konfiguration"],
		tools: { startup: ["Form3"], scale: ["Volante"] },
		testMethodHint: "reperformance",
		sortOrder: next(),
	},

	// ── Steuer / Statistik / Abwicklung ─────────────────────────────────────
	{
		code: "CC-TAX-01",
		title: "DAC8-Meldepflichten (KStTG)",
		description:
			"Als meldender Kryptowerte-Dienstleister sind Registrierung, Sorgfaltspflichten (Selbstauskünfte der Nutzer), jährliche Meldung an das BZSt und Information der Nutzer umgesetzt.",
		implementationGuidance:
			"Registrierung beim BZSt, Selbstauskunft im Onboarding, Datenerhebung seit 01.01.2026, Meldung bis 31.07. als Pflichten-Lauf.",
		domain: "compliance",
		effort: "M",
		kind: "process",
		evidenceHints: ["BZSt-Registrierung", "Meldebelege", "Selbstauskünfte"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-STAT-01",
		title: "Außenwirtschafts- und Zahlungsverkehrsmeldungen",
		description:
			"Grenzüberschreitende Zahlungen über 50 000 € werden nach AWV gemeldet, die Zahlungsverkehrsstatistik wird fristgerecht abgegeben.",
		implementationGuidance:
			"Monatliche AWV-Meldung und halbjährliche Statistik als Pflichten-Läufe mit Nachweis; Datenextrakt aus dem Payment-Hub.",
		domain: "compliance",
		effort: "S",
		kind: "process",
		evidenceHints: ["Meldebelege"],
		tools: { startup: ["Bundesbank-ExtraNet"], scale: ["Regnology"] },
		testMethodHint: "inspection",
		sortOrder: next(),
	},
	{
		code: "CC-WND-01",
		title: "Plan für die geordnete Abwicklung",
		description:
			"Ein Abwicklungsplan beschreibt, wie Dienste geordnet eingestellt, Kundenvermögen zurückgegeben und Verpflichtungen erfüllt werden; er wird jährlich überprüft.",
		implementationGuidance:
			"Dokumentvorlage Abwicklungsplan Art. 74 mit Auslösern, Rollen, Kundenkommunikation und Zeitplan; Verknüpfung zu Notfallplänen.",
		domain: "continuity",
		effort: "M",
		kind: "documentation",
		evidenceHints: ["Abwicklungsplan"],
		testMethodHint: "inspection",
		sortOrder: next(),
	},
];
