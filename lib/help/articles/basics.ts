import type { HelpArticle } from "../types";

// Grundlagen: Einstieg, Heute, Einrichtung, Anmeldung, Rollen, Bestellung,
// Freigaben, Fassungen, Richtlinien, Glossar.

export const BASICS: HelpArticle[] = [
	{
		slug: "erste-schritte",
		area: "basics",
		audience: "employee",
		title: "Erste Schritte in Klick",
		summary:
			"Wie Klick aufgebaut ist, wie du dich zurechtfindest und warum ein Control für viele Rahmenwerke zählt.",
		sections: [
			{
				id: "idee",
				heading: "Die Idee: ein Control, viele Anforderungen",
				body: [
					"Rahmenwerke wie ISO 27001, DORA, NIS2, MiCAR oder das GwG verlangen vieles doppelt: Zugriffsschutz, Notfallplanung, Lieferantensteuerung, Schulungen. Klick bündelt diese Pflichten in rund 170 harmonisierten Controls. Ein Control ist eine Maßnahme, die du einmal umsetzt und belegst. Klick rechnet daraus für jedes gewählte Rahmenwerk ab, wie weit du bist.",
					"Die Anforderung ist das Warum (zum Beispiel ISO 27001 A.5.15 „Zugangssteuerung“), das Control das Was (zum Beispiel CC-IAM-01 „Zugriffsrechte nach dem Need-to-know-Prinzip“). Die Verbindung zwischen beiden heißt Kante. Den Stand führst du am Control; die Abdeckung je Rahmenwerk wird nie gespeichert, sondern immer frisch abgeleitet.",
				],
			},
			{
				id: "navigation",
				heading: "So findest du dich zurecht",
				body: [
					"Am Computer steht links die Seitenleiste mit den Bereichen. Ab Tablet-Breite scrollen Seitenleiste und Inhalt je für sich; Impressum und Datenschutz stehen klein unten in der Seitenleiste. Zugeklappte Gruppen bleiben zu, bis du sie wieder öffnest. Am Handy gibt es unten eine Leiste mit höchstens fünf Tabs: Heute, Umsetzen, Register, Steuerung und Suche. Umsetzen, Register und Steuerung öffnen eine Liste ihrer Seiten.",
					"Verwandte Seiten teilen sich einen Eintrag. Oben auf der Seite wechselst du zwischen ihnen: Synergien und Zusammenhänge, Kalender und Roadmap (Planung), Managementbewertung und Berichte an die GL, Abweichungen und Testprogramm, Team und Aktivität, Rahmenwerke und Plattform-Baseline.",
				],
				list: [
					"Heute: deine Aufgaben, offene Freigaben, Kenntnisnahmen und was bald fällig ist.",
					"Umsetzen: Überblick, Gap-Analyse, Rahmenwerke (alle gewählten auf einer Seite), Controls, Nachweise, Synergien und Sicherheit.",
					"Register: Risiken, Dokumente, Prozesse, Dienstleister, Assets, Vorfälle, Produkte, Schulungen, Datenschutz.",
					"Steuerung: Organisation, Beschlüsse, Audits, Managementbewertung, Trust Center, Abweichungen, Planung und, je nach Erlaubnis, Geldwäsche und CASP-Themen.",
					"Oben rechts: Suche (⌘K bzw. Strg+K), Glocke mit Benachrichtigungen, dein Konto und der Hilfe-Knopf. Der Hilfe-Knopf öffnet immer den Artikel zur aktuellen Seite.",
				],
			},
			{
				id: "start",
				heading: "Die ersten zehn Minuten",
				steps: [
					"Schließ die geführte Einrichtung ab: Rollen, Unternehmen, Standorte, Tätigkeit, IT und Daten, Rahmenwerke. Klick legt daraus deinen Arbeitsvorrat an.",
					"Starte die Gap-Analyse. Sie stellt je Control eine Frage und zeigt dir, wo du heute stehst.",
					"Öffne Heute. Dort stehen die Aufgaben, die aus Einrichtung und Gap-Analyse entstanden sind.",
					"Lade für erledigte Controls Nachweise hoch oder erzeuge sie in Klick (Nachweis-Werkstatt).",
					"Schau im Überblick nach, wie sich die Abdeckung je Rahmenwerk entwickelt.",
				],
				tip: "Du musst nicht alles auf einmal machen. Klick merkt sich deinen Stand, und Heute zeigt dir jeden Tag, was als Nächstes dran ist.",
			},
			{
				id: "begriffe",
				heading: "Wichtige Begriffe",
				list: [
					"Rahmenwerk: ein Gesetz, eine Verordnung oder eine Norm, zum Beispiel DORA oder ISO 27001.",
					"Anforderung: eine einzelne Pflicht daraus, zum Beispiel DORA Art. 28.",
					"Control: eine Maßnahme, die eine oder mehrere Anforderungen erfüllt.",
					"Nachweis: ein Beleg, dass ein Control wirkt (Datei, Link, erzeugtes PDF, verfasster Bericht).",
					"Verantwortlich: die Funktion oder Person, die für einen Eintrag geradesteht. Bearbeitet von: wer gerade daran arbeitet.",
					"Freigabe: eine Entscheidung nach Vier-Augen-Prinzip, bevor etwas wirksam wird.",
				],
			},
		],
		faq: [
			{
				q: "Warum zeigt Klick für zwei Rahmenwerke unterschiedliche Prozentwerte, obwohl ich ein Control erledigt habe?",
				a: "Jedes Rahmenwerk hat andere Anforderungen. Ein Control kann bei ISO 27001 drei Anforderungen tragen und bei DORA nur eine. Die Abdeckung wird je Rahmenwerk über seine Anforderungen gerechnet.",
			},
			{
				q: "Kann ich etwas kaputt machen?",
				a: "Wichtige Schritte (Freigaben, Löschen, Exporte, Einstellungen) fragen nach und verlangen eine frische Bestätigung per Passkey. Jede Änderung steht im Protokoll mit Vorher und Nachher.",
			},
		],
		norms: [
			{
				key: "iso27001:4.4",
				why: "Klick ist das Werkzeug, mit dem du das Managementsystem aufbaust, betreibst und verbesserst.",
			},
			{
				key: "dora:Art.6(1-4)",
				why: "Der IKT-Risikomanagementrahmen nach DORA lässt sich über die Controls und Register abbilden.",
			},
		],
		related: ["einrichtung", "heute", "controls", "glossar"],
	},
	{
		slug: "heute",
		area: "basics",
		title: "Heute: dein Arbeitsplatz",
		summary:
			"Aufgaben, Freigaben, Kenntnisnahmen, Schulungen und Fristen auf einen Blick, sortiert nach Dringlichkeit.",
		sections: [
			{
				id: "karten",
				heading: "Was auf Heute steht",
				list: [
					"Aufgaben, die dir zugewiesen sind oder die du verantwortest, mit Fälligkeit und Status.",
					"Freigaben, über die du entscheiden darfst (Posteingang unter Heute > Freigaben).",
					"Dokumente, deren Kenntnisnahme von dir erwartet wird.",
					"Schulungen, die in den nächsten 30 Tagen fällig sind oder überfällig sind.",
					"Fällige Reviews, Pflichten-Läufe, Abweichungen und Termine aus dem Kalender.",
					"Die Karte zur Gap-Analyse, solange noch keine abgeschlossen ist.",
				],
			},
			{
				id: "aufgaben",
				heading: "Mit Aufgaben arbeiten",
				steps: [
					"Öffne eine Aufgabe über ihren Titel. Sie zeigt, woher sie kommt (Control, Risiko, Vorfall, Gap-Analyse …).",
					"Setz den Status: offen, in Arbeit, erledigt. Manche Übergänge verlangen eine Begründung.",
					"Hinterleg Kommentare und erwähn Kolleg:innen mit @Name; sie bekommen eine Benachrichtigung.",
					"Hängt die Aufgabe an einem Control, lade dort den Nachweis hoch. So zählt die Arbeit für alle Rahmenwerke.",
				],
			},
			{
				id: "verantwortung",
				heading: "Meine Verantwortung",
				body: [
					"Unter Heute > Meine Verantwortung siehst du alles, wofür du verantwortlich bist: Controls, Risiken, Dokumente, Dienstleister, Prozesse, Funktionen. Die Seite ist druckbar und eignet sich als Nachweis für die Rollenbeschreibung.",
				],
			},
		],
		automation: [
			"Der tägliche Tick erinnert an fällige Reviews, ablaufende Nachweise, offene Kenntnisnahmen, Schulungen, Vorfall-Fristen und Freigaben, deren Bearbeitungszeit überschritten ist.",
			"Wichtige Ereignisse (Sicherheitsmeldungen, Fristen bei Vorfällen) kommen sofort per Mail, der Rest gesammelt in der Tages-Mail um 7 Uhr. Unter Einstellungen > Benachrichtigungen stellst du je Art um, auf Wunsch auch auf Microsoft Teams.",
		],
		faq: [
			{
				q: "Warum sehe ich eine Aufgabe nicht mehr?",
				a: "Erledigte Aufgaben verschwinden von Heute. Unter Heute > Aufgaben findest du alle, auch erledigte, mit Filter.",
			},
		],
		norms: [
			{
				key: "iso27001:6.2",
				why: "Aufgaben mit Verantwortlichen und Fristen zeigen, wie Ziele geplant und erreicht werden.",
			},
		],
		related: ["freigaben", "erste-schritte", "schulungen"],
	},
	{
		slug: "einrichtung",
		area: "basics",
		title: "Geführte Einrichtung",
		summary:
			"In sieben Schritten von der neuen Organisation zum Arbeitsvorrat: Rollen, Unternehmen, Standorte, Tätigkeit, IT, Rahmenwerke, Gap-Analyse.",
		sections: [
			{
				id: "ablauf",
				heading: "Die sieben Schritte",
				steps: [
					"Rollen: Wer ist Geschäftsleitung, wer Informationssicherheitsbeauftragte:r, Datenschutzbeauftragte:r, Geldwäschebeauftragte:r? Eine Person kann mehrere Funktionen tragen, eine Funktion mehrere Personen haben. Dazu legst du fest, welche Funktion für welchen Bereich verantwortlich ist.",
					"Unternehmen: Rechtsform, Beschäftigte, Umsatz und Bilanzsumme. Klick stuft daraus KMU-Status, NIS2-Betroffenheit und DORA-Anwendbarkeit ein (als Orientierung gekennzeichnet).",
					"Standorte: Büros, Rechenzentren, Lager. Kritische Standorte bekommen später eine Notfallübung im Testprogramm.",
					"Tätigkeit: Branche, Finanzdienste, Kryptowerte-Dienste, Produkte. Daraus folgen Lizenzstufe und Pflichten.",
					"IT und Daten: wichtige Systeme, Dienstleister, Art der Daten. Daraus entstehen Assets und Dienstleister im Register. Dazu ein paar Ja/Nein-Fragen, etwa zu KI, Kundschaft aus der Autoindustrie, Aufträgen für US-Behörden, Gesundheitsdaten aus den USA, einer Erlaubnis in New York oder einer Partnerschaft mit AWS oder Microsoft. Sie entscheiden, welche weiteren Rahmenwerke Klick vorschlägt.",
					"Rahmenwerke: Klick schlägt vor, was für dich gilt; du wählst endgültig aus.",
					"Gap-Analyse: die vorbelegte Selbsteinschätzung startet. Antworten aus der Einrichtung stehen dort schon als „teilweise“ mit dem Hinweis „Aus der Einrichtung“.",
				],
				tip: "Jeder Schritt speichert sofort. Mit „Später fortsetzen“ kommst du jederzeit zurück; bis zum Abschluss brauchst du dafür keine zusätzliche Bestätigung.",
			},
			{
				id: "modus",
				heading: "Standard oder individuell",
				body: [
					"Im Schritt Rollen wählst du, ob Klick Rollen und Freigaben nach deinen Rahmenwerken festlegt (Standard) oder ob du eigene Rollen anlegst und Abläufe frei gestaltest (individuell). Im individuellen Modus warnt Klick bei fehlenden Pflichten, statt sie zu erzwingen. Du kannst jederzeit wechseln.",
				],
			},
			{
				id: "danach",
				heading: "Nach der Einrichtung",
				body: [
					"Änderungen an Stammdaten, Rahmenwerken und Rollen laufen danach über Einstellungen und Organisation und verlangen eine frische Bestätigung. Neu gewählte Rahmenwerke schalten ihre Pflicht-Freigaben ein und ergänzen den Arbeitsvorrat.",
				],
			},
		],
		roles: [
			"Die Einrichtung führt, wer die Organisation angelegt hat (Inhaber:in).",
			"Eingeladene Funktionsträger:innen werden beim Annehmen der Einladung automatisch mit ihrer Funktion verknüpft.",
		],
		norms: [
			{
				key: "iso27001:4.1",
				why: "Unternehmen, Tätigkeit und Standorte beschreiben den Kontext der Organisation.",
			},
			{
				key: "iso27001:4.3",
				why: "Aus Standorten, Tätigkeit und IT ergibt sich der Geltungsbereich.",
			},
			{
				key: "nis2:Art.2-3",
				why: "Größe und Sektor entscheiden, ob du wesentliche oder wichtige Einrichtung bist.",
			},
		],
		related: ["bestellung", "rahmenwerke", "gap-analyse"],
	},
	{
		slug: "anmeldung",
		area: "basics",
		audience: "employee",
		title: "Anmeldung, Passkey und Bestätigung",
		summary:
			"Passkey zuerst, Firmenkonto per SSO, der Mail-Link als Notweg, Sitzungsregeln und die Bestätigung wichtiger Schritte.",
		sections: [
			{
				id: "passkey",
				heading: "Mit Passkey anmelden",
				body: [
					"Ein Passkey ist ein Schlüssel, der auf deinem Gerät liegt und mit Fingerabdruck, Gesicht oder Geräte-PIN freigegeben wird. Er ersetzt Passwort und zweiten Faktor zugleich und lässt sich nicht abfischen, weil er nur auf der echten Adresse von Klick funktioniert.",
				],
				steps: [
					"Öffne die Anmeldeseite und tipp auf „Mit Passkey anmelden“, oder wähl den Passkey direkt im E-Mail-Feld aus.",
					"Bestätige mit Fingerabdruck, Gesicht oder PIN.",
					"Unter Einstellungen > Sicherheit legst du weitere Passkeys an, zum Beispiel für Handy und Laptop.",
				],
				tip: "Leg mindestens zwei Passkeys an. Den letzten Faktor kannst du nicht löschen, damit du dich nicht aussperrst.",
			},
			{
				id: "sso",
				heading: "Mit dem Firmenkonto (SSO)",
				body: [
					"Hat deine Organisation SSO eingerichtet, gibst du deine geschäftliche E-Mail-Adresse ein und tippst auf „Mit Firmen-Login (SSO)“. Klick leitet dich zu Microsoft, Google, Okta oder dem Anbieter deiner Firma weiter. Beim ersten Mal legt Klick dein Konto an; die Rolle kommt aus deinen Gruppen.",
					"Ist SSO erzwungen, geht die Anmeldung für Adressen der Firmen-Domain nur noch so. Hat deine Organisation die Firmen-MFA anerkannt, brauchst du danach keinen zweiten Faktor in Klick.",
				],
			},
			{
				id: "notweg",
				heading: "Der Mail-Link als Notweg",
				body: [
					"Kommst du ohne Passkey nicht weiter, fordere unter „Anmeldung per Link“ einen Mail-Link an. Er gilt kurz und nur einmal; der Klick auf der Seite löst ihn ein, damit Link-Scanner im Postfach ihn nicht verbrauchen. Danach richtest du gleich einen neuen Passkey ein.",
					"Hast du alle Passkeys verloren, kann deine Inhaberin oder dein Inhaber den Zugang zurücksetzen. Du bekommst dann einen Link, mit dem du einen neuen Passkey anlegst.",
				],
			},
			{
				id: "sitzung",
				heading: "Sitzungen und Bestätigung",
				list: [
					"Eine Sitzung endet nach 30 Minuten ohne Aktivität und spätestens nach 12 Stunden.",
					"Für wichtige Schritte (Freigaben, Exporte, Löschen, Einstellungen, vertrauliche Nachweise) fragt Klick nach einer frischen Bestätigung per Passkey oder Code. Sie gilt 10 Minuten.",
					"Die Bestätigung erscheint im geöffneten Fenster; danach läuft die Aktion von selbst weiter.",
					"Meldest du dich auf einem neuen Gerät an, bekommst du eine Mail.",
				],
			},
		],
		faq: [
			{
				q: "Ich sehe „Bitte mit dem Firmenkonto anmelden“. Was nun?",
				a: "Deine Organisation hat SSO erzwungen. Gib deine geschäftliche Adresse ein und nutz „Mit Firmen-Login (SSO)“.",
			},
			{
				q: "Es erscheint kein Passkey-Fenster, sondern eine Meldung mit „Technischer Hinweis“. Was nun?",
				a: "Der Browser hat die Anmeldung bei Klick nicht starten können, dein Passkey ist dabei unberührt. Lade die Seite neu. Hilft das nicht, öffne die Anmeldeseite in einem privaten Fenster oder lösch die Website-Daten von Klick in den Browser-Einstellungen. Bleibt es dabei, schick den technischen Hinweis und die Uhrzeit an deine Inhaberin oder deinen Inhaber.",
			},
			{
				q: "Warum fragt Klick noch einmal nach meinem Passkey, obwohl ich angemeldet bin?",
				a: "Das ist die Bestätigung für einen wichtigen Schritt. Sie schützt davor, dass jemand an einem offenen Gerät etwas freigibt oder exportiert.",
			},
		],
		norms: [
			{
				key: "iso27001:A.5.17",
				why: "Passkeys und Bestätigungen sind die Authentisierung nach dem Stand der Technik.",
			},
			{
				key: "iso27001:A.8.5",
				why: "Sichere Authentisierung mit Mehr-Faktor für alle Rollen.",
			},
			{
				key: "nis2:Art.21(2)(j)",
				why: "NIS2 verlangt Multi-Faktor-Authentisierung.",
			},
		],
		related: ["rollen-rechte", "einstellungen"],
	},
	{
		slug: "rollen-rechte",
		area: "basics",
		title: "Rollen und Rechte",
		summary:
			"Inhaber:in, Bearbeiter:in, Lesend, Mitarbeitende, Prüfer:in und Berater:in, eigene Rollen und was jede Rolle darf.",
		sections: [
			{
				id: "grundrollen",
				heading: "Die Grundrollen",
				list: [
					"Inhaber:in: darf alles, auch Einstellungen, Team, Freigabe-Abläufe und Organisation löschen.",
					"Bearbeiter:in: arbeitet in allen Bereichen, gibt aber nicht frei und ändert keine Einstellungen.",
					"Lesend: sieht alles und kommentiert, ändert nichts.",
					"Mitarbeitende: sehen nur die Richtlinien, die für sie gelten, bestätigen die Kenntnisnahme und laden freigegebene Nachweise.",
					"Prüfer:in (extern, befristet): liest, stellt Nachweisanfragen und Findings; sieht nur gültige Fassungen.",
					"Berater:in (extern, befristet): arbeitet wie Bearbeiter:in ohne Löschen, Freigaben und Einstellungen; sieht Entwürfe und Verlauf.",
				],
			},
			{
				id: "team",
				heading: "Mitglieder einladen",
				steps: [
					"Öffne Team und tipp auf „Einladen“.",
					"Gib E-Mail-Adresse und Rolle an. Externe bekommen einen befristeten Zugang (Prüfer:innen 6 Wochen, Berater:innen 90 Tage).",
					"Kopier den Einladungslink oder lass ihn per Mail schicken. Die Person legt damit ihren Passkey an.",
				],
				tip: "Ein Konto hat höchstens eine eigene Mitgliedschaft; als Berater:in darf es beliebig viele Organisationen betreuen.",
			},
			{
				id: "eigene",
				heading: "Eigene Rollen",
				body: [
					"Im individuellen Modus legst du unter Einstellungen > Rollen & Rechte eigene Rollen an, zum Beispiel Einkauf oder Finanzen. Eigene Rollen sind vollwertige Funktionen: Sie können verantwortlich sein, in Freigaben stehen und im Organigramm erscheinen. Die Rechte einer eigenen Rolle gelten zusätzlich zur Grundrolle und erst, wenn die Geschäftsleitung die Person bestellt hat.",
				],
			},
			{
				id: "externe",
				heading: "Externe Zugänge",
				body: [
					"Prüfer:innen sehen nur die gültige Fassung von Dokumenten und die aktuelle Fassung von Nachweisen. Streng geheime Unterlagen sehen Externe nur mit dem Zugang „Streng geheime Unterlagen“; vertrauliche Inhalte öffnen sich erst nach frischer Bestätigung. Berater:innen haben den Zugang „Entwürfe und Verlauf“ von Anfang an.",
				],
			},
		],
		roles: [
			"Team verwalten und Rollen ändern: nur Inhaber:innen, mit Bestätigung.",
			"Zugang zurücksetzen (Passkeys verloren): Inhaber:innen für Konten ihrer Organisation.",
		],
		norms: [
			{
				key: "iso27001:A.5.15",
				why: "Rollen setzen die Zugangssteuerung nach Need-to-know um.",
			},
			{
				key: "iso27001:A.5.18",
				why: "Zugänge werden befristet, überprüft und entzogen.",
			},
			{
				key: "dora:Art.9(4)(c)",
				why: "DORA verlangt Richtlinien für die Zugangskontrolle zu IKT-Systemen und Daten.",
			},
		],
		related: ["bestellung", "anmeldung", "fassungen"],
	},
	{
		slug: "bestellung",
		area: "basics",
		title: "Funktionen und Bestellung durch die Geschäftsleitung",
		summary:
			"Wie ISB, DSB, GWB und andere Funktionen von der Geschäftsleitung bestellt werden, mit Beschluss, Bestellungsschreiben und Anzeige an die Behörde.",
		sections: [
			{
				id: "warum",
				heading: "Warum bestellen statt eintragen",
				body: [
					"ISO 27001 verlangt, dass die Leitung Rollen zuweist; DORA, MaRisk und das GwG verlangen das ausdrücklich vom Leitungsorgan. In Klick wirkt eine Funktion deshalb erst, wenn die Geschäftsleitung sie bestellt hat: erst dann trägt die Person Verantwortung, entscheidet in Freigaben und unterschreibt als Funktion.",
				],
			},
			{
				id: "ablauf",
				heading: "Ablauf",
				steps: [
					"Trag die Person unter Organisation > Rollen & Leitung (oder in der Einrichtung) für die Funktion ein. Sie steht dann als „vorgeschlagen“.",
					"Alle bestellten Mitglieder der Geschäftsleitung stimmen zu. Wer einträgt und selbst zur Geschäftsleitung gehört, zählt als erste Zustimmung; bei einer Einzel-Geschäftsführung wirkt der Eintrag sofort.",
					"Mit der letzten Zustimmung ist die Funktion bestellt. Klick legt den Beschluss an (bei Geldwäsche „RES-GWG-AMLO“, sonst „RES-ROLES“) und erzeugt das Bestellungsschreiben.",
					"Die bestellte Person unterschreibt das Schreiben per Passkey; bis dahin steht „Annahme offen“, nach 14 Tagen erinnert Klick.",
					"Wo eine Anzeige an eine Behörde nötig ist, entsteht eine Aufgabe mit Frist im Kalender (etwa GWB an die BaFin vor Wirksamkeit, DSB an die Datenschutzbehörde).",
				],
				tip: "Der allererste Eintrag der Geschäftsleitung gilt direkt, sonst könnte niemand bestätigen. Er steht im Protokoll; lade den Handelsregisterauszug als Nachweis hoch.",
			},
			{
				id: "aendern",
				heading: "Ändern und abberufen",
				list: [
					"Neue Person oder neue Vertretung: wieder ein Vorschlag; die bisherige Besetzung wirkt bis zur Bestellung weiter.",
					"Berichtsweg, Ergänzungen, Fristen: direkt; das Bestellungsschreiben wird dann als veraltet markiert.",
					"Abberufen: läuft ebenfalls über die Geschäftsleitung.",
					"„Besetzung bestätigen lassen“: ein Sammelbeschluss über alle Funktionen, zum Beispiel einmal im Jahr.",
				],
			},
			{
				id: "organigramm",
				heading: "Organigramm",
				body: [
					"Zu jeder Funktion hältst du fest, an wen sie berichtet. Unabhängige Funktionen wie Geldwäsche oder Datenschutz sollten direkt an die Geschäftsleitung berichten; sonst zeigt Klick einen Hinweis. Das Organigramm lässt sich als Nachweis erzeugen und unterschreiben.",
				],
			},
		],
		roles: [
			"Vorschlagen: Inhaber:innen und die Geschäftsleitung.",
			"Bestellen und Abberufen: alle bestellten Mitglieder der Geschäftsleitung.",
		],
		automation: [
			"Unbesetzte Funktionen behalten die bisherige verantwortliche Person; neu bestellte Personen übernehmen alle Einträge der Funktion.",
			"Erinnerung an offene Annahmen nach 14 Tagen und an Anzeige-Fristen im Tick.",
		],
		norms: [
			{
				key: "iso27001:5.3",
				why: "Die Leitung legt Rollen, Verantwortlichkeiten und Befugnisse fest.",
			},
			{
				key: "dora:Art.5(2)",
				why: "Das Leitungsorgan legt Rollen und Zuständigkeiten für IKT-Funktionen fest.",
			},
			{
				key: "gwg:§7",
				why: "Bestellung der oder des Geldwäschebeauftragten und Anzeige an die Aufsicht.",
			},
			{
				key: "dsgvo:Art.37-39",
				why: "Benennung und Stellung der oder des Datenschutzbeauftragten.",
			},
			{
				key: "zag-marisk:AT4.4.1",
				why: "Besondere Funktionen (Risikocontrolling, Compliance) werden von der Leitung eingerichtet.",
			},
		],
		related: ["rollen-rechte", "freigaben", "organisation", "beschluesse"],
	},
	{
		slug: "freigaben",
		area: "basics",
		title: "Freigaben und Freigabe-Designer",
		summary:
			"Vier-Augen-Prinzip in Klick: welche Abläufe es gibt, wer entscheidet, wie du Abläufe gestaltest und was dabei geprüft wird.",
		sections: [
			{
				id: "grundprinzip",
				heading: "So funktioniert eine Freigabe",
				body: [
					"Manche Schritte werden erst wirksam, wenn jemand anderes zustimmt: ein Dokument veröffentlichen, ein Risiko akzeptieren, einen kritischen Dienstleister aufnehmen, eine Funktion bestellen. Bis dahin steht der Eintrag auf „wartet auf Freigabe“ und ist gesperrt.",
					"Eine Freigabe hat Stufen. In jeder Stufe stehen Stellen (Funktionen, eigene Rollen, Personen, die oder der Verantwortliche); je Stufe reicht eine Person oder es müssen alle zustimmen. Stufen, deren Funktion niemand bestellt hält, entfallen; die Geschäftsleitung entfällt nie.",
				],
			},
			{
				id: "entscheiden",
				heading: "Entscheiden",
				steps: [
					"Öffne Heute > Freigaben. Dort steht alles, worüber du jetzt entscheiden darfst.",
					"Öffne den Eintrag und prüf die Angaben; die Leiste oben zeigt den Ablauf mit allen Stufen.",
					"Stimm zu, lehn ab oder bitte um Änderung, mit Begründung. Die Bestätigung per Passkey folgt.",
					"Entscheidet die Geschäftsleitung abschließend, legt Klick daraus automatisch einen Beschluss an.",
				],
				tip: "Wer den Antrag stellt, entscheidet nicht selbst. Bei Abwesenheit hilft eine Vertretung, die du unter Freigaben einträgst.",
			},
			{
				id: "rahmenwerke",
				heading: "Freigaben je Rahmenwerk",
				body: [
					"Im Standard-Modus schaltet jedes gewählte Rahmenwerk die Freigaben ein, die es verlangt, zum Beispiel den Geltungsbereich bei ISO 27001, die Aufnahme wesentlicher Auslagerungen bei DORA und MaRisk oder die Geldwäsche-Risikoanalyse beim GwG. Abschalten geht mit Rückfrage und Hinweis auf die Rechtsgrundlage.",
				],
			},
			{
				id: "designer",
				heading: "Abläufe selbst gestalten",
				body: [
					"Im individuellen Modus gestaltest du unter Einstellungen > Freigaben jeden Ablauf: Varianten mit Bedingungen (zum Beispiel nur bei kritischen Dienstleistern), Stufen mit mehreren Stellen, Überspringen für bestimmte Personen. Stellen ziehst du per Maus, Finger oder Tastatur in die Stufen; jeder Schritt geht auch ohne Ziehen über das Menü. Der Probelauf zeigt, wer bei welchem Fall entscheiden müsste.",
					"Fehlt eine Pflicht-Freigabe, warnt Klick mit Rechtsgrundlage unter Einstellungen > Freigaben und in der Prüfungsreife.",
				],
			},
		],
		roles: [
			"Entscheiden: wer in der aktuellen Stufe steht und das Recht „Freigaben entscheiden“ hat.",
			"Abläufe gestalten: Inhaber:innen, mit Bestätigung.",
		],
		automation: [
			"Überschreitet eine Freigabe ihre Bearbeitungszeit, erinnert der Tick und eskaliert.",
			"Abschließende Entscheidungen der Geschäftsleitung werden zu Beschlüssen mit Rahmenwerk-Bezug.",
		],
		norms: [
			{
				key: "iso27001:A.5.3",
				why: "Aufgabentrennung durch Vier-Augen-Prinzip.",
			},
			{
				key: "zag-marisk:AT4.3.1",
				why: "Funktionstrennung und Abstimmung in der Aufbau- und Ablauforganisation.",
			},
			{
				key: "dora:Art.5(2)",
				why: "Das Leitungsorgan genehmigt wesentliche Regelungen und trägt die Verantwortung.",
			},
		],
		related: ["bestellung", "beschluesse", "einstellungen"],
	},
	{
		slug: "fassungen",
		area: "basics",
		title: "Fassungen, Protokoll und Prüfer-Sicht",
		summary:
			"Wie Dokumente und Nachweise versioniert werden, was Prüfer:innen sehen und wie das Protokoll jede Änderung festhält.",
		sections: [
			{
				id: "dokumente",
				heading: "Dokument-Fassungen",
				body: [
					"Jedes Dokument hat eine Arbeitskopie (der Entwurf) und Fassungen mit Nummer, zum Beispiel v1.2. Beim Einreichen zur Prüfung schreibt Klick Text und Datei in die Fassung fest; nach Freigabe oder Veröffentlichung lässt sich die Fassung nicht mehr ändern, auch nicht in der Datenbank.",
					"Gültig ist die zuletzt veröffentlichte, nicht zurückgezogene Fassung. Sie gilt bis zur Veröffentlichung der Nachfolgerin. Willst du etwas ändern, legst du eine neue Fassung an; eine ältere Fassung kann dabei als Grundlage dienen.",
				],
			},
			{
				id: "nachweise",
				heading: "Nachweis-Fassungen",
				body: [
					"Lädst du eine neue Fassung eines Nachweises hoch, übernimmt sie Controls, Einstufung und Nachweisbogen; die alte zählt nicht mehr und steht als „ersetzt“ im Verlauf. Abgelaufene Nachweise bleiben sichtbar und sind deutlich markiert, zählen aber nicht als gültig. Erzeugte Nachweise werden neu erzeugt, wenn sie abgelaufen sind oder sich die Daten geändert haben.",
				],
			},
			{
				id: "pruefer",
				heading: "Was Prüfer:innen sehen",
				list: [
					"Dokumente nur in der gültigen Fassung, ohne Arbeitskopie, Fassungsliste und Freigabe-Leiste.",
					"Nachweise nur in der aktuellen Fassung; ersetzte Fassungen und Dateien nicht mehr gültiger Dokumentfassungen sind gesperrt.",
					"Streng geheime Unterlagen nur mit eigenem Zugang; vertrauliche Inhalte erst nach Bestätigung.",
					"Das Prüfungspaket enthält je Dokument jede Fassung, die im Prüfzeitraum galt, mit „gilt von“ und „gilt bis“.",
				],
			},
			{
				id: "protokoll",
				heading: "Das Protokoll",
				body: [
					"Jede Änderung steht mit Vorher, Nachher, Person und Zeit im Protokoll. Die Einträge sind je Organisation über eine Prüfsummen-Kette verbunden; eine nachträgliche Änderung würde auffallen. Unter Aktivität siehst du den Verlauf, an jedem Eintrag den Aktivitätsstrom.",
				],
			},
		],
		norms: [
			{
				key: "iso27001:7.5",
				why: "Dokumentierte Information wird gelenkt: Kennzeichnung, Prüfung, Freigabe, Versionen.",
			},
			{
				key: "iso27001:A.8.15",
				why: "Protokollierung von Tätigkeiten und Ereignissen.",
			},
			{
				key: "zag-marisk:AT6",
				why: "Dokumentation, Nachvollziehbarkeit und Aufbewahrung.",
			},
		],
		related: ["dokumente", "nachweise", "audits"],
	},
	{
		slug: "richtlinien",
		area: "basics",
		audience: "employee",
		title: "Richtlinien lesen und bestätigen",
		summary:
			"Wo Mitarbeitende die gültigen Richtlinien finden, wie sie die Kenntnisnahme bestätigen und wie das Portal ohne Konto funktioniert.",
		sections: [
			{
				id: "lesen",
				heading: "Richtlinien in Klick",
				steps: [
					"Öffne Richtlinien. Dort stehen die Richtlinien, die für dich gelten, jeweils in der gültigen Fassung.",
					"Öffne eine Richtlinie, lies sie oder lade die Datei.",
					"Tipp auf „Zur Kenntnis genommen“. Klick hält Fassung und Zeitpunkt fest.",
				],
				tip: "Kommt eine neue Fassung, wartet sie wieder auf deine Kenntnisnahme.",
			},
			{
				id: "portal",
				heading: "Das Richtlinien-Portal ohne Konto",
				body: [
					"Hat deine Organisation das Portal eingeschaltet, öffnest du den Link, gibst deine geschäftliche E-Mail-Adresse ein und bekommst einen sechsstelligen Code per Mail. Er gilt 10 Minuten. Danach bleibst du für die eingestellte Zeit angemeldet und siehst die Richtlinien für alle Mitarbeitenden.",
				],
			},
			{
				id: "verantwortliche",
				heading: "Für Verantwortliche",
				list: [
					"Der Verteiler am Dokument legt fest, wer eine Richtlinie sieht: alle Mitglieder, Mitarbeitende oder bestimmte Funktionen.",
					"Vertrauliche und streng geheime Dokumente sehen Mitarbeitende nie.",
					"Nachweise erscheinen für Mitarbeitende nur, wenn du den Schalter „Für Mitarbeitende sichtbar“ einschaltest (nur öffentlich oder intern eingestuft).",
					"Die Dokumentseite zeigt, wer bestätigt hat, auch aus dem Portal.",
				],
			},
		],
		automation: [
			"Offene Kenntnisnahmen erscheinen auf Heute und in der Tages-Mail; der Tick erinnert.",
			"Portal-Adressen, die nie einen Code eingelöst haben, löscht Klick nach 7 Tagen.",
		],
		norms: [
			{
				key: "iso27001:5.2",
				why: "Die Informationssicherheitspolitik wird bekannt gemacht.",
			},
			{
				key: "iso27001:7.3",
				why: "Mitarbeitende kennen die Politik und ihren Beitrag.",
			},
			{
				key: "iso27001:A.5.1",
				why: "Richtlinien werden bekannt gegeben und zur Kenntnis genommen.",
			},
		],
		related: ["dokumente", "anmeldung"],
	},
	{
		slug: "glossar",
		area: "basics",
		audience: "employee",
		title: "Glossar",
		summary: "Die wichtigsten Begriffe und Abkürzungen in Klick, kurz erklärt.",
		sections: [
			{
				id: "begriffe",
				heading: "Begriffe",
				list: [
					"Abweichung: eine Nichtkonformität, die über Ursache, Maßnahme und Wirksamkeit abgeschlossen wird (CAPA).",
					"Anwendbarkeit: ob eine Anforderung für dich gilt; folgt aus Profil, Lizenzstufe und Stichtag, manuell änderbar mit Begründung.",
					"Asset: ein Wert, den du schützt (System, Anwendung, Daten, Schlüssel, Standort).",
					"Beschluss: eine dokumentierte Entscheidung der Geschäftsleitung.",
					"Control: eine harmonisierte Maßnahme, die Anforderungen mehrerer Rahmenwerke erfüllt.",
					"Finding: eine Feststellung aus einem Audit; ab Schwere „leicht“ wird daraus eine Abweichung.",
					"Kenntnisnahme: Bestätigung, eine Richtlinie in einer bestimmten Fassung gelesen zu haben.",
					"Nachweisbogen: Prüffragen und Nachweis-Positionen je Control, einmal beantwortet für alle Rahmenwerke.",
					"Prüfungsreife: abgeleitete Kennzahl, wie gut du zu einem Stichtag auf ein Audit vorbereitet bist.",
					"SoA (Statement of Applicability): die Erklärung zur Anwendbarkeit der Anhang-A-Controls nach ISO 27001.",
					"Step-up: frische Bestätigung per Passkey oder Code vor wichtigen Schritten.",
					"Tick: der tägliche Lauf, der Fristen prüft und erinnert.",
				],
			},
			{
				id: "abkuerzungen",
				heading: "Abkürzungen",
				list: [
					"BCM: Business Continuity Management (Notfallmanagement).",
					"CASP: Anbieter von Kryptowerte-Dienstleistungen nach MiCAR.",
					"DORA: EU-Verordnung über die digitale operationale Resilienz im Finanzsektor.",
					"DSB, GWB, ISB: Datenschutz-, Geldwäsche- und Informationssicherheitsbeauftragte:r.",
					"GL: Geschäftsleitung.",
					"KRI, KPI, KCI: Risiko-, Leistungs- und Kontrollkennzahl.",
					"MiCAR: EU-Verordnung über Märkte für Kryptowerte.",
					"NIS2: EU-Richtlinie zur Cybersicherheit, in Deutschland im BSIG umgesetzt.",
					"ZAG: Zahlungsdiensteaufsichtsgesetz.",
				],
			},
		],
		related: ["erste-schritte"],
	},
];
