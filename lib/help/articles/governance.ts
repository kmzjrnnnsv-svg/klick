import type { HelpArticle } from "../types";

// Steuerung: Organisation, Beschlüsse/Managementbewertung/Berichte/Änderungen,
// Audits/Abweichungen/Testprogramm, Kalender/Roadmap, Trust Center.

export const GOVERNANCE: HelpArticle[] = [
	{
		slug: "organisation",
		area: "governance",
		title: "Organisation: Kontext, Rollen, Ziele, Aufsicht",
		summary:
			"Kontext und interessierte Parteien, Geltungsbereich, Rollen und Leitung, Organigramm, Ziele mit Kennzahlen, Kommunikation, Aufsicht und Interessenkonflikte.",
		sections: [
			{
				id: "kontext",
				heading: "Kontext und Geltungsbereich",
				list: [
					"Interne und externe Themen, die dein Managementsystem beeinflussen.",
					"Interessierte Parteien (Kund:innen, Aufsicht, Mitarbeitende, Dienstleister) mit ihren Erwartungen.",
					"Der Geltungsbereich: Standorte, Tätigkeiten, Systeme und Ausschlüsse. Bei ISO 27001 gibt ihn die Geschäftsleitung frei.",
				],
			},
			{
				id: "leitung",
				heading: "Rollen und Leitung",
				body: [
					"Hier stehen alle Funktionen mit ihren Inhaber:innen, Vertretungen, Status (vorgeschlagen, bestellt, Annahme offen) und Hinweisen wie „ohne Bestellungsbeschluss“ oder „Anzeige offen“. Die Übersicht „Wer trägt was“ zeigt je Person ihre Funktionen und weist auf unzulässige Kombinationen hin, etwa Geldwäschebeauftragte:r und Vertrieb in einer Person.",
					"Für Geschäftsleitung und Schlüsselfunktionen pflegst du Zuverlässigkeit und fachliche Eignung (verschlüsselt).",
					"Im individuellen Modus gibt es dazu die Rollen-Tafel: Personen per Ziehen auf Rollen legen, Bereiche auf Rollen ziehen, das Organigramm bearbeiten. Jeder Schritt geht auch über das Menü „…“.",
				],
			},
			{
				id: "ziele",
				heading: "Ziele und Kennzahlen",
				steps: [
					"Leg ein Ziel an, zum Beispiel „Alle Mitarbeitenden jährlich geschult“, und wähl die Art: Leistungs-, Risiko- oder Kontrollkennzahl.",
					"Leg Richtung, Zielwert, Frühwarn- und Alarmschwelle und das Messintervall fest. Für manche Vorlagen schlägt Klick den Messwert aus seinen Daten vor.",
					"Das Ziel geht zur Freigabe an die Geschäftsleitung; erst freigegebene Ziele zählen.",
					"Trag Messungen ein. Liegt ein Wert jenseits der Alarmschwelle, öffnet Klick einmal eine Managementanfrage.",
				],
			},
			{
				id: "weitere",
				heading: "Kommunikation, Aufsicht, Konflikte",
				list: [
					"Kommunikationsmatrix: wer was an wen wann kommuniziert; druckbare Krisenkontakte.",
					"Aufsicht: zuständige Behörden, Ansprechpersonen und Fristen.",
					"Interessenkonflikte: erfassen, bewerten und Maßnahmen dokumentieren.",
					"Standorte: Büros und Rechenzentren mit Kritikalität; kritische bekommen eine Notfallübung im Testprogramm.",
				],
			},
		],
		roles: [
			"Ändern nach der Einrichtung: Inhaber:innen und Bearbeiter:innen mit Bestätigung; Bestellungen über die Geschäftsleitung.",
		],
		norms: [
			{ key: "iso27001:4.1", why: "Kontext der Organisation." },
			{ key: "iso27001:4.2", why: "Interessierte Parteien." },
			{ key: "iso27001:4.3", why: "Anwendungsbereich." },
			{ key: "iso27001:5.3", why: "Rollen und Befugnisse." },
			{ key: "iso27001:6.2", why: "Ziele mit Messung." },
			{ key: "iso27001:7.4", why: "Kommunikation." },
			{
				key: "micar:Art.72",
				why: "Interessenkonflikte bei Kryptowerte-Dienstleistern.",
			},
			{ key: "soc2:CC1.3", why: "Strukturen, Berichtswege und Befugnisse." },
		],
		related: ["bestellung", "beschluesse", "einrichtung"],
	},
	{
		slug: "beschluesse",
		area: "governance",
		title: "Beschlüsse, Managementbewertung, Berichte und Änderungen",
		summary:
			"Wie Entscheidungen der Geschäftsleitung dokumentiert werden, wie die Managementbewertung abläuft, wie Funktionen an die Leitung berichten und wie neue Produkte genehmigt werden.",
		sections: [
			{
				id: "beschluesse",
				heading: "Beschlüsse",
				body: [
					"Ein Beschluss ist eine dokumentierte Entscheidung der Geschäftsleitung mit Datum, Inhalt und Rahmenwerk-Bezug. Klick legt Beschlüsse automatisch an, wenn die Geschäftsleitung eine Freigabe abschließt; du kannst sie auch von Hand erfassen.",
					"Pflichtbeschlüsse kommen aus deinen Rahmenwerken, zum Beispiel Informationssicherheitsleitlinie, Geltungsbereich, Rollen und Verantwortlichkeiten, Geldwäsche-Risikoanalyse oder Strategie. Die Liste zeigt, welche fehlen oder erneuert werden müssen.",
				],
			},
			{
				id: "anfragen",
				heading: "Managementanfragen",
				steps: [
					"Stell eine Anfrage an die Geschäftsleitung mit Sachverhalt, Optionen, Unterlagen und Frist.",
					"Klick warnt vorher, wenn niemand außer dir entscheiden könnte.",
					"Die Geschäftsleitung wählt eine Option und gibt frei; daraus entsteht ein Beschluss.",
				],
			},
			{
				id: "bewertung",
				heading: "Managementbewertung",
				steps: [
					"Leg die Bewertung an. Klick zeigt die Pflicht-Inputs deiner Rahmenwerke (Stand der Maßnahmen, Änderungen, Leistung, Audits, Abweichungen, Risiken, Chancen) und füllt sie mit einer Zusammenfassung aus deinen Daten.",
					"Halt die Sitzung ab und notier Ergebnisse. Jedes Ergebnis wird ein Beschluss, eine Maßnahme (Aufgabe) oder eine Abweichung.",
					"Beim Abschließen hält Klick einen Schnappschuss fest; der Bericht bleibt so, wie er vorgelegt wurde.",
				],
			},
			{
				id: "berichte",
				heading: "Berichte an die Geschäftsleitung",
				body: [
					"Funktionen wie Informationssicherheit, Geldwäsche, Datenschutz oder Compliance berichten regelmäßig an die Leitung. Unter Berichte an die GL zeigt Klick, welcher Bericht fällig ist, schlägt den Zeitraum vor und füllt die Kennzahlen. Beim Vorlegen werden die Zahlen eingefroren; die Geschäftsleitung bestätigt die Kenntnisnahme per Passkey.",
				],
			},
			{
				id: "aenderungen",
				heading: "Neue Produkte und wesentliche Änderungen",
				body: [
					"Unter Änderungen stellst du einen Antrag für ein neues Produkt, einen neuen Markt, einen Vertriebsweg oder eine wesentliche IT-Änderung, mit betroffenen Prozessen, Assets und Risiken. Je nach Art prüfen IKT-Risikokontrolle, Risikocontrolling und Compliance, zuletzt entscheidet die Geschäftsleitung.",
				],
			},
		],
		roles: [
			"Beschlüsse und Managementbewertung: Recht „Managementbewertung“; freigeben nur die Geschäftsleitung.",
			"Managementanfragen stellen: Recht „Entscheidung anfragen“.",
		],
		automation: [
			"Jährliche Pflichtbeschlüsse erinnern vor ihrem Ablauf.",
			"Fällige Berichte erscheinen auf Heute der berichtenden Funktion.",
		],
		norms: [
			{ key: "iso27001:5.1", why: "Führung und Verpflichtung der Leitung." },
			{ key: "iso27001:9.3", why: "Managementbewertung mit Pflicht-Inputs." },
			{ key: "dora:Art.5(2)", why: "Endverantwortung des Leitungsorgans." },
			{
				key: "nis2:Art.20(1)",
				why: "Billigung und Überwachung durch die Geschäftsleitung.",
			},
			{
				key: "zag-marisk:AT3",
				why: "Gesamtverantwortung der Geschäftsleitung.",
			},
			{ key: "zag-marisk:AT8", why: "Neue-Produkte-Prozess." },
			{ key: "zag-marisk:BT3", why: "Risikoberichterstattung an die Leitung." },
		],
		related: ["freigaben", "organisation", "audits"],
	},
	{
		slug: "audits",
		area: "governance",
		title: "Audits, Abweichungen und Testprogramm",
		summary:
			"Auditprogramm, Audit-Cockpit mit Prüfpfad und Nachweisanfragen, Abweichungen mit Ursache und Wirksamkeit, Testprogramm mit Notfall- und Penetrationstests.",
		sections: [
			{
				id: "programm",
				heading: "Auditprogramm",
				body: [
					"Plane interne und externe Audits über drei Jahre. Klick prüft, ob jedes Rahmenwerk und jeder Bereich im Zyklus vorkommt, und kennt den Turnus je Rahmenwerk (zum Beispiel jährliches Überwachungsaudit bei ISO 27001). Eigene Fristen legst du unter Einstellungen > Audits & Fristen fest.",
				],
			},
			{
				id: "cockpit",
				heading: "Das Audit-Cockpit",
				steps: [
					"Öffne das Audit. Der Prüfpfad führt von der Anforderung über das Control zum Nachweis.",
					"Lad Prüfer:innen über Team mit der Rolle Prüfer:in ein. Sie sehen die gültigen Fassungen und arbeiten im Cockpit.",
					"Prüfer:innen stellen Nachweisanfragen (PBC). Jede Anfrage wird eine Aufgabe für die verantwortliche Person; die Antwort mit Nachweis erscheint im Cockpit.",
					"Findings erfassen Prüfer:innen direkt. Ab Schwere „leicht“ legt Klick eine Abweichung an.",
					"Exportier das Prüfungspaket: SoA, Lücken, Controls, Risiken, gültige Dokumentfassungen im Zeitraum, Nachweis-Index, Vorfälle, Protokollauszug, Findings. Jede Datei ist über eine Prüfsumme im Manifest gesichert.",
				],
				tip: "Prüf vor dem Audit die Unabhängigkeit: Wer intern prüft, darf den geprüften Bereich nicht selbst verantworten. Klick weist darauf hin.",
			},
			{
				id: "abweichungen",
				heading: "Abweichungen (CAPA)",
				list: [
					"Abweichungen entstehen aus Findings, nicht bestandenen Tests, schweren Vorfällen, Scan-Befunden oder von Hand.",
					"Je Abweichung: Sofortmaßnahme, Ursachenanalyse, Korrekturmaßnahme, Frist nach Klasse (Haupt-, Nebenabweichung, Hinweis) und Rahmenwerk.",
					"Die Geschäftsleitung kann priorisieren.",
					"Abschließen geht nur mit der Wirksamkeitsprüfung „wirksam“.",
				],
			},
			{
				id: "testprogramm",
				heading: "Testprogramm",
				body: [
					"Das Jahresprogramm bündelt alle Tests: Notfalltests je kritischem Prozess, Wiederherstellungstests, Übungen je kritischem Standort, Schwachstellenscans, Penetrationstests und bei Bedarf bedrohungsorientierte Tests (TLPT) mit ihrer Uhr. Erledigte Tests tragen ein Ergebnis; nicht bestandene erzeugen eine Abweichung.",
				],
			},
		],
		roles: [
			"Prüfer:innen: lesen, Nachweisanfragen, Findings, Abweichungen anlegen.",
			"Abweichungen bearbeiten: die verantwortliche Funktion; priorisieren die Geschäftsleitung.",
		],
		automation: [
			"Erinnerung an Audittermine 90, 30 und 7 Tage vorher und an Fristen von Abweichungen.",
			"Der Zugang von Prüfer:innen endet automatisch nach 6 Wochen.",
		],
		norms: [
			{ key: "iso27001:9.2", why: "Internes Auditprogramm." },
			{ key: "iso27001:10.2", why: "Nichtkonformität und Korrekturmaßnahmen." },
			{ key: "iso27001:A.5.35", why: "Unabhängige Überprüfung." },
			{ key: "dora:Art.6(6)", why: "Prüfung durch die Interne Revision." },
			{
				key: "dora:Art.11(6)",
				why: "Jährliche Tests der Geschäftsfortführungspläne.",
			},
			{ key: "dora:Art.26", why: "Bedrohungsorientierte Penetrationstests." },
			{ key: "zag-marisk:AT4.4.3", why: "Interne Revision." },
			{ key: "soc2:CC4.2", why: "Mängel melden und beheben." },
		],
		related: ["nachweise", "fassungen", "ueberblick"],
	},
	{
		slug: "kalender",
		area: "governance",
		title: "Kalender und Roadmap",
		summary:
			"Alle Fristen an einem Ort und der Weg zur Zulassung als Kanban und Zeitachse.",
		sections: [
			{
				id: "kalender",
				heading: "Kalender",
				body: [
					"Der Kalender sammelt alle Termine: Pflichten-Läufe (zum Beispiel jährliche Risikoanalyse), Reviews, Audits, Fristen von Abweichungen und Vorfällen, Supportende von Assets und Produkten, Wiedervorlagen von Dienstleistern und Funktionen, Anzeigen an Behörden und Rechtsänderungen. Die Ansicht „Nächste 90 Tage“ lässt sich nach Art filtern.",
					"Einen Lauf erledigst du direkt im Kalender oder markierst ihn mit Begründung als entfallen.",
				],
			},
			{
				id: "roadmap",
				heading: "Roadmap",
				steps: [
					"Übernimm die Vorlage für deine Lizenzstufe (Vorbereitung bis Bank) oder leg Meilensteine selbst an.",
					"Schieb Meilensteine im Kanban durch die Spalten oder nutz das Menü.",
					"Mach aus einem Meilenstein eine Aufgabe, damit er auf Heute erscheint.",
					"Die Zeitachse zeigt Meilensteine zusammen mit den wichtigsten Terminen aus dem Kalender.",
				],
			},
			{
				id: "antrag",
				heading: "Antrag auf Zulassung",
				body: [
					"Für MiCAR und ZAG zeigt der Bereich Antrag die Bestandteile des Erlaubnisantrags mit ihrer Vollständigkeit, abgeleitet aus Registern und Nachweisen. Der Export bündelt alles für die Einreichung.",
				],
			},
		],
		norms: [
			{ key: "iso27001:6.2", why: "Planung, wie Ziele erreicht werden." },
			{ key: "micar:Art.62-63", why: "Bestandteile des Zulassungsantrags." },
			{ key: "zag:§10", why: "Erlaubnisantrag nach ZAG." },
		],
		related: ["heute", "casp"],
	},
	{
		slug: "trust-center",
		area: "governance",
		title: "Trust Center",
		summary:
			"Eine öffentliche Seite für Kund:innen und Interessent:innen mit Rahmenwerken, Maßnahmen, Unterauftragnehmern und Unterlagen auf Anfrage.",
		sections: [
			{
				id: "pflegen",
				heading: "Pflegen und veröffentlichen",
				steps: [
					"Öffne Trust Center und pflege den Entwurf: Einleitung, gezeigte Rahmenwerke, Controls je Bereich, Unterauftragnehmer, Unterlagen und Kontakt.",
					"Wähl je Unterlage, ob sie öffentlich ist oder nur nach unterzeichneter Vertraulichkeitsvereinbarung (NDA). Streng geheime Unterlagen erscheinen nie, vertrauliche nur mit NDA.",
					"Tipp auf „Veröffentlichen“. Klick baut einen Schnappschuss; nur er ist öffentlich. Unzulässige Einträge fallen mit Warnung heraus.",
				],
			},
			{
				id: "anfragen",
				heading: "Anfragen beantworten",
				steps: [
					"Besucher:innen fordern Unterlagen an und stimmen der angezeigten NDA-Fassung zu.",
					"Du gibst die Anfrage frei. Klick schickt einen Link, der 7 bis 90 Tage gilt.",
					"Jeder Download wird protokolliert. Du kannst den Zugang jederzeit zurückziehen.",
				],
			},
		],
		roles: ["Veröffentlichen, zurückziehen, freigeben: mit Bestätigung."],
		norms: [
			{
				key: "iso27001:7.4",
				why: "Externe Kommunikation zur Informationssicherheit.",
			},
			{
				key: "soc2:CC2.3",
				why: "Kommunikation mit Externen über die Kontrollen.",
			},
			{ key: "iso27001:A.6.6", why: "Vertraulichkeitsvereinbarungen." },
		],
		related: ["nachweise", "dokumente"],
	},
];
