// /funktionen — alle Abläufe in Klick, öffentlich erklärt. Jeder Ablauf:
// was ihn auslöst, welche Schritte folgen, was am Ende prüfbar vorliegt und
// wo er in der App liegt. Inhalt in Du-Form (Test tests/marketing-workflows),
// Stand der Funktionen wie in CLAUDE.md beschrieben — bei neuen Abläufen hier
// ergänzen.

export type Workflow = {
	key: string;
	name: string;
	summary: string;
	where: string;
	trigger: string;
	steps: string[];
	result: string;
};

export type WorkflowGroup = {
	key: string;
	title: string;
	lead: string;
	tone: "blue" | "brown" | "sky" | "ink";
	image: { src: string; w: number; h: number; alt: string };
	workflows: Workflow[];
};

export const WORKFLOW_GROUPS: WorkflowGroup[] = [
	{
		key: "start",
		title: "Einstieg",
		lead: "Vom ersten Link bis zum Arbeitsvorrat, ohne Passwort.",
		tone: "blue",
		image: {
			src: "/leistungen/frage.jpg",
			w: 1648,
			h: 1054,
			alt: "Gap-Analyse in Klick: eine Frage je Control mit Antwort und Nachweis",
		},
		workflows: [
			{
				key: "login",
				name: "Anmelden mit Passkey",
				summary:
					"Fingerabdruck, Gesicht oder Geräte-PIN statt Passwort. Der Passkey zählt als beide Faktoren.",
				where: "Anmeldung",
				trigger: "Einladungs- oder Aktivierungslink, danach jede Anmeldung.",
				steps: [
					"Link öffnen; der Zugang steht im Teil nach „#“ und erreicht nie ein Server-Log.",
					"Passkey auf dem Gerät anlegen, mit Nutzerverifikation.",
					"Anmelden mit einem Klick; das Feld schlägt gespeicherte Passkeys selbst vor.",
					"Kein Passkey zur Hand: Notweg per Mail-Link, nur für bestehende Konten.",
				],
				result:
					"Ein Konto ohne Passwort; Sitzung höchstens 12 Stunden, nach 30 Minuten Leerlauf neu anmelden.",
			},
			{
				key: "setup",
				name: "Geführte Einrichtung",
				summary:
					"Sieben Schritte, die sofort in Register und Profil speichern und am Ende die Rahmenwerke vorschlagen.",
				where: "Einrichtung",
				trigger: "Eine neue Organisation ist angelegt.",
				steps: [
					"Rollen und Rechte: Funktionsträger:innen benennen oder einladen.",
					"Unternehmen und Größe: Einstufung nach KMU-Grenzen, NIS2 und DORA als Orientierung.",
					"Standorte, Tätigkeit mit Lizenzstufe und Krypto-Diensten, IT, Dienstleister und Daten.",
					"Rahmenwerk-Vorschlag annehmen oder anpassen.",
					"Gap-Analyse starten, vorbelegt mit dem, was die Einrichtung schon weiß.",
				],
				result:
					"Profil, erste Register, anwendbare Anforderungen und ein Arbeitsvorrat, auch mit Pflichten, die erst später gelten.",
			},
			{
				key: "gap",
				name: "Gap-Analyse",
				summary:
					"Eine Frage je Control, belegt mit Dokumenten statt Selbstauskunft.",
				where: "Gap-Analyse",
				trigger: "Aus der Einrichtung, von „Heute“ oder jederzeit neu.",
				steps: [
					"Fragen kapitelweise beantworten und je Frage Nachweise hochladen.",
					"Bewerten: „Ja“ ohne Nachweis zählt nur halb.",
					"Ergebnis übernehmen: erst die Vorschau der Änderungen, dann der Control-Status.",
					"Maßnahmen nach Hebel vorschlagen lassen; sie werden Aufgaben.",
				],
				result:
					"Control-Status, Maßnahmenplan und ein Bericht zum Herunterladen.",
			},
			{
				key: "team",
				name: "Team, Rollen und Externe",
				summary:
					"Grundrolle plus eigene Rollen je Abteilung; Prüfer:innen und Berater:innen nur befristet.",
				where: "Team",
				trigger: "Jemand soll mitarbeiten oder prüfen.",
				steps: [
					"Einladen als Link zum Kopieren, Mail optional.",
					"Grundrolle wählen: Inhaber:in, Bearbeiter:in, Lesend, Prüfer:in oder Berater:in.",
					"Eigene Rollen wie Einkauf oder Recht ergänzen; ihre Rechte kommen zur Grundrolle hinzu.",
					"Externe sehen vertrauliche Bereiche nur mit ausdrücklicher Freigabe; ihr Zugang läuft ab (42 bzw. 90 Tage).",
				],
				result:
					"Jede Aktion prüft die Rechte der Person; Berater:innen wechseln zwischen ihren Mandanten.",
			},
		],
	},
	{
		key: "umsetzen",
		title: "Umsetzen",
		lead: "Ein Control, viele Anforderungen. Jeder Nachweis zählt überall.",
		tone: "sky",
		image: {
			src: "/leistungen/pruefungsreife.jpg",
			w: 2200,
			h: 1040,
			alt: "Prüfungsreife je Rahmenwerk mit Blockern",
		},
		workflows: [
			{
				key: "controls",
				name: "Controls und Synergien",
				summary:
					"Rahmenwerke sind das Warum, Controls das Was; die Abdeckung je Rahmenwerk rechnet Klick aus.",
				where: "Controls, Synergien",
				trigger: "Rahmenwerke sind gewählt.",
				steps: [
					"Status je Control setzen: geplant, in Arbeit, umgesetzt oder begründet nicht anwendbar.",
					"Hebel sehen: welches Control die meisten offenen Anforderungen schließt.",
					"Rahmenwerke vergleichen: gleichwertig, teilweise, nur in einem.",
				],
				result:
					"Abdeckung je Rahmenwerk und Erklärung zur Anwendbarkeit, abgeleitet statt von Hand gepflegt.",
			},
			{
				key: "evidence",
				name: "Nachweise hochladen",
				summary:
					"Jede Datei läuft durch eine Prüfkette, bevor sie verschlüsselt gespeichert wird.",
				where: "Nachweise",
				trigger:
					"Upload an einem Control, einer Frage, einem Dokument oder einer Anfrage.",
				steps: [
					"Dateityp und Inhalt prüfen; mit Virenscanner, wo er eingerichtet ist.",
					"Datenschutz-Prüfung: Geheimnisse blockieren den Upload, Zahlungs- und Steuerdaten heben die Einstufung an.",
					"Mit dem Schlüssel deiner Organisation verschlüsseln und mit dem Control verknüpfen.",
					"Ablaufdatum setzen; Klick erinnert vorher.",
				],
				result:
					"Ein Nachweis, der überall zählt, wo das Control gilt; jeder Download steht im Protokoll.",
			},
			{
				key: "documents",
				name: "Dokumente und Kenntnisnahme",
				summary:
					"Richtlinien mit Nummernkreis, Versionen, Freigabe und Bestätigung durch die Betroffenen.",
				where: "Dokumente",
				trigger: "Neues Dokument, Vorlage oder Import.",
				steps: [
					"Entwurf schreiben oder Datei hochladen; 39 Vorlagen stehen bereit.",
					"Zur Prüfung geben und freigeben lassen (Vier-Augen-Prinzip).",
					"Veröffentlichen: der Verteiler bekommt die Kenntnisnahme auf „Heute“.",
					"Nach dem Prüfzyklus erinnert Klick an die Überarbeitung.",
				],
				result:
					"Versionen mit Unterschieden, Kenntnisnahmen je Person und Pflichtdokumente je Rahmenwerk im Blick.",
			},
			{
				key: "trainings",
				name: "Schulungen",
				summary:
					"Pflichtschulungen je Rahmenwerk, zugewiesen und selbst bestätigt.",
				where: "Schulungen",
				trigger: "Pflicht aus einem Rahmenwerk oder eigener Plan.",
				steps: [
					"Schulung mit Kurs-Link anlegen und Personen oder Rollen zuweisen.",
					"Teilnehmende bestätigen selbst unter „Meine Schulungen“.",
					"Fällige Schulungen erscheinen 30 Tage vorher auf „Heute“.",
				],
				result: "Kompetenzmatrix und Schulungsnachweis je Person.",
			},
			{
				key: "readiness",
				name: "Prüfungsreife",
				summary:
					"Was bis zur Prüfung fehlt, je Rahmenwerk und zu jedem Stichtag.",
				where: "Rahmenwerke",
				trigger: "Vor einem Audit oder einer Zertifizierung.",
				steps: [
					"Stichtag wählen.",
					"Klick rechnet aus Abdeckung, gültigen Nachweisen, frischen Tests, Pflichtdokumenten und offenen Befunden.",
					"Blocker nach Punktgewinn sortiert abarbeiten.",
				],
				result: "Reifegrad je Rahmenwerk und ein Bericht für die Prüfung.",
			},
		],
	},
	{
		key: "risiken",
		title: "Risiken",
		lead: "Risiken aus allem, was in Klick passiert, bewertet nach deiner Methode.",
		tone: "brown",
		image: {
			src: "/funktionen/risiko.jpg",
			w: 1440,
			h: 1000,
			alt: "Risiko-Assistent in Klick mit Szenarien",
		},
		workflows: [
			{
				key: "risk-wizard",
				name: "Risiko-Assistent",
				summary:
					"Szenario wählen, Schaden je Schadensart bewerten, Klasse aus deiner Methode.",
				where: "Risiken",
				trigger: "Neues Risiko, leer oder aus einer Quelle.",
				steps: [
					"Szenario aus 67 Vorlagen wählen, gefiltert nach deinen Rahmenwerken.",
					"Eintritt und Schaden je Schadensart einschätzen; die Höhe rechnet Klick.",
					"Maßnahmen anlegen; jede wird eine Aufgabe mit Frist.",
					"Über dem Risikoappetit: Akzeptanz nur mit Freigabe.",
				],
				result:
					"Risikoregister mit Matrix, Maßnahmenplan und Bericht zur Risikoanalyse.",
			},
			{
				key: "risk-sources",
				name: "Risiken aus allem",
				summary:
					"Aus Dienstleister, Asset, Prozess, Vorfall, Befund oder Wallet direkt ein Risiko erfassen.",
				where: "Risiken",
				trigger:
					"„Als Risiko erfassen“ an der Quelle, oder ein Vorschlag von Klick.",
				steps: [
					"Der Assistent ist mit Szenario und Bezügen vorbelegt.",
					"Vorschläge prüfen: übernehmen oder mit Begründung ablehnen.",
				],
				result:
					"Jedes Risiko kennt seine Herkunft; die Quelle zeigt ihre Risiken.",
			},
			{
				key: "aml-risk",
				name: "Geldwäsche-Risikoanalyse",
				summary:
					"Faktoren je Dimension ankreuzen; Klick schlägt vor, du entscheidest.",
				where: "Geldwäsche",
				trigger: "Jährlich oder bei neuen Produkten, Kunden oder Ländern.",
				steps: [
					"Risikofaktoren je Dimension wählen.",
					"Vorschlag für die Bewertung prüfen und selbst festlegen.",
					"Von der Geschäftsleitung freigeben lassen.",
				],
				result:
					"Freigegebene Risikoanalyse als Grundlage für Sorgfaltspflichten und Monitoring.",
			},
		],
	},
	{
		key: "betrieb",
		title: "Vorfälle und Befunde",
		lead: "Meldefristen, Befunde und Korrekturen: mit Uhr statt Kalendereintrag.",
		tone: "ink",
		image: {
			src: "/leistungen/sicherheit.jpg",
			w: 2200,
			h: 1400,
			alt: "Security-Checks in Klick mit Ampel und Fristen",
		},
		workflows: [
			{
				key: "incident",
				name: "Vorfall melden",
				summary:
					"Drei Felder reichen für die Meldung; Klassifizierung und Meldeuhren folgen.",
				where: "Vorfälle",
				trigger: "Jemand bemerkt einen Vorfall.",
				steps: [
					"Melden: was, wann bemerkt, was betroffen.",
					"Klassifizieren nach DORA, NIS2, DSGVO oder CRA.",
					"Meldeuhren laufen: bei DORA Erstmeldung 4 Stunden nach Einstufung, spätestens 24 Stunden nach Kenntnis; Zwischenbericht nach 72 Stunden; Abschluss nach einem Monat.",
					"Meldung an die Aufsicht, auf Wunsch erst nach Freigabe.",
					"Abschließen mit Ursache; ein schwerwiegender Vorfall erzeugt eine Abweichung.",
				],
				result:
					"Dokumentierter Vorfall mit eingehaltenen Fristen und Lehren daraus.",
			},
			{
				key: "capa",
				name: "Abweichungen und Korrekturen",
				summary:
					"Jeder Befund landet im selben Regelkreis, bis die Wirksamkeit belegt ist.",
				where: "Abweichungen",
				trigger:
					"Schwerwiegender Vorfall, fehlgeschlagener Test, Audit-Feststellung, kritischer Befund, Unterdeckung bei der Abstimmung oder von Hand.",
				steps: [
					"Ursache analysieren, Korrektur und Korrekturmaßnahme festlegen.",
					"Die Geschäftsleitung setzt die Priorität.",
					"Wirksamkeit prüfen; abschließen nur, wenn sie wirksam war.",
				],
				result:
					"Geschlossener Regelkreis nach ISO 27001 10.2 und DORA Art. 13.",
			},
			{
				key: "security-checks",
				name: "Security-Checks",
				summary:
					"Scanner laufen bei dir; Klick nimmt die Ergebnisse an und verfolgt sie.",
				where: "Sicherheit",
				trigger:
					"Upload oder automatischer Import aus der CI mit Zugangstoken.",
				steps: [
					"Formate: SARIF, Trivy, ZAP, OSV, Nuclei, gitleaks.",
					"Abgleich per Fingerabdruck: neu, behoben, wieder aufgetaucht.",
					"Kritisch → Abweichung, hoch → Aufgabe mit Frist; Geheimnisse werden geschwärzt.",
					"Passiver Schnellcheck einer Domain: Header, TLS, DNS, security.txt.",
				],
				result: "Befundliste mit Ampel, Fristen und befristeten Ausnahmen.",
			},
			{
				key: "pentest",
				name: "Pentest-Aufträge",
				summary:
					"Vom Umfang bis zum Nachtest. Klick führt den Auftrag, testet aber nie selbst.",
				where: "Sicherheit",
				trigger: "Ein Pentest oder Security-Check ist geplant.",
				steps: [
					"Umfang, Ziele und Regeln festlegen; ab Testbeginn sind sie fest.",
					"Schriftliche Beauftragung; vorher kein Start.",
					"Befunde mit CVSS erfassen oder importieren.",
					"Bericht liefern: zählt als Wirksamkeitstest; Nachtest je Befund.",
				],
				result: "Bericht als ZIP mit Zusammenfassung, Befunden und Nachtest.",
			},
			{
				key: "cra",
				name: "Produkte und CRA",
				summary:
					"Produkte mit digitalen Elementen einstufen und bis zur Marktreife führen.",
				where: "Produkte",
				trigger: "Ein Produkt fällt unter den Cyber Resilience Act.",
				steps: [
					"Rolle und Einstufung bestimmen; Klick leitet den Konformitätsweg ab.",
					"SBOM hochladen und prüfen (CycloneDX oder SPDX).",
					"Checkliste je Produkt abarbeiten; Supportzeitraum festlegen.",
				],
				result:
					"Offene Punkte je Produkt und eigene CRA-Meldeuhren für Schwachstellen.",
			},
		],
	},
	{
		key: "lieferkette",
		title: "Dienstleister",
		lead: "Bewerten intern oder per Fragebogen. Der Lieferant braucht kein Konto.",
		tone: "sky",
		image: {
			src: "/leistungen/portal.jpg",
			w: 780,
			h: 1688,
			alt: "Lieferantenportal: Fragebogen ohne Konto",
		},
		workflows: [
			{
				key: "provider-rating",
				name: "Dienstleister bewerten",
				summary:
					"Steckbrief und Kriterien nach deiner Methode, mit Ampel und Wiedervorlage.",
				where: "Dienstleister",
				trigger: "Neuer Dienstleister oder Wiedervorlage.",
				steps: [
					"Steckbrief: Kritikalität, unterstützte Funktion, Auslagerung ja oder nein.",
					"Kriterien bewerten, vorbelegt aus dem, was Klick schon weiß.",
					"Abschluss mit Begründung; ein rotes Ergebnis braucht die Freigabe.",
				],
				result:
					"Sorgfaltsprüfung, Risikoanalyse und nächste Bewertung am Dienstleister.",
			},
			{
				key: "supplier-portal",
				name: "Fragebogen an Lieferanten",
				summary:
					"Ein Link genügt; der Lieferant antwortet und lädt Nachweise hoch.",
				where: "Dienstleister",
				trigger: "Bewertung nach NIS2, CRA oder DORA.",
				steps: [
					"Vorlage wählen und Link erzeugen; der Zugang steht im Teil nach „#“.",
					"Lieferant beantwortet und reicht ein; du kannst zur Klärung zurückgeben.",
					"Abschließen mit Entscheidung; der Link wird ungültig.",
				],
				result:
					"Sorgfaltsprüfung, Wiedervorlage und Vertragsklauseln nach DORA Art. 30 am Dienstleister.",
			},
			{
				key: "register",
				name: "Informationsregister",
				summary: "Das DORA-Register aus den Daten, die du ohnehin pflegst.",
				where: "Dienstleister",
				trigger: "Meldung an die Aufsicht oder Prüfung.",
				steps: [
					"Dienstleister, Verträge und Funktionen vollständig halten.",
					"Export starten; die Warnliste zeigt fehlende Angaben.",
				],
				result: "ZIP mit allen Blättern B_01.01 bis B_07.01 als CSV.",
			},
		],
	},
	{
		key: "steuerung",
		title: "Steuerung",
		lead: "Freigaben, Beschlüsse und Fristen, damit nichts an einer Person hängen bleibt.",
		tone: "blue",
		image: {
			src: "/funktionen/freigaben.jpg",
			w: 1440,
			h: 1000,
			alt: "Freigabe-Designer in Klick mit Stufen",
		},
		workflows: [
			{
				key: "approvals",
				name: "Freigaben",
				summary:
					"Wer wann zustimmt, legst du je Auslöser fest, mit Bedingungen und Stufen.",
				where: "Heute → Freigaben",
				trigger:
					"Zum Beispiel: Dokument veröffentlichen, Risiko akzeptieren, Dienstleister aufnehmen, Meldung an die Aufsicht.",
				steps: [
					"Klick wählt den passenden Ablauf nach Bedingungen (etwa Kritikalität).",
					"Stufen mit einer oder allen Stellen im Vier-Augen-Prinzip; die anfragende Person entscheidet nicht über ihren eigenen Antrag (Ausnahme: Ein-Personen-Organisation).",
					"Bis zur Entscheidung wartet die Sache im Status „Wartet auf Freigabe“.",
				],
				result:
					"Die Entscheidung wirkt direkt auf die Sache; der Ablauf steht im Protokoll.",
			},
			{
				key: "resolutions",
				name: "Beschlüsse und Managementanfragen",
				summary:
					"Jede Entscheidung der Geschäftsleitung wird ein Beschluss mit Rahmenwerk-Bezug.",
				where: "Beschlüsse",
				trigger:
					"Eine Freigabe durch die Geschäftsleitung oder eine Managementanfrage.",
				steps: [
					"Anfrage mit Optionen, Frist und Unterlagen stellen.",
					"Die Geschäftsleitung wählt eine Option und gibt frei.",
					"Klick legt genau einen Beschluss je Entscheidung an.",
				],
				result: "Beschlussregister mit Pflichtbeschlüssen je Rahmenwerk.",
			},
			{
				key: "objectives",
				name: "Ziele und Kennzahlen",
				summary:
					"KPI, KRI und KCI mit Schwellen, Messintervall und Eskalation.",
				where: "Organisation",
				trigger: "Neues Ziel oder fällige Messung.",
				steps: [
					"Ziel mit Richtung, Zielwert, Frühwarn- und Alarmschwelle anlegen und freigeben lassen.",
					"Messen; für einige Kennzahlen schlägt Klick den Wert aus seinen Daten vor.",
					"Jenseits der Alarmschwelle geht eine Managementanfrage raus.",
				],
				result:
					"Kennzahlen mit Verlauf, die in die Managementbewertung einfließen.",
			},
			{
				key: "review",
				name: "Managementbewertung",
				summary: "Die Pflicht-Inputs je Rahmenwerk, zusammengefasst aus Klick.",
				where: "Managementbewertung",
				trigger: "Jährlich oder nach Anlass.",
				steps: [
					"Zusammenfassung aus Risiken, Vorfällen, Audits, Zielen und Abweichungen prüfen.",
					"Bewertung abhalten; Klick hält den Stand als Schnappschuss fest.",
					"Ergebnisse als Beschluss, Aufgabe oder Abweichung übernehmen.",
				],
				result: "Bericht der Managementbewertung mit Folgemaßnahmen.",
			},
			{
				key: "audits",
				name: "Audits",
				summary:
					"Dreijahresprogramm, Prüfpfad und Anfragen der Prüfer:innen an einem Ort.",
				where: "Audits",
				trigger: "Geplantes internes oder externes Audit.",
				steps: [
					"Programm planen; Klick prüft, ob alle Bereiche abgedeckt sind.",
					"Im Cockpit dem Prüfpfad folgen: Anforderung → Control → Nachweis.",
					"Anfragen der Prüfer:innen werden Aufgaben; Feststellungen werden Abweichungen.",
				],
				result: "Prüfungspaket als ZIP mit Prüfsummen.",
			},
			{
				key: "calendar",
				name: "Kalender und Erinnerungen",
				summary: "Alle Fristen aus allen Bereichen in einem Kalender.",
				where: "Kalender",
				trigger: "Jede Frist, die irgendwo in Klick entsteht.",
				steps: [
					"Klick prüft stündlich, was fällig wird.",
					"Dringendes kommt sofort per Mail, alles andere morgens um 7 Uhr gesammelt.",
					"Roadmap-Zeitachse zeigt, was die Planung prägt.",
				],
				result: "Keine Frist, die nur in einem Kopf existiert.",
			},
		],
	},
	{
		key: "krypto",
		title: "Krypto und Finanzen",
		lead: "Für Kryptowerte-Dienstleister und Zahlungsinstitute auf dem Weg zur Zulassung.",
		tone: "brown",
		image: {
			src: "/funktionen/verwahrung.jpg",
			w: 1440,
			h: 779,
			alt: "Tägliche Abstimmung des Kundenvermögens in Klick",
		},
		workflows: [
			{
				key: "custody",
				name: "Verwahrung und tägliche Abstimmung",
				summary:
					"Wallets mit Quorum und Schlüsselinhaber:innen; jeden Tag Bestand gegen Kundenbuch.",
				where: "Verwahrung",
				trigger: "Jeder Geschäftstag. Fehlt sie, erinnert Klick ab 10 Uhr.",
				steps: [
					"Wallets mit Quorum, Technik und Schlüsselinhaber:innen führen; der Aufbewahrungsort ist verschlüsselt.",
					"Backup- und Wiederherstellungstests als Zeremonie erfassen.",
					"Je Kryptowert Bestand on-chain und Kundenbuch eintragen; die Differenz rechnet Klick.",
					"Unterdeckung über der Toleranz erzeugt sofort eine Abweichung; eine zweite Person prüft.",
				],
				result: "Lückenlose Abstimmung nach MiCAR Art. 70 und 75.",
			},
			{
				key: "aml",
				name: "Geldwäsche-Prävention",
				summary:
					"Sorgfaltspflichten, Monitoring-Regeln, Verdachtsmeldungen und Travel Rule.",
				where: "Geldwäsche",
				trigger: "Neue Kund:innen, Auffälligkeit oder Transfer.",
				steps: [
					"Sorgfaltspflichten je Risiko dokumentieren.",
					"Verdachtsmeldung erfassen; die Uhr nach § 46 GwG läuft mit.",
					"Länder und Korridore pflegen, Travel-Rule-Fälle führen.",
				],
				result: "Prüfbare Geldwäsche-Organisation mit Berichten.",
			},
			{
				key: "own-funds",
				name: "Eigenmittel und Kryptowerte",
				summary:
					"Eigenmittelrechner nach MiCAR und ZAG; Kryptowerte nur mit zulässigem Emittenten.",
				where: "Eigenmittel, Kryptowerte",
				trigger: "Quartal, Stufenwechsel oder neuer Kryptowert.",
				steps: [
					"Eigenmittel nach Art. 67 MiCAR bzw. § 15 ZAG berechnen und freigeben lassen.",
					"Kryptowerte aufnehmen; E-Geld-Token nur von zugelassenen Emittenten.",
				],
				result:
					"Nachvollziehbare Rechnung und Liste der angenommenen Kryptowerte.",
			},
			{
				key: "application",
				name: "Zulassungsantrag",
				summary:
					"Die Bestandteile für MiCAR und ZAG; die Vollständigkeit rechnet Klick aus.",
				where: "Antrag",
				trigger: "Vorbereitung des Antrags bei der Aufsicht.",
				steps: [
					"17 Bestandteile nach MiCAR und 10 nach ZAG abarbeiten.",
					"Klick zeigt, was aus vorhandenen Daten schon belegt ist.",
					"Antragsunterlagen exportieren.",
				],
				result: "Vollständigkeitsliste und Export für den Antrag.",
			},
		],
	},
	{
		key: "aussen",
		title: "Nach außen",
		lead: "Was Kund:innen, Prüfer:innen und Aufsicht sehen dürfen, und nicht mehr.",
		tone: "ink",
		image: {
			src: "/funktionen/trust-center.jpg",
			w: 960,
			h: 1000,
			alt: "Öffentliches Trust Center einer Organisation",
		},
		workflows: [
			{
				key: "trust-center",
				name: "Trust Center",
				summary:
					"Deine öffentliche Vertrauensseite; Vertrauliches nur nach Anfrage und Freigabe.",
				where: "Trust Center",
				trigger: "Kund:innen fragen nach Sicherheit und Zertifikaten.",
				steps: [
					"Rahmenwerke mit Status, Unterauftragnehmer und Unterlagen auswählen.",
					"Veröffentlichen; öffentlich ist nur der freigegebene Stand.",
					"Anfragen mit Vertraulichkeitserklärung prüfen und freigeben; der Link ist befristet.",
				],
				result:
					"Jeder Download steht im Protokoll; Zugänge lassen sich jederzeit entziehen.",
			},
			{
				key: "exports",
				name: "Prüfungspaket und Exporte",
				summary: "Alles, was eine Prüfung braucht, als ZIP mit Prüfsummen.",
				where: "Rahmenwerke, Audits",
				trigger: "Prüfung, Aufsicht oder Kundenanfrage.",
				steps: [
					"Paket starten und mit Passkey bestätigen.",
					"Klick bündelt Erklärung zur Anwendbarkeit, Lücken, Controls, Risiken, freigegebene Dokumente, Nachweis-Index, Vorfälle und Protokollauszug.",
				],
				result:
					"ZIP mit Manifest und SHA-256-Prüfsummen; jeder Export trägt eine Export-ID.",
			},
			{
				key: "privacy",
				name: "Datenschutz",
				summary:
					"Verarbeitungsverzeichnis, Folgenabschätzung und Betroffenenanfragen mit Frist.",
				where: "Datenschutz",
				trigger: "Neue Verarbeitung oder Anfrage einer betroffenen Person.",
				steps: [
					"Verarbeitungen aus der Startliste übernehmen und ergänzen.",
					"Fehlende Folgenabschätzungen sehen.",
					"Anfrage erfassen; die Monatsfrist läuft mit, Verlängerung mit Begründung.",
				],
				result: "Verzeichnis nach Art. 30 DSGVO und dokumentierte Anfragen.",
			},
		],
	},
	{
		key: "sicherheit",
		title: "Sicherheit der Plattform",
		lead: "Was Klick selbst tut, damit deine Daten sicher sind.",
		tone: "blue",
		image: {
			src: "/funktionen/anmeldung.jpg",
			w: 1020,
			h: 630,
			alt: "Anmeldung bei Klick mit Passkey",
		},
		workflows: [
			{
				key: "step-up",
				name: "Bestätigen vor sensiblen Aktionen",
				summary:
					"Exporte, Freigaben und Einstellungen verlangen eine frische Bestätigung.",
				where: "überall",
				trigger:
					"Eine sensible Aktion, länger als 10 Minuten nach der letzten Bestätigung.",
				steps: [
					"Dialog öffnet sich; mit Passkey bestätigen.",
					"Die Aktion läuft danach ohne neuen Anlauf weiter.",
				],
				result:
					"Eine gestohlene Sitzung reicht nicht für Exporte oder Rechteänderungen.",
			},
			{
				key: "audit-log",
				name: "Protokoll mit Hash-Kette",
				summary:
					"Jede Änderung mit vorher und nachher, verkettet und nicht nachträglich änderbar.",
				where: "Aktivität",
				trigger: "Jede Änderung, jeder Download, jede Anmeldung.",
				steps: [
					"Der Eintrag entsteht in derselben Transaktion wie die Änderung.",
					"Jeder Eintrag trägt den Hash des vorigen.",
				],
				result: "Ein Protokoll, dessen Lücken und Änderungen auffallen würden.",
			},
			{
				key: "isolation",
				name: "Trennung und Verschlüsselung",
				summary:
					"Jede Organisation sieht nur ihre Daten, auch wenn ein Programmfehler etwas anderes wollte.",
				where: "überall",
				trigger: "Jede Datenbankabfrage.",
				steps: [
					"Die Datenbank filtert jede Zeile auf deine Organisation (Row-Level-Security).",
					"Dateien und sensible Felder sind mit einem eigenen Schlüssel je Organisation verschlüsselt.",
				],
				result: "Mandantentrennung in der Datenbank, nicht nur im Programm.",
			},
		],
	},
];

export const WORKFLOW_COUNT = WORKFLOW_GROUPS.reduce(
	(n, g) => n + g.workflows.length,
	0,
);

// Kurznamen für den Rahmenwerk-Ausschnitt (Reihenfolge = Anzeige).
export const PICKER_FRAMEWORKS: { slug: string; label: string }[] = [
	{ slug: "iso27001", label: "ISO 27001" },
	{ slug: "dora", label: "DORA" },
	{ slug: "nis2", label: "NIS2" },
	{ slug: "micar", label: "MiCAR" },
	{ slug: "zag", label: "ZAG" },
	{ slug: "zag-marisk", label: "ZAG-MaRisk" },
	{ slug: "gwg", label: "GwG" },
	{ slug: "amlr", label: "AMLR" },
	{ slug: "tfr", label: "Travel Rule" },
	{ slug: "dsgvo", label: "DSGVO" },
	{ slug: "kwg", label: "KWG" },
	{ slug: "cra", label: "CRA" },
	{ slug: "soc2", label: "SOC 2" },
	{ slug: "ccss", label: "CCSS" },
];
export const PICKER_DEFAULT = ["iso27001", "dora", "micar", "gwg"];

export const FEATURE_FAQ: { q: string; a: string }[] = [
	{
		q: "Brauche ich ein Passwort?",
		a: "Nein. Du meldest dich mit einem Passkey an: Fingerabdruck, Gesicht oder Geräte-PIN. Er zählt als beide Faktoren. Für den Notfall gibt es einen Mail-Link, nur für bestehende Konten.",
	},
	{
		q: "Wer sieht meine Daten?",
		a: "Deine Organisation. Die Datenbank trennt jede Zeile nach Organisation, Dateien und sensible Felder sind mit eurem eigenen Schlüssel verschlüsselt. Prüfer:innen und Berater:innen sehen nur, was ihre Rolle erlaubt, und nur befristet. Wir als Betreiber greifen nur im Support- oder Störungsfall zu, mit Begründung, und jeder Zugriff steht im Audit-Log.",
	},
	{
		q: "Ersetzt Klick die Prüfung?",
		a: "Nein. Klick bereitet sie vor: Prüfpfad, Nachweise, Prüfungspaket und Reifegrad. Bewerten und testieren tun Prüfer:innen und Aufsicht.",
	},
	{
		q: "Rechnet Klick mit KI?",
		a: "Nein. Alles, was Klick vorschlägt, folgt nachvollziehbaren Regeln aus dem Katalog und deinen Daten. Entscheidungen triffst du.",
	},
	{
		q: "Bekomme ich meine Daten wieder heraus?",
		a: "Ja. Prüfungspaket, Informationsregister und ein vollständiger Export aller Daten deiner Organisation stehen als ZIP bereit, mit Prüfsummen und nach Bestätigung per Passkey.",
	},
	{
		q: "Wie lange dauert der Einstieg?",
		a: "Die geführte Einrichtung hat sieben Schritte und speichert sofort. Danach steht der Arbeitsvorrat; die Gap-Analyse kannst du kapitelweise beantworten.",
	},
	{
		q: "Was kostet Klick?",
		a: "Die Software kostet eine Jahresgebühr, fällig erst nach dem bestandenen Audit; eine Monatszahlung gibt es nicht. Berater-Zugänge kosten ab dem ersten Tag, unsere Beratung besprechen wir im Gespräch. Die Stufen stehen unter Preise.",
	},
];
