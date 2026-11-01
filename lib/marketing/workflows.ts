import { DOCUMENT_TEMPLATES } from "@/lib/compliance/catalog/document-templates";
import { RISK_SCENARIOS } from "@/lib/compliance/catalog/risk-scenarios";
import { EVIDENCE_TEMPLATES } from "@/lib/evidence-authoring/templates";
import { SHOTS, type Shot } from "@/lib/marketing/shots";
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
	image: Shot & { alt: string };
	workflows: Workflow[];
};

export const WORKFLOW_GROUPS: WorkflowGroup[] = [
	{
		key: "start",
		title: "Einstieg",
		lead: "Vom ersten Link bis zum Arbeitsvorrat, ohne Passwort.",
		image: {
			...SHOTS.frage,
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
				key: "sso",
				name: "Anmelden mit dem Firmenkonto",
				summary:
					"Microsoft Entra ID, Google Workspace, Okta oder SAML je Organisation, mit Rollen aus den Gruppen.",
				where: "Einstellungen > SSO",
				trigger:
					"Die Organisation will Konten zentral im eigenen Verzeichnis verwalten.",
				steps: [
					"Anbieter wählen und der Anleitung folgen; Klick zeigt Weiterleitungsadresse bzw. SAML-Werte zum Kopieren und die eigenen Metadaten als Datei.",
					"Metadaten des Anbieters als Adresse, Datei oder von Hand angeben; Klick prüft Zertifikat und Ablauf.",
					"Domain per DNS-Eintrag bestätigen und mit dem eigenen Firmenkonto testen: Klick zeigt, was ankam, und legt dabei nichts an.",
					"Gruppen den Rollen zuordnen (Mitarbeitende, Lesend, Bearbeiter:in); neue Konten entstehen bei der ersten Anmeldung.",
					"Optional die Firmen-MFA anerkennen und SSO für die Firmen-Domain erzwingen; Inhaber:innen behalten einen Notzugang per Passkey.",
				],
				result:
					"Wer im Firmenkonto gesperrt ist, kommt nicht mehr in Klick; Rollen folgen den Gruppen, jede Änderung steht im Protokoll. Ein neues Zertifikat beim Anbieter meldet Klick vor dem Ablauf; übernommen wird es mit einer zweiten Person.",
			},
			{
				key: "setup",
				name: "Geführte Einrichtung",
				summary:
					"Sechs Schritte, die sofort in Register und Profil speichern und am Ende die Rahmenwerke vorschlagen.",
				where: "Einrichtung",
				trigger: "Eine neue Organisation ist angelegt.",
				steps: [
					"Rollen und Rechte: Funktionsträger:innen benennen oder einladen.",
					"Unternehmen, Größe und Standorte: Einstufung nach KMU-Grenzen, NIS2 und DORA als Orientierung.",
					"Tätigkeit mit Lizenzstufe und Krypto-Diensten, IT, Dienstleister und Daten.",
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
					"Grundrolle wählen: Inhaber:in, Bearbeiter:in, Lesend, Mitarbeitende, Prüfer:in oder Berater:in.",
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
		image: {
			...SHOTS.pruefungsreife,
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
				key: "exclusions",
				name: "Ausschluss mit Begründung",
				summary:
					"Ausschließen geht nur, wo das Rahmenwerk es vorsieht: Anhang A von ISO 27001, PCI DSS, Zusatzkategorien von SOC 2.",
				where: "Rahmenwerke > Anforderung, Gap-Analyse",
				trigger:
					"Eine Anforderung passt nicht zu deinem Unternehmen, oder in der Gap-Analyse antwortest du „nicht relevant“.",
				steps: [
					"Klick zeigt je betroffener Anforderung, was passiert: wird in der SoA ausgeschlossen oder bleibt offen, weil das Rahmenwerk keinen Ausschluss kennt.",
					"Begründung eintragen; eine zweite Person, meist die Geschäftsleitung, bestätigt sie im Posteingang. Erst dann wirkt der Ausschluss und steht in der SoA und im Prüfungspaket.",
					"Das Control entfällt nur, wenn danach nichts offen bliebe: Anforderungen, die es nur teilweise trägt, zählen über andere Maßnahmen. DORA, NIS2 oder GwG zählen es sonst weiter.",
				],
				result:
					"Eine SoA mit begründeten Ausschlüssen; Ausschlüsse ohne Grundlage stehen als Blocker in der Prüfungsreife.",
			},
			{
				key: "custom-frameworks",
				name: "Eigenes Rahmenwerk anlegen",
				summary:
					"Anforderungen von Kund:innen, aus dem Konzern oder aus einem lizenzierten Katalog zählen wie jedes Rahmenwerk in Klick.",
				where: "Einstellungen > Rahmenwerke & Stufe",
				trigger:
					"Eine Kundin schickt ihren Sicherheitsfragebogen, der Konzern hat eigene Vorgaben, oder du hast einen Katalog wie HITRUST lizenziert.",
				steps: [
					"Leer anlegen, ein Klick-Rahmenwerk als Ausgangspunkt kopieren oder die Anforderungen per CSV laden; vor dem Übernehmen zeigt Klick neu, geändert und Fehler je Zeile.",
					"Jede Anforderung den Klick-Maßnahmen zuordnen, ganz oder teilweise; Vorschläge passen zum Text der Anforderung, der Filter zeigt, was noch offen ist.",
					"Eine Inhaber:in schaltet das Rahmenwerk per Passkey ein; fehlende Maßnahmen kommen in den Arbeitsvorrat.",
				],
				result:
					"Abdeckung, Prüfungsreife, Gap-Analyse und Nachweise auch für die Anforderungen deiner Kund:innen, ohne doppelte Arbeit: Was du für ISO 27001 schon umgesetzt hast, zählt sofort.",
			},
			{
				key: "variants",
				name: "PCI DSS nach SAQ, IT-Grundschutz nach Variante",
				summary:
					"Du siehst nur die Anforderungen, die für deinen Fragebogen bzw. deine Absicherungsvariante gelten.",
				where: "Einstellungen > Rahmenwerke, Einrichtung",
				trigger:
					"In der Einrichtung gibst du an, wie ihr mit Kartendaten umgeht, oder du wählst BSI-Standard 200-2.",
				steps: [
					"Kartenzahlungen über einen Zahlungsdienstleister: SAQ A mit wenigen Dutzend Anforderungen; Kartendaten im eigenen System: SAQ D bzw. Prüfbericht; Dienstleister: alles.",
					"IT-Grundschutz: Basis-, Standard- oder Kern-Absicherung wählen; Kapitel der anderen Varianten entfallen.",
					"Die Gap-Analyse fragt weiter je Control, die Anforderungsseite zeigt jede Nummer wie im Prüfbericht.",
				],
				result:
					"Ein Arbeitsvorrat, der zu deinem Umfang passt; ein Wechsel der Variante rechnet die Anwendbarkeit neu.",
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
					"Dateityp und Inhalt prüft ein eigener Prozess ohne Netz und ohne Zugangsdaten; dazu der Virenscanner, wo er eingerichtet ist.",
					"Datenschutz-Prüfung: Geheimnisse blockieren den Upload, Zahlungs- und Steuerdaten heben die Einstufung an.",
					"Mit dem Schlüssel deiner Organisation verschlüsseln und mit dem Control verknüpfen.",
					"Ablaufdatum setzen; Klick erinnert vorher.",
				],
				result:
					"Ein Nachweis, der überall zählt, wo das Control gilt; jeder Download steht im Protokoll.",
			},
			{
				key: "evidence-studio",
				name: "Nachweise aus Klick erzeugen",
				summary:
					"Kontextanalyse, Rollenregister, Organigramm, Erklärung zur Anwendbarkeit, Auditprogramm und gut zwei Dutzend weitere Nachweise entstehen aus dem, was du ohnehin in Klick pflegst.",
				where: "Rahmenwerke > Nachweise",
				trigger:
					"Ein Register ist gepflegt oder ein Nachweis ist fällig, veraltet oder abgelaufen.",
				steps: [
					"Je Normpunkt zeigt der Nachweisbogen, was verlangt ist; jede Prüffrage beantwortest du einmal für alle Rahmenwerke.",
					"„Fällige Nachweise erzeugen“: Klick baut aus den Registern ein PDF mit Schnappschuss und Prüfsumme.",
					"Ändert sich ein Register, steht der Nachweis auf „veraltet“; neu erzeugen legt eine neue Fassung an, die alte bleibt.",
					"Fristen je Rahmenwerk legst du selbst fest; Klick meldet, wenn eine Festlegung laxer ist als die Vorgabe.",
				],
				result:
					"Prüfbare PDFs an den passenden Controls; sie zählen sofort in der Prüfungsreife und liegen im Prüfungspaket.",
			},
			{
				key: "evidence-authoring",
				name: "Nachweise in Klick verfassen",
				summary: `Kein Link, kein Screenshot? Aus ${EVIDENCE_TEMPLATES.length} Rohlingen (Protokolle, Listen, Checklisten, Bestätigungen) wird ein prüfbarer Nachweis.`,
				where: "Nachweise > In Klick verfassen",
				trigger:
					"Eine Position im Nachweisbogen ist offen, und es gibt keine Datei dafür.",
				steps: [
					"Klick schlägt den passenden Rohling vor, etwa Übungsprotokoll, Rezertifizierung oder Liste der Schlüsselinhaber:innen.",
					"Gemeinsam ausfüllen: Teilnehmende, Ablauf, Prüfpunkte, Ergebnis; Tabellen fügst du aus Excel ein.",
					"Abschließen: ein PDF mit Prüfsumme, verknüpft mit den Controls; Maßnahmen werden Aufgaben, das Ergebnis ein Wirksamkeitstest.",
					"Unterschreiben per Passkey; Änderungen gehen als neue Fassung, die alte bleibt.",
				],
				result:
					"Aufzeichnungen, die Prüfer:innen anerkennen: mit Datum, Personen, Ergebnis und Unterschrift.",
			},
			{
				key: "signatures",
				name: "Unterschrift per Passkey",
				summary:
					"Die richtige Person unterschreibt mit ihrem Passkey statt mit einem Häkchen.",
				where: "Rahmenwerke > Nachweise, Organisation, Berichte an die GL",
				trigger:
					"Ein Nachweis wartet auf die Unterschrift einer Funktion, etwa der Geschäftsleitung.",
				steps: [
					"Unterschreiben kann nur, wer die Funktion innehat; der Browser fragt Fingerabdruck, Gesicht oder PIN ab.",
					"Die Unterschrift bindet genau diesen Inhalt über seine Prüfsumme; viele Nachweise gehen in einer Sammelunterschrift.",
					"Bestellungsschreiben unterschreiben Geschäftsleitung und bestellte Person, Berichte nimmt die Geschäftsleitung zur Kenntnis.",
				],
				result:
					"Unterschriften, die sich ohne Klick prüfen lassen: Schlüssel, Zeitpunkt und Prüfsumme stehen in einer Datei im Prüfungspaket.",
			},
			{
				key: "documents",
				name: "Dokumente und Kenntnisnahme",
				summary:
					"Richtlinien mit Nummernkreis, Versionen, Freigabe und Bestätigung durch die Betroffenen.",
				where: "Dokumente",
				trigger: "Neues Dokument, Vorlage oder Import.",
				steps: [
					`Entwurf schreiben oder Datei hochladen; ${DOCUMENT_TEMPLATES.length} Vorlagen stehen bereit.`,
					"Zur Prüfung geben und freigeben lassen (Vier-Augen-Prinzip).",
					"Veröffentlichen: der Verteiler bekommt die Kenntnisnahme auf „Heute“.",
					"Nach dem Prüfzyklus erinnert Klick an die Überarbeitung.",
				],
				result:
					"Versionen mit Unterschieden, Kenntnisnahmen je Person und Pflichtdokumente je Rahmenwerk im Blick.",
			},
			{
				key: "staff-policies",
				name: "Richtlinien an Mitarbeitende",
				summary:
					"Gültige Richtlinien lesen und bestätigen, mit Konto oder über ein Portal mit Einmal-Code.",
				where: "Richtlinien, Einstellungen > Richtlinien-Portal",
				trigger:
					"Eine Richtlinie wird veröffentlicht oder bekommt eine neue Fassung.",
				steps: [
					"Im Verteiler wählen, wer sie lesen soll: alle, Mitarbeitende oder bestimmte Funktionen.",
					"Mitarbeitende mit Konto sehen nur ihre Richtlinien; ohne Konto öffnen sie das Portal und bekommen einen Code an die Firmen-Adresse.",
					"Lesen und „Zur Kenntnis genommen“ tippen; Klick hält Fassung und Zeitpunkt fest.",
					"Ausgewählte Nachweise lassen sich für Mitarbeitende freigeben, etwa ein Notfallplan als Datei.",
				],
				result:
					"Kenntnisnahmen je Fassung und Person am Dokument, auch aus dem Portal; vertrauliche Unterlagen sehen Mitarbeitende nie.",
			},
			{
				key: "versions",
				name: "Fassungen und Prüfer-Sicht",
				summary:
					"Was einmal freigegeben ist, bleibt so; Prüfer:innen sehen nur, was gilt.",
				where: "Dokumente, Nachweise",
				trigger:
					"Ein Dokument wird eingereicht oder ein Nachweis bekommt eine neue Fassung.",
				steps: [
					"Beim Einreichen schreibt Klick Text und Datei in eine Fassung mit Nummer und Prüfsumme fest.",
					"Die Freigabe gilt genau dieser Fassung; veröffentlicht lässt sie sich auch in der Datenbank nicht mehr ändern.",
					"Eine neue Nachweis-Fassung übernimmt Controls und Einstufung, die alte zählt nicht mehr.",
					"Je Fassung siehst du, was sich geändert hat: im Text und im Inhalt hochgeladener Dateien (PDF, Word, Excel), Absatz für Absatz, geänderte Wörter markiert.",
					"Prüfer:innen sehen nur gültige Fassungen, abgelaufene Nachweise deutlich markiert; Berater:innen sehen auch Entwürfe und Verlauf.",
				],
				result:
					"Ein Prüfungspaket mit jeder Fassung, die im Prüfzeitraum galt, samt „gilt von“ und „gilt bis“.",
			},
			{
				key: "ai-own-key",
				name: "KI mit eigenem Schlüssel",
				summary:
					"Fassungen zusammenfassen, Dokumente entwerfen, Nachweise prüfen und Fragen an die Hilfe stellen: mit dem KI-Anbieter deiner Organisation, nur auf Knopfdruck.",
				where: "Einstellungen > KI, Dokumente, Nachweise, Hilfe",
				trigger:
					"Klick hat die KI für deine Organisation freigeschaltet, und du trägst den Schlüssel deines Anbieters ein.",
				steps: [
					"Anbieter wählen (Claude, Gemini, OpenAI, Azure OpenAI, Mistral oder eine OpenAI-kompatible Adresse wie IONOS oder STACKIT) und den Schlüssel eintragen; Klick speichert ihn verschlüsselt.",
					"Funktionen und Einstufung wählen; das Einschalten bestätigt eine zweite Person.",
					"Auf Knopfdruck entfernt Klick Zugangsdaten, Konten- und Kontaktdaten und schickt nur, was die Einstufung erlaubt; streng geheim geht nie hinaus.",
					"Die Antwort steht als KI-Vorschlag mit Anbieter und Modell da; übernommen wird sie nur von dir.",
				],
				result:
					"Jeder Aufruf steht im Protokoll, ohne Inhalte; die Kosten laufen über euren eigenen Vertrag mit dem Anbieter.",
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
		image: {
			...SHOTS.risiko,
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
					`Szenario aus ${RISK_SCENARIOS.length} Vorlagen wählen, gefiltert nach deinen Rahmenwerken.`,
					"Eintritt und Schaden je Schadensart einschätzen; die Höhe rechnet Klick.",
					"Maßnahmen anlegen; jede wird eine Aufgabe mit Frist.",
					"Über dem Risikoappetit: Akzeptanz nur mit Freigabe.",
				],
				result:
					"Risikoregister mit Matrix, Maßnahmenplan und Bericht zur Risikoanalyse.",
			},
			{
				key: "risk-bsi",
				name: "Risikoanalyse nach BSI-Standard 200-3",
				summary:
					"Vier Stufen, Matrix mit Kategorien von gering bis sehr hoch und die 47 elementaren Gefährdungen.",
				where: "Einstellungen > Risikomethodik, Risiken > Neu",
				trigger:
					"Ein Zielobjekt hat hohen Schutzbedarf, oder deine Organisation arbeitet nach IT-Grundschutz.",
				steps: [
					"Vorlage „BSI-Standard 200-3“ wählen: Eintrittshäufigkeit und Schadenshöhe in vier Stufen, Risikokategorie aus der Matrix.",
					"Wechselst du von fünf auf vier Stufen, zeigt Klick vorher die Umrechnung je Risiko und merkt die Risiken zur neuen Bewertung vor.",
					"Im Risiko-Assistenten eine Gefährdung von G 0.1 bis G 0.47 wählen; passende Controls sind vorgeschlagen.",
				],
				result:
					"Gefährdungsübersicht und Risikobewertung nach 200-3, mit Behandlung und Bericht wie bei jeder Risikoanalyse.",
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
		image: {
			...SHOTS.sicherheit,
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
					"Meldung an die Aufsicht; die Geschäftsleitung erfährt es sofort und bestätigt die Kenntnisnahme. Eine Freigabe vorab lässt sich zuschalten.",
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
					"Kritische Befunde werden zur Abweichung, hohe zur Aufgabe mit Frist; Geheimnisse werden geschwärzt.",
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
		image: {
			...SHOTS.portal,
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
		image: {
			...SHOTS.freigaben,
			alt: "Freigabe-Designer in Klick mit Stufen",
		},
		workflows: [
			{
				key: "approvals",
				name: "Freigaben",
				summary:
					"Was deine Rahmenwerke an Freigaben verlangen, schaltet Klick ein; Bedingungen und Stufen siehst du je Auslöser.",
				where: "Heute > Freigaben",
				trigger:
					"Zum Beispiel: Dokument veröffentlichen, Risiko akzeptieren, Dienstleister aufnehmen, Funktion bestellen.",
				steps: [
					"Klick wählt den passenden Ablauf nach Bedingungen (etwa Kritikalität); Stufen, deren Funktion niemand innehat, entfallen, die Geschäftsleitung nie.",
					"Stufen mit einer oder allen Stellen im Vier-Augen-Prinzip; die anfragende Person entscheidet nicht über ihren eigenen Antrag (Ausnahme: Ein-Personen-Organisation).",
					"Bis zur Entscheidung wartet die Sache im Status „Wartet auf Freigabe“.",
				],
				result:
					"Die Entscheidung wirkt direkt auf die Sache; der Ablauf steht im Protokoll.",
			},
			{
				key: "appointment",
				name: "Bestellung durch die Geschäftsleitung",
				summary:
					"Funktionen wie ISB, Geldwäschebeauftragte oder Datenschutz gelten erst, wenn die Geschäftsleitung sie bestellt hat.",
				where: "Organisation > Rollen & Leitung",
				trigger:
					"Jemand wird für eine Funktion vorgeschlagen, neu besetzt oder abberufen.",
				steps: [
					"Vorschlag eintragen, in der Einrichtung oder unter Organisation; bis zur Bestellung trägt die Person weder Verantwortung noch Freigaberechte.",
					"Alle Mitglieder der Geschäftsleitung stimmen zu; wer selbst einträgt und zur Leitung gehört, zählt als erste Zustimmung.",
					"Klick legt den Beschluss an, erzeugt das Bestellungsschreiben zum Unterschreiben und, wo nötig, die Aufgabe für die Anzeige an die Aufsicht, etwa an die BaFin bei Geldwäschebeauftragten.",
				],
				result:
					"Bestellung mit Beschluss, unterschriebenem Schreiben und Frist für die Anzeige.",
			},
			{
				key: "individual",
				name: "Rollen und Freigaben individuell gestalten",
				summary:
					"Eigene Rollen für dein Unternehmen, Personen und Freigaben per Ziehen, wenn dir der Standard nicht passt.",
				where: "Einstellungen > Freigaben",
				trigger:
					"Du wählst in der Einrichtung oder unter Einstellungen > Freigaben „Individuell gestalten“.",
				steps: [
					"Eigene Rollen anlegen, etwa Einkauf oder Finanzen, mit Aufgaben, Berichtsweg und Rechten in Klick.",
					"Auf der Rollen-Tafel Personen auf Rollen ziehen, Bereiche zuordnen und im Organigramm Berichtswege setzen; bestellt wird wie im Standard durch die Geschäftsleitung. Jeder Schritt geht auch ohne Ziehen über das Menü.",
					"Im Freigabe-Designer Stellen in Stufen ziehen. Was deine Rahmenwerke verlangen und fehlt, zeigt Klick als Hinweis mit Rechtsgrundlage und in der Prüfungsreife.",
				],
				result:
					"Abläufe, die zu deinem Aufbau passen, mit sichtbaren Lücken statt stiller Abweichung. Zurück zum Standard geht jederzeit.",
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
				key: "gl-reports",
				name: "Berichte an die Geschäftsleitung",
				summary:
					"ISB, Geldwäschebeauftragte, Compliance, Datenschutz und Auslagerung berichten mit Kennzahlen aus Klick.",
				where: "Berichte an die GL",
				trigger:
					"Der Jahresbericht einer Funktion ist fällig, oder es gibt einen Anlass.",
				steps: [
					"Art wählen; Zeitraum und Kennzahlen schlägt Klick vor.",
					"Einschätzung und Maßnahmen schreiben und vorlegen; die Kennzahlen werden dabei festgehalten.",
					"Die Geschäftsleitung nimmt den Bericht per Passkey zur Kenntnis.",
				],
				result:
					"Berichtsprotokoll als PDF mit Kenntnisnahme und dem Termin für den nächsten Bericht.",
			},
			{
				key: "org-chart",
				name: "Organigramm und Bestellungen",
				summary:
					"Berichtswege und Bestellungsschreiben je Funktion, mit Hinweis, wenn die Unabhängigkeit fehlt.",
				where: "Organisation > Rollen & Leitung",
				trigger: "Eine Pflichtfunktion wird besetzt oder ändert sich.",
				steps: [
					"Funktion besetzen und eintragen, an wen sie berichtet.",
					"Klick zeichnet das Organigramm und warnt, wenn etwa ISB oder Geldwäschebeauftragte nicht direkt an die Geschäftsleitung berichten.",
					"Bestellungsschreiben aus der Vorlage je Funktion erzeugen und von beiden Seiten unterschreiben lassen.",
				],
				result:
					"Organigramm und Bestellungen als Nachweis für Prüfung und Aufsicht.",
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
					"Im Cockpit dem Prüfpfad folgen: von der Anforderung über das Control zum Nachweis.",
					"Anfragen der Prüfer:innen werden Aufgaben; Feststellungen werden Abweichungen mit den Fristen des jeweiligen Rahmenwerks (Haupt- und Nebenabweichung).",
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
			{
				key: "teams",
				name: "Hinweise per Push und in Microsoft Teams",
				summary:
					"Freigaben, Aufgaben und Fristen kommen als Mitteilung auf Mac, Windows, Android und iPhone oder im Aktivitätsfeed von Teams; ein Klick öffnet die Seite in Klick.",
				where:
					"Einstellungen > Benachrichtigungen, Einstellungen > Integrationen",
				trigger: "Du willst weniger Mails und Dringendes sofort sehen.",
				steps: [
					"Jede Person schaltet Push auf ihren Geräten ein; auf dem iPhone über „Zum Home-Bildschirm“.",
					"Für Teams trägt die Inhaber:in den Tenant ein und schickt der eigenen IT den Freigabe-Link; die IT lädt das App-Paket in Teams hoch.",
					"Jede Person wählt je Art Mail, Push, Teams oder mehrere Wege, und ob die Tages-Mail kommt.",
				],
				result:
					"Raus gehen nur Titel und Link, bei Push verschlüsselt fürs Gerät. Klappt die Zustellung dreimal nicht, kommt die Nachricht per Mail.",
			},
		],
	},
	{
		key: "krypto",
		title: "Krypto und Finanzen",
		lead: "Für Kryptowerte-Dienstleister und Zahlungsinstitute auf dem Weg zur Zulassung.",
		image: {
			...SHOTS.verwahrung,
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
				key: "both-money",
				name: "Wallet in both.money, Nachweise in Klick",
				summary:
					"Ein- und Ausgänge, Tagesbestände und Auffälligkeiten aus der Wallet both.money kommen automatisch in Klick an.",
				where: "Krypto, Verwahrung, Einstellungen",
				trigger:
					"Einmal verbinden; danach jede Minute und jeden Tag um 00:10 Uhr.",
				steps: [
					"In Klick ein Token ausstellen und in both.money eintragen; both.money prüft die Verbindung sofort und liefert den heutigen Stand nach.",
					"Konten landen im Verwahrungs-Register, Bewegungen und Auszahlungen unter Krypto; der Tagesbestand mit Blockhöhe belegt die Abstimmung.",
					"Eine Ausgabe ohne Auszahlung wird zum Vorfall mit Fristen, ein Sanktionstreffer zum Verdachtsfall, alles andere zur Aufgabe.",
					"Bleibt das Lebenszeichen aus, fehlt der Tagesabschluss oder ist die Sanktionsliste alt, erinnert Klick.",
				],
				result:
					"Getrennte Systeme, lückenloser Nachweis: jedes Ereignis kommt genau einmal an, mit Prüfsumme.",
			},
			{
				key: "wallet-send",
				name: "both.money: senden mit Sicherheitsschlüssel",
				summary:
					"In both.money eigene Bestände halten, empfangen und senden; jede Auszahlung bestätigt ein Sicherheitsschlüssel.",
				where: "both.money",
				trigger:
					"Auszahlung aus einem Hot-Konto an eine Adresse im Adressbuch.",
				steps: [
					"Zieladresse vorschlagen: Prüfung gegen die Sperrliste, aktiv erst nach 24 Stunden, Veto jederzeit.",
					"Auszahlung anlegen; Betrag, Ziel und höchste Gebühr stehen danach fest.",
					"Auf einer eigenen Bestätigungsseite mit dem Sicherheitsschlüssel bestätigen; ein Passkey zum Anmelden zählt dafür nicht.",
					"Ein eigener Signer ohne Netzzugang prüft Grenzen und Freigaben und signiert; both.money sendet über den eigenen Knoten.",
					"Eine Ausgabe ohne Auszahlung friert den Signer sofort ein und landet in Klick als Vorfall; „Alles stoppen“ kann jede:r in both.money.",
				],
				result:
					"Ein übernommener Webserver allein kann kein Geld bewegen. Kundengelder erst mit Erlaubnis nach MiCAR.",
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
		image: {
			...SHOTS.trustCenter,
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
				key: "platform-access",
				name: "Zugriffe durch Klick und Sicherheitsänderungen",
				summary:
					"Der Klick-Betrieb sieht deine Daten nur mit Freigabe; kritische Einstellungen brauchen eine zweite Person.",
				where:
					"Einstellungen > Zugriffe durch Klick, Sicherheitsänderungen, Netzwerk",
				trigger:
					"Support braucht Einblick, oder jemand will SSO, die IP-Liste oder Exporte ändern.",
				steps: [
					"Der Betrieb stellt einen Antrag mit Grund und Dauer; Inhaber:innen oder die Geschäftsleitung geben ihn mit Passkey frei, befristet und widerrufbar.",
					"Kritische Änderungen (SSO erzwingen, IP-Liste, Organisation löschen, Vollexport, Token) wirken erst mit einer zweiten Person, sonst nach 24 Stunden.",
					"Mit der IP-Liste erreichen nur deine Netze Klick, Token und Portale; Portale lassen sich einzeln ausnehmen.",
				],
				result:
					"Jeder Zugriff und jede Änderung steht in deinem Protokoll; eine gestohlene Sitzung allein reicht nicht.",
			},
			{
				key: "ledger",
				name: "Verlauf mit Bitcoin-Anker prüfen",
				summary:
					"Belegt, dass das Protokoll seit dem Anker nicht umgeschrieben wurde, ohne Klick zu vertrauen.",
				where: "Einstellungen > Verlauf",
				trigger:
					"Prüfung oder Kundenanfrage zur Unveränderbarkeit des Protokolls.",
				steps: [
					"Klick verankert den Kopf der Prüfsummen-Kette täglich und nach kritischen Ereignissen per OpenTimestamps in Bitcoin.",
					"Verlauf herunterladen: Kette, Anker mit Merkle-Pfad und Zeitstempel, Prüfskript.",
					"node pruefen.mjs ausführen und den Bitcoin-Block mit einem eigenen Knoten oder ots verify abgleichen.",
				],
				result:
					"Prüfbar ohne Zugang zu Klick; auf der Blockchain steht nur ein Hash, keine Inhalte.",
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
		image: {
			...SHOTS.anmeldung,
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
			{
				key: "standort",
				name: "Standort verbinden",
				summary:
					"Euer Büro verbindet sich über einen verschlüsselten Tunnel mit Klick; danach geht Klick auf Wunsch nur noch von dort.",
				where: "Einstellungen > Netzwerk",
				trigger:
					"Klick soll nur aus dem Büro erreichbar sein, nicht über das offene Internet.",
				steps: [
					"Der Klick-Betrieb richtet den Tunnel ein: Firewall, öffentliche IP und Netz im Büro reichen, IPsec oder WireGuard.",
					"Eure IT bekommt einen Link und ein Blatt mit Werten und Schritten für ihre Firewall.",
					"Steht der Tunnel, meldet Klick „verbunden“; mit zweiter Person beschränkt ihr die IP-Liste auf den Standort.",
				],
				result:
					"Klick ist für euch nur noch aus dem Büro erreichbar; Abbrüche meldet Klick nach zehn Minuten.",
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
	{ slug: "pci-dss", label: "PCI DSS" },
	{ slug: "bsi-200-2", label: "IT-Grundschutz" },
	{ slug: "bsi-200-3", label: "BSI 200-3" },
	{ slug: "bsi-200-4", label: "BSI 200-4" },
	{ slug: "iso42001", label: "ISO 42001" },
	{ slug: "tisax", label: "TISAX" },
	{ slug: "eu-us-dpf", label: "EU-US DPF" },
	{ slug: "cyber-essentials", label: "Cyber Essentials" },
	{ slug: "essential-eight", label: "Essential Eight" },
	{ slug: "nist-csf", label: "NIST CSF" },
	{ slug: "nist-800-53", label: "NIST 800-53" },
	{ slug: "nist-800-171", label: "NIST 800-171" },
	{ slug: "cmmc", label: "CMMC" },
	{ slug: "hipaa", label: "HIPAA" },
	{ slug: "nycrr-500", label: "NYDFS 500" },
	{ slug: "ccpa", label: "CCPA" },
	{ slug: "us-privacy", label: "US-Datenschutz" },
	{ slug: "aws-ftr", label: "AWS FTR" },
	{ slug: "ms-sspa", label: "Microsoft SSPA" },
	{ slug: "mvsp", label: "MVSP" },
];
export const PICKER_DEFAULT = ["iso27001", "dora", "micar", "gwg"];

export const FEATURE_FAQ: { q: string; a: string }[] = [
	{
		q: "Brauche ich ein Passwort?",
		a: "Nein. Du meldest dich mit einem Passkey an: Fingerabdruck, Gesicht oder Geräte-PIN. Er zählt als beide Faktoren. Für den Notfall gibt es einen Mail-Link, nur für bestehende Konten.",
	},
	{
		q: "Geht die Anmeldung auch mit unserem Firmenkonto?",
		a: "Ja. Je Organisation lässt sich Microsoft Entra ID, Google Workspace, Okta oder ein anderer Anbieter über OIDC oder SAML einrichten. Rollen kommen aus euren Gruppen, die Firmen-MFA kann zählen, und SSO lässt sich für eure Domain erzwingen.",
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
		a: "Nicht von selbst. Alles, was Klick vorschlägt, folgt nachvollziehbaren Regeln aus dem Katalog und deinen Daten. Eine KI nutzt Klick nur, wenn deine Organisation sie mit eigenem Schlüssel einrichtet, und nur auf Knopfdruck; die Antwort ist ein gekennzeichneter Vorschlag, den du selbst übernimmst. Entscheidungen triffst du.",
	},
	{
		q: "Bekomme ich meine Daten wieder heraus?",
		a: "Ja. Prüfungspaket, Informationsregister und ein vollständiger Export aller Daten deiner Organisation stehen als ZIP bereit, mit Prüfsummen und nach Bestätigung per Passkey.",
	},
	{
		q: "Gibt es eine Anleitung?",
		a: "Ja. Unter „Hilfe“ erklärt Klick jeden Bereich Schritt für Schritt: wozu er da ist, wer was darf, was Klick von selbst tut und welche Normen und Rahmenwerke dahinterstehen. Oben rechts öffnet „Hilfe zu dieser Seite“ den passenden Artikel.",
	},
	{
		q: "Wie lange dauert der Einstieg?",
		a: "Die geführte Einrichtung hat sechs Schritte und speichert sofort. Danach steht der Arbeitsvorrat; die Gap-Analyse kannst du kapitelweise beantworten.",
	},
	{
		q: "Was kostet Klick?",
		a: "Die Software kostet eine Jahresgebühr, fällig erst nach dem bestandenen Audit; eine Monatszahlung gibt es nicht. Berater-Zugänge kosten ab dem ersten Tag, unsere Beratung besprechen wir im Gespräch. Die Stufen stehen unter Preise.",
	},
];
