import type { HelpArticle } from "../types";

// Register: Risiken, Dokumente, Prozesse, Dienstleister, Assets, Vorfälle,
// Produkte, Schulungen, Datenschutz.

export const REGISTERS: HelpArticle[] = [
	{
		slug: "risiken",
		area: "registers",
		title: "Risiken: bewerten, behandeln, akzeptieren",
		summary:
			"Risikomethodik, Risiko-Assistent mit Szenarien, Matrix, Maßnahmen, Akzeptanz mit Freigabe und Vorschläge aus allen Registern.",
		sections: [
			{
				id: "methodik",
				heading: "Deine Risikomethodik",
				body: [
					"Unter Einstellungen > Risikomethodik legst du fest, wie gerechnet wird: Eintrittswahrscheinlichkeit plus Schadenshöhe oder mal Schadenshöhe, die Stufen mit Ankertexten, die Schadensarten (finanziell, Betrieb, Ruf, Recht, Personen …) und die Risikoklassen mit ihrer Zone akzeptabel, tolerierbar oder nicht tolerierbar. Neue Organisationen starten mit einer Vorlage, die zu ihren Rahmenwerken passt.",
				],
			},
			{
				id: "assistent",
				heading: "Ein Risiko mit dem Assistenten anlegen",
				steps: [
					"Tipp auf „Neues Risiko“. Wähl ein Szenario aus dem Katalog (über 60 Szenarien aus Informationssicherheit, Betrieb, Dienstleistern, Zahlungsverkehr, Krypto, Geldwäsche, Datenschutz, CRA) oder beschreib es frei.",
					"Bewerte die Eintrittswahrscheinlichkeit anhand der Ankertexte.",
					"Bewerte den Schaden je Schadensart. Die Schadenshöhe rechnet Klick selbst: die höchste Stufe zählt.",
					"Klick zeigt Risikowert, Klasse und Zone. Liegt das Risiko über dem Appetit, muss es behandelt oder mit Freigabe akzeptiert werden.",
					"Leg Maßnahmen an. Jede Maßnahme wird eine Aufgabe; ihr Status kommt aus der Aufgabe.",
				],
				tip: "Aus einem Dienstleister, Asset, Prozess, Vorfall oder Befund heraus legst du ein Risiko an, das schon vorbelegt ist und seine Herkunft kennt.",
			},
			{
				id: "akzeptanz",
				heading: "Risiken akzeptieren",
				body: [
					"Akzeptieren heißt: bewusst mit dem Restrisiko leben. Je Risikoklasse legst du fest, wer akzeptieren darf, zum Beispiel erst die Bereichsleitung, dann die Geschäftsleitung. Die Akzeptanz läuft als Freigabe und erzeugt bei Entscheidung der Geschäftsleitung einen Beschluss.",
				],
			},
			{
				id: "vorschlaege",
				heading: "Vorschläge, Ausnahmen, Schadensfälle",
				list: [
					"Vorschläge: Klick schlägt Risiken aus Lücken, kritischen Dienstleistern, alten Assets oder Befunden vor. Es legt nie selbst etwas an; „Kein Risiko“ geht mit Begründung.",
					"Ausnahmen: befristete Abweichungen von einer Richtlinie mit Ablauf; danach erinnert Klick.",
					"Schadensfälle: eingetretene Verluste für die Risikoinventur und die Managementbewertung.",
					"Matrix: alle Risiken nach Wahrscheinlichkeit und Schaden; Bericht als Markdown.",
				],
			},
		],
		roles: [
			"Anlegen und bewerten: Bearbeiter:innen und Inhaber:innen.",
			"Akzeptieren: Recht „Risiken akzeptieren“, entlang der Stufen der Risikoklasse.",
		],
		automation: [
			"Reviews je Risiko nach Intervall, Erinnerung im Tick.",
			"Risiken über dem Appetit erscheinen als Hinweis im Überblick.",
		],
		norms: [
			{
				key: "iso27001:6.1.2",
				why: "Methodik und Assistent setzen die Risikobeurteilung um.",
			},
			{
				key: "iso27001:6.1.3",
				why: "Maßnahmen und Akzeptanz sind die Risikobehandlung.",
			},
			{
				key: "iso27001:8.2",
				why: "Risikobeurteilungen in geplanten Abständen durchführen.",
			},
			{
				key: "dora:Art.6(1-4)",
				why: "Dokumentierter Rahmen für IKT-Risiken.",
			},
			{
				key: "nis2:Art.21(2)(a)",
				why: "Konzepte für die Risikoanalyse.",
			},
			{
				key: "zag-marisk:BTR1",
				why: "Erfassung und Steuerung operationeller Risiken.",
			},
		],
		related: ["controls", "dienstleister", "assets", "beschluesse"],
	},
	{
		slug: "dokumente",
		area: "registers",
		title: "Dokumente, Richtlinien und Kenntnisnahmen",
		summary:
			"Dokumente aus Vorlagen anlegen, Fassungen einreichen und freigeben, verteilen und die Kenntnisnahme verfolgen.",
		sections: [
			{
				id: "anlegen",
				heading: "Ein Dokument anlegen",
				steps: [
					"Tipp auf „Neues Dokument“. Wähl eine Vorlage (Klick kennt rund 40, zum Beispiel Informationssicherheitsleitlinie, Notfallhandbuch, Geldwäsche-Richtlinie) oder leg ein eigenes an.",
					"Klick vergibt eine Nummer aus dem Nummernkreis der Art (zum Beispiel RL-001 für Richtlinien).",
					"Schreib den Text direkt in Klick oder lade eine Datei hoch.",
					"Leg Verantwortliche, Einstufung, Review-Intervall und unter „Freigabe durch“ die freigebende Funktion fest. Vorlagen bringen sie mit.",
				],
			},
			{
				id: "fassungen",
				heading: "Einreichen, freigeben, veröffentlichen",
				steps: [
					"Tipp auf „Zur Prüfung einreichen“. Klick schreibt Text und Datei in die Fassung fest und startet die Freigabe.",
					"Nach der Freigabe veröffentlichst du die Fassung. Ab dann ist sie gültig und unveränderlich.",
					"Willst du etwas ändern, leg eine neue Fassung an. Die bisherige gilt weiter, bis die neue veröffentlicht ist.",
				],
				tip: "Eine Freigabe wirkt nur auf die Fassung, für die sie beantragt wurde. Kommt eine späte Zustimmung zu einer alten Fassung, bleibt sie ohne Wirkung.",
			},
			{
				id: "umlauf",
				heading: "Im Umlauf unterschreiben",
				steps: [
					"Verlangt die Vorlage Unterschriften (Leitlinie und Richtlinien: alle bestellten Mitglieder der Geschäftsleitung), steht im Posteingang „Freigeben und unterschreiben“.",
					"Du bestätigst mit deinem Passkey oder Sicherheitsschlüssel (Fingerabdruck oder PIN). Die Unterschrift deckt die Prüfsumme genau dieser Fassung.",
					"Erst wenn alle unterschrieben haben, ist die Fassung freigegeben. Am Dokument steht, wer wann unterschrieben hat und ob die Prüfung gültig ist.",
				],
				tip: "Unterschriften lassen sich weder ändern noch löschen. Eine Änderung am Text ist eine neue Fassung mit neuem Umlauf; die alte bleibt samt Unterschriften erhalten.",
			},
			{
				id: "pdf",
				heading: "Als PDF exportieren",
				list: [
					"„Als PDF herunterladen“ an der gültigen Fassung (und „PDF“ an jeder Fassung) erzeugt die gelenkte Fassung: Deckblatt mit Prüfsumme, Freigabe und Unterschriften, Änderungshistorie, Verteiler und Inhalt.",
					"Im PDF stecken signaturen.json zum Prüfen ohne Klick und bei hochgeladenen Dokumenten die Originaldatei.",
					"„Gültige Dokumente (ZIP)“ im Register packt alle gültigen Fassungen mit Prüfsummenliste zusammen; das Prüfungspaket enthält je Fassung im Zeitraum das PDF.",
					"Jeder Export braucht eine frische Bestätigung und steht mit Export-ID im Verlauf. Ein Ausdruck ist eine ungelenkte Kopie, gültig ist die Fassung in Klick.",
				],
			},
			{
				id: "verteiler",
				heading: "Verteiler und Kenntnisnahme",
				list: [
					"Im Verteiler wählst du: alle Mitglieder, Mitarbeitende oder bestimmte Funktionen.",
					"Wer im Verteiler steht, sieht die Kenntnisnahme auf Heute und in der Tages-Mail.",
					"Die Dokumentseite zeigt, wer welche Fassung wann bestätigt hat, auch aus dem Richtlinien-Portal.",
					"Marketingmitteilungen sind eine eigene Art und werden von Compliance freigegeben.",
				],
			},
			{
				id: "pflicht",
				heading: "Pflichtdokumente",
				body: [
					"Manche Rahmenwerke verlangen bestimmte Dokumente, zum Beispiel ISO 27001 die Leitlinie, den Geltungsbereich und die SoA. Die Prüfungsreife zählt sie und zeigt, was fehlt oder überfällig ist.",
				],
			},
		],
		roles: [
			"Anlegen und bearbeiten: Bearbeiter:innen und Inhaber:innen.",
			"Freigeben: wer in der Route steht, meist Verantwortliche und die freigebende Funktion.",
			"Prüfer:innen sehen nur die gültige Fassung.",
		],
		automation: [
			"Erinnerung an fällige Reviews und offene Kenntnisnahmen.",
			"Neue Fassung = neue Kenntnisnahme für alle im Verteiler.",
		],
		norms: [
			{
				key: "iso27001:7.5",
				why: "Erstellen, Aktualisieren und Lenken dokumentierter Information.",
			},
			{
				key: "iso27001:A.5.1",
				why: "Richtlinien werden festgelegt, genehmigt, veröffentlicht und zur Kenntnis genommen.",
			},
			{
				key: "dora:Art.9(4)(a)",
				why: "Die Informationssicherheitsleitlinie ist ein Pflichtdokument.",
			},
			{
				key: "zag-marisk:AT5",
				why: "Organisationsrichtlinien sind schriftlich fixiert und bekannt gemacht.",
			},
			{
				key: "micar:Art.66(1-4)",
				why: "Marketingmitteilungen sind redlich, eindeutig und nicht irreführend.",
			},
		],
		related: ["fassungen", "richtlinien", "freigaben"],
	},
	{
		slug: "prozesse",
		area: "registers",
		title: "Prozesse, BIA und kritische Funktionen",
		summary:
			"Prozesslandkarte mit RACI, Business-Impact-Analyse, Abhängigkeiten zu Assets und Dienstleistern und Konzentrationsrisiken.",
		sections: [
			{
				id: "landkarte",
				heading: "Die Prozesslandkarte",
				body: [
					"Klick schlägt eine Prozesslandkarte aus deinen Rahmenwerken vor (rund 20 Prozesse wie Vorfallmanagement, Änderungsmanagement, Auslagerungssteuerung, Kundensorgfalt). Du übernimmst, änderst oder ergänzt.",
				],
			},
			{
				id: "raci",
				heading: "RACI",
				body: [
					"Je Prozess hältst du fest, wer verantwortlich durchführt (R), wer rechenschaftspflichtig ist (A, genau eine Stelle), wer gefragt (C) und wer informiert wird (I). Stellen können Funktionen oder Personen sein.",
				],
			},
			{
				id: "bia",
				heading: "Business-Impact-Analyse",
				steps: [
					"Bewerte je Prozess, was ein Ausfall nach Stunden und Tagen bedeutet.",
					"Leg die maximal tolerierbare Ausfallzeit, die Wiederanlaufzeit (RTO) und den tolerierbaren Datenverlust (RPO) fest.",
					"Markier kritische oder wichtige Funktionen. Für sie verlangt das Testprogramm jährliche Notfalltests.",
					"Verknüpf Assets, Dienstleister und Standorte. Die Abhängigkeitskarte zeigt, wo viele kritische Prozesse an einem Dienstleister hängen (Konzentrationsrisiko).",
				],
			},
		],
		automation: [
			"Aktivieren und wesentliche Änderungen eines Prozesses können eine Freigabe verlangen (im individuellen Modus gestaltbar).",
		],
		norms: [
			{
				key: "dora:Art.8(1-4)",
				why: "Funktionen, Rollen und Assets identifizieren und klassifizieren.",
			},
			{
				key: "dora:Art.11(5)",
				why: "Business-Impact-Analyse als Grundlage der Notfallplanung.",
			},
			{
				key: "dora:Art.29",
				why: "Konzentrationsrisiken bei IKT-Dienstleistern bewerten.",
			},
			{
				key: "iso27001:A.5.30",
				why: "IKT-Bereitschaft für die Geschäftsfortführung.",
			},
			{
				key: "zag-marisk:AT7.3",
				why: "Notfallmanagement für zeitkritische Prozesse.",
			},
		],
		related: ["assets", "dienstleister", "audits"],
	},
	{
		slug: "dienstleister",
		area: "registers",
		title: "Dienstleister, Auslagerung und Lieferantenbewertung",
		summary:
			"Dienstleister erfassen, einstufen, bewerten (intern oder per Fragebogen-Portal), Vertragsklauseln prüfen und das DORA-Informationsregister exportieren.",
		sections: [
			{
				id: "erfassen",
				heading: "Dienstleister erfassen und einstufen",
				steps: [
					"Leg den Dienstleister mit Leistung, Kategorie, Datenstandorten und Vertragsdaten an.",
					"Füll den Steckbrief: Kritikalität, ob er eine kritische oder wichtige Funktion unterstützt (DORA) und, über den Entscheidungsbaum, ob es eine Auslagerung und ob sie wesentlich ist.",
					"Kritische, wichtige oder wesentlich ausgelagerte Dienstleister brauchen beim Aufnehmen die Freigabe der Geschäftsleitung; die übrigen nur der oder des Auslagerungsbeauftragten.",
				],
			},
			{
				id: "intern",
				heading: "Interne Bewertung",
				body: [
					"Die interne Bewertung nutzt deinen Kriterienkatalog (14 Kriterien, dazu je nach Fall DORA, Auslagerung, Krypto-Partner, NIS2). Klick belegt Kriterien vor, du bewertest je Kriterium; jede Bewertung speichert sofort. Abschließen geht nur vollständig und bei schlechten Noten mit Begründung. Das Ergebnis setzt Sorgfaltsprüfung, letzte und nächste Bewertung; ein rotes Ergebnis braucht eine Freigabe.",
				],
			},
			{
				id: "portal",
				heading: "Fragebogen über das Lieferantenportal",
				steps: [
					"Starte einen Fragebogen (NIS2-Software, CRA-Komponenten oder DORA-IKT mit einer Frage je Pflichtklausel nach Art. 30).",
					"Schick den Link an den Lieferanten. Er braucht kein Konto; der Link öffnet nur diesen einen Fragebogen.",
					"Der Lieferant antwortet, lädt Belege hoch und reicht ein. Du kannst einzelne Antworten mit „Bitte klären“ zurückgeben.",
					"Beim Abschluss entscheidest du; Klick schreibt Sorgfaltsprüfung, Wiedervorlage und bei DORA die Vertragsklauseln an den Dienstleister.",
				],
			},
			{
				id: "export",
				heading: "Exporte",
				list: [
					"Informationsregister nach den technischen Standards zu DORA (B_01.01 bis B_07.01) als ZIP mit CSV-Dateien und Warnliste.",
					"Lieferantenpaket je Dienstleister mit Registerdatenblatt, Klausel-Anhang, Ausstiegsplan und Testaten.",
					"Übersicht der Bewertungen als CSV.",
				],
			},
		],
		roles: [
			"Aufnehmen und bewerten: Bearbeiter:innen und Inhaber:innen.",
			"Freigabe: Auslagerungsbeauftragte:r, bei kritischen dazu die Geschäftsleitung.",
		],
		automation: [
			"Wiedervorlage nach Kritikalität und Ergebnis (kritische höchstens nach der eingestellten Monatszahl).",
			"Erinnerung, wenn ein verschickter Fragebogen nicht eingereicht wurde.",
		],
		norms: [
			{
				key: "dora:Art.28(1-2)",
				why: "Strategie und Richtlinie für das IKT-Drittparteienrisiko.",
			},
			{
				key: "dora:Art.28(3)",
				why: "Informationsregister über alle IKT-Dienstleister.",
			},
			{
				key: "dora:Art.28(4-6)",
				why: "Sorgfaltsprüfung vor Vertragsschluss.",
			},
			{ key: "dora:Art.30", why: "Pflichtinhalte der Verträge." },
			{
				key: "nis2:Art.21(2)(d)",
				why: "Sicherheit der Lieferkette.",
			},
			{
				key: "iso27001:A.5.19",
				why: "Informationssicherheit in Lieferantenbeziehungen.",
			},
			{ key: "zag-marisk:AT9", why: "Auslagerung nach MaRisk." },
			{
				key: "micar:Art.73",
				why: "Auslagerung durch Kryptowerte-Dienstleister.",
			},
		],
		related: ["risiken", "prozesse", "freigaben"],
	},
	{
		slug: "assets",
		area: "registers",
		title: "Assets und Lebenszyklus",
		summary:
			"Systeme, Anwendungen, Daten, Schlüssel und Geräte erfassen, einstufen und über ihren Lebenszyklus steuern.",
		sections: [
			{
				id: "erfassen",
				heading: "Assets erfassen",
				list: [
					"Art (System, Anwendung, Daten, Gerät, Schlüssel/HSM, Dienst), Verantwortliche, Standort und Einstufung nach Vertraulichkeit, Integrität und Verfügbarkeit.",
					"Verknüpfung mit Prozessen und Dienstleistern; so zeigt die BIA, was an einem Asset hängt.",
					"Import per CSV, wenn du schon eine Liste hast.",
				],
			},
			{
				id: "lebenszyklus",
				heading: "Lebenszyklus",
				body: [
					"Trag Supportende, Lebensende, Wartung und letzten Patch ein. Klick erinnert rechtzeitig und schlägt bei Assets ohne Support ein Risiko vor. Außerbetriebnahme kann eine Freigabe verlangen, damit Daten sicher gelöscht werden.",
				],
			},
		],
		norms: [
			{
				key: "iso27001:A.5.9",
				why: "Inventar der Informationen und anderer Werte.",
			},
			{
				key: "iso27001:A.5.12",
				why: "Klassifizierung nach Schutzbedarf.",
			},
			{
				key: "iso27001:A.7.14",
				why: "Sichere Entsorgung oder Wiederverwendung von Geräten.",
			},
			{
				key: "dora:Art.8(1-4)",
				why: "Identifizierung der IKT-Assets.",
			},
			{
				key: "dora:Art.8(5-7)",
				why: "Abhängigkeiten und Altsysteme bewerten.",
			},
		],
		related: ["prozesse", "risiken"],
	},
	{
		slug: "vorfaelle",
		area: "registers",
		title: "Vorfälle und Meldefristen",
		summary:
			"Vorfälle in drei Feldern melden, nach DORA, NIS2, DSGVO, ZAG oder CRA einstufen, Fristen einhalten und Ursachen abstellen.",
		sections: [
			{
				id: "melden",
				heading: "Einen Vorfall melden",
				steps: [
					"Tipp auf „Vorfall melden“ und füll drei Felder: Was ist passiert, wann hast du es bemerkt, was ist betroffen. Das geht schnell, auch am Handy.",
					"Die oder der Vorfallverantwortliche übernimmt und stuft ein. Klick fragt die Kriterien des jeweiligen Regimes ab (zum Beispiel Anzahl betroffener Kund:innen, Dauer, Datenverlust).",
					"Ist der Vorfall meldepflichtig, rechnet Klick die Fristen und zeigt die Uhren: Erstmeldung, Zwischenbericht, Abschlussbericht.",
					"Bei schwerwiegenden Vorfällen informiert Klick die Geschäftsleitung sofort; sie bestätigt die Kenntnisnahme.",
					"Arbeite das Aufgabenpaket ab und markier die Meldungen als abgegeben.",
					"Schließ den Vorfall mit Ursache. Bei schweren Vorfällen entsteht eine Abweichung, damit die Ursache dauerhaft abgestellt wird.",
				],
			},
			{
				id: "regime",
				heading: "Die Regime",
				list: [
					"DORA: schwerwiegende IKT-Vorfälle an die BaFin (Erstmeldung, Zwischen- und Abschlussbericht).",
					"NIS2/BSIG: erhebliche Sicherheitsvorfälle an das BSI (24 h Frühwarnung, 72 h Meldung, ein Monat Abschluss).",
					"DSGVO: Verletzungen des Schutzes personenbezogener Daten an die Aufsicht binnen 72 Stunden.",
					"ZAG: schwerwiegende Betriebs- oder Sicherheitsvorfälle bei Zahlungsdiensten.",
					"CRA: aktiv ausgenutzte Schwachstellen und schwere Vorfälle bei Produkten (24 h, 72 h, Abschluss).",
				],
			},
		],
		roles: [
			"Melden: alle Mitglieder außer Mitarbeitenden und Lesenden.",
			"Schließen: Recht „Vorfälle schließen“; optional mit Freigabe.",
		],
		automation: [
			"Fristen werden beim Einstufen und Melden berechnet und gespeichert; der Tick erinnert, bevor sie ablaufen.",
			"Die Geschäftsleitung wird bei schwerwiegenden Vorfällen sofort informiert und nach 24 Stunden erinnert, wenn die Kenntnisnahme fehlt.",
		],
		norms: [
			{
				key: "dora:Art.17",
				why: "Prozess für das Management IKT-bezogener Vorfälle.",
			},
			{ key: "dora:Art.18", why: "Klassifizierung der Vorfälle." },
			{ key: "dora:Art.19", why: "Meldung schwerwiegender Vorfälle." },
			{ key: "nis2:Art.23", why: "Meldung an das BSI." },
			{ key: "dsgvo:Art.33", why: "Meldung von Datenschutzverletzungen." },
			{
				key: "iso27001:A.5.26",
				why: "Reaktion auf Informationssicherheitsvorfälle.",
			},
			{
				key: "cra:Art.14(1-2)",
				why: "Meldung aktiv ausgenutzter Schwachstellen.",
			},
		],
		related: ["audits", "risiken", "produkte"],
	},
	{
		slug: "produkte",
		area: "registers",
		title: "Produkte und Cyber Resilience Act",
		summary:
			"Produkte mit digitalen Elementen erfassen, einstufen, Konformitätsweg und Supportzeitraum ableiten, SBOM prüfen und die Konformitätserklärung freigeben.",
		sections: [
			{
				id: "rolle",
				heading: "Deine Rolle nach dem CRA",
				body: [
					"Ob du Hersteller, Einführer, Händler oder Verwalter von Open-Source-Software bist, ergibt sich aus deinen Produkten. Ohne Produkte gilt alles, was du bei der Einrichtung gewählt hast.",
				],
			},
			{
				id: "ablauf",
				heading: "Ein Produkt anlegen",
				steps: [
					"Leg das Produkt mit Art, Rolle, Markteinführung und Zielgruppe an.",
					"Stuf es ein: Standard, wichtig (Klasse I oder II) oder kritisch. Daraus leitet Klick den Konformitätsweg ab.",
					"Leg den Supportzeitraum fest; Klick erinnert vor seinem Ende.",
					"Lade die SBOM hoch (CycloneDX oder SPDX). Klick prüft die Pflichtfelder nach TR-03183-2 und speichert nur die Zusammenfassung.",
					"Arbeite die CRA-Checkliste je Produkt durch. Maßnahmen landen als Aufgaben am Produkt; die Checkliste ändert nie den Status deiner Controls.",
					"Gib die Konformitätserklärung frei. Erst dann zählt sie.",
				],
			},
		],
		automation: [
			"Offene Punkte je Produkt fließen als Blocker in die Prüfungsreife.",
			"Meldefristen für Schwachstellen und Vorfälle rechnet Klick ab dem Zeitpunkt, an dem eine Behebung verfügbar ist bzw. der Vorfall gemeldet wurde.",
		],
		norms: [
			{ key: "cra:Art.7-8", why: "Einstufung der Produkte." },
			{ key: "cra:Art.13(8)", why: "Unterstützungszeitraum festlegen." },
			{ key: "cra:AnhI-II-1", why: "Komponenten über eine SBOM erfassen." },
			{ key: "cra:Art.28-30", why: "EU-Konformitätserklärung und CE." },
			{ key: "cra:Art.32", why: "Konformitätsbewertung nach Einstufung." },
		],
		related: ["sicherheit", "vorfaelle"],
	},
	{
		slug: "schulungen",
		area: "registers",
		title: "Schulungen und Kompetenz",
		summary:
			"Pflichtschulungen planen, Personen zuweisen, Teilnahme bestätigen und die Kompetenzmatrix pflegen.",
		sections: [
			{
				id: "plan",
				heading: "Schulungsplan",
				body: [
					"Klick bringt Pflichtschulungen aus deinen Rahmenwerken mit, zum Beispiel Informationssicherheit für alle, Geldwäsche für alle mit Kundenkontakt, IKT-Risiken für die Geschäftsleitung. Funktionsträger:innen bekommen die Schulungen ihrer Funktion automatisch, sobald sie bestellt sind.",
				],
			},
			{
				id: "durchfuehren",
				heading: "Durchführen und bestätigen",
				steps: [
					"Hinterleg zur Schulung einen Kurs-Link oder Unterlagen.",
					"Weis die Schulung Personen zu. Sie sehen sie unter „Meine Schulungen“ und auf Heute.",
					"Nach der Teilnahme bestätigt die Person selbst; du kannst auch Termine mit Teilnehmenden erfassen.",
					"Die Kompetenzmatrix zeigt, wer welche Schulung wann hatte und was fällig ist.",
				],
			},
		],
		automation: [
			"Fällig heißt: in den nächsten 30 Tagen. Der Tick erinnert, überfällige erscheinen im Überblick.",
		],
		norms: [
			{ key: "iso27001:7.2", why: "Kompetenz sicherstellen und nachweisen." },
			{
				key: "iso27001:A.6.3",
				why: "Sensibilisierung und Schulung zur Informationssicherheit.",
			},
			{ key: "dora:Art.5(4)", why: "IKT-Schulung des Leitungsorgans." },
			{ key: "dora:Art.13(6)", why: "Schulungsprogramme für alle." },
			{
				key: "nis2:Art.20(2)",
				why: "Schulung von Geschäftsleitung und Mitarbeitenden.",
			},
			{
				key: "gwg:§6",
				why: "Unterrichtung der Beschäftigten über Geldwäsche.",
			},
		],
		related: ["heute", "bestellung"],
	},
	{
		slug: "datenschutz",
		area: "registers",
		title: "Datenschutz",
		summary:
			"Verzeichnis der Verarbeitungstätigkeiten, Folgenabschätzungen, Betroffenenanfragen mit Frist und Versicherungen.",
		sections: [
			{
				id: "vvt",
				heading: "Verzeichnis der Verarbeitungstätigkeiten",
				body: [
					"Klick bringt eine Startliste typischer Verarbeitungen mit (Personal, Kund:innen, Bewerbungen, Website, Geldwäsche-Prüfung). Je Tätigkeit hältst du Zweck, Rechtsgrundlage, Datenkategorien, Empfänger, Drittland, Löschfrist und Schutzmaßnahmen fest. Wo eine Folgenabschätzung nötig sein könnte, zeigt Klick die Lücke.",
				],
			},
			{
				id: "anfragen",
				heading: "Betroffenenanfragen",
				steps: [
					"Erfass die Anfrage (Auskunft, Löschung, Berichtigung, Widerspruch, Übertragbarkeit). Die Kennung der Person wird verschlüsselt gespeichert.",
					"Klick setzt die Frist von einem Monat; eine Verlängerung um zwei Monate geht mit Begründung.",
					"Hinterleg die Antwort und schließ die Anfrage.",
				],
			},
			{
				id: "versicherungen",
				heading: "Versicherungen",
				body: [
					"Unter Versicherungen erfasst du Cyber- und Haftpflichtpolicen mit Laufzeit; Klick warnt 60 Tage vor Ablauf.",
				],
			},
		],
		roles: [
			"Datenschutzbeauftragte:r wird als Funktion bestellt und der Aufsicht mitgeteilt (Aufgabe entsteht automatisch).",
		],
		norms: [
			{ key: "dsgvo:Art.30", why: "Verzeichnis von Verarbeitungstätigkeiten." },
			{ key: "dsgvo:Art.35-36", why: "Datenschutz-Folgenabschätzung." },
			{ key: "dsgvo:Art.12-15", why: "Information und Auskunft mit Frist." },
			{ key: "dsgvo:Art.32", why: "Sicherheit der Verarbeitung." },
			{
				key: "iso27001:A.5.34",
				why: "Schutz personenbezogener Daten im Managementsystem.",
			},
		],
		related: ["vorfaelle", "dienstleister"],
	},
];
