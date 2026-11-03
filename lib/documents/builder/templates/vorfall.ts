import type { PolicyBuilder } from "../types";

// Vorfall- und Melderichtlinie (RL-VORFALL). Inhalte nach ISO 27001
// A.5.24 bis A.5.28 und A.6.8, DORA Art. 17 bis 19, NIS2 Art. 23,
// DSGVO Art. 33/34, BSI DER.2.1; die Fristen je Regime rechnet Klick am
// Vorfall, die Richtlinie nennt sie nur allgemein.
// vor dem Verkauf fachlich prüfen (CLAUDE.md, Offene Punkte)

export const VORFALL: PolicyBuilder = {
	code: "RL-VORFALL",
	version: 1,
	sections: [
		{
			id: "zweck",
			heading: "Zweck und Geltungsbereich",
			questions: [
				{
					key: "umfang",
					kind: "choice",
					label: "Was gilt als Vorfall?",
					help: "DORA zählt auch ungeplante Ausfälle von IT-Diensten als Vorfall, nicht nur Angriffe.",
					gap: "Vorfall",
					options: [
						{
							value: "sicherheit",
							label: "Sicherheitsvorfälle",
							text: "jedes Ereignis, das Vertraulichkeit, Integrität oder Verfügbarkeit von Informationen oder Systemen beeinträchtigt oder gefährdet",
						},
						{
							value: "sicherheit_betrieb",
							label: "Sicherheitsvorfälle und Betriebsstörungen",
							text: "jedes Ereignis, das Vertraulichkeit, Integrität oder Verfügbarkeit von Informationen oder Systemen beeinträchtigt oder gefährdet, sowie jede ungeplante Störung eines IT-Dienstes",
						},
					],
					recommended: "sicherheit_betrieb",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Diese Richtlinie legt fest, wie Vorfälle bei {{org}} gemeldet, eingestuft, behandelt und dokumentiert werden und wie {{org}} aus ihnen lernt. Die Richtlinie gilt für alle Beschäftigten, Auszubildenden und externen Mitarbeitenden sowie für Dienstleister, die Systeme oder Daten von {{org}} betreuen.",
				},
				{
					kind: "p",
					text: "Ein Vorfall ist {{a:umfang}}. Schon der Verdacht auf einen Vorfall wird gemeldet. Beispiele sind:",
				},
				{
					kind: "ul",
					items: [
						"Schadsoftware auf einem Gerät oder ein Klick auf einen Link in einer Phishing-Mail",
						"ein verlorenes oder gestohlenes Gerät, ein verlorener Ausweis oder Sicherheitsschlüssel",
						"unbefugter Zugriff auf Konten, Systeme oder Räume",
						"personenbezogene Daten, die an falsche Empfänger:innen gehen oder ungeschützt veröffentlicht werden",
						"eine Störung bei einem Dienstleister, die {{org}} betrifft",
						{
							text: "der ungeplante Ausfall eines IT-Dienstes oder einer wichtigen Anwendung",
							when: { key: "umfang", is: ["sicherheit_betrieb"] },
						},
					],
				},
			],
		},
		{
			id: "meldewege",
			heading: "Meldewege und Zuständigkeit",
			questions: [
				{
					key: "meldestelle",
					kind: "text",
					label: "Wo melden Beschäftigte einen Vorfall oder Verdacht?",
					help: "Eine Stelle, die auch abends und am Wochenende erreichbar ist, zum Beispiel Servicedesk oder Bereitschaft.",
					gap: "Meldestelle",
					example:
						"beim IT-Servicedesk unter 030 1234567 oder sicherheit@example.com",
				},
				{
					key: "meldefrist",
					kind: "choice",
					label: "Wie schnell muss ein Vorfall gemeldet werden?",
					gap: "Meldefrist",
					options: [
						{ value: "sofort", label: "Sofort", text: "sofort" },
						{
							value: "1h",
							label: "Innerhalb einer Stunde",
							text: "innerhalb einer Stunde",
						},
					],
					recommended: "sofort",
				},
				{
					key: "verantwortlich",
					kind: "function",
					label: "Wer steuert die Bearbeitung von Vorfällen?",
					help: "Diese Stelle bewertet jede Meldung, stuft den Vorfall ein und koordiniert die Reaktion.",
					gap: "zuständige Funktion",
					suggest: "incident_manager",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Wer einen Vorfall oder Verdacht bemerkt, meldet ihn {{a:meldefrist}} {{a:meldestelle}}. Niemand wartet mit der Meldung, bis alle Einzelheiten bekannt sind.",
				},
				{
					kind: "p",
					text: "Die Bearbeitung steuert die Funktion {{a:verantwortlich}}. Diese Funktion nimmt Meldungen entgegen, stuft Vorfälle ein, koordiniert die Reaktion und hält alle Schritte im Vorfallregister fest. Für Abwesenheiten ist eine Vertretung benannt.",
				},
				{
					kind: "p",
					text: "Dienstleister melden Vorfälle, die {{org}} betreffen können, nach ihrem Vertrag an dieselbe Meldestelle.",
				},
			],
		},
		{
			id: "einstufung",
			heading: "Einstufung und Eskalation",
			questions: [
				{
					key: "stufen",
					kind: "choice",
					label: "In wie vielen Stufen wird ein Vorfall eingestuft?",
					gap: "Stufen",
					options: [
						{
							value: "drei",
							label: "Drei Stufen",
							text: "in drei Stufen (niedrig, mittel, hoch)",
						},
						{
							value: "vier",
							label: "Vier Stufen",
							text: "in vier Stufen (niedrig, mittel, hoch, kritisch)",
						},
					],
					recommended: "vier",
				},
				{
					key: "eskalation",
					kind: "choice",
					label:
						"Ab welcher Stufe wird die Geschäftsleitung sofort informiert?",
					gap: "Eskalation",
					options: [
						{
							value: "hoch",
							label: "Ab Stufe „hoch“",
							text: "ab der Stufe „hoch“",
						},
						{
							value: "mittel",
							label: "Ab Stufe „mittel“",
							text: "ab der Stufe „mittel“",
						},
						{
							value: "alle",
							label: "Bei jedem Vorfall",
							text: "bei jedem Vorfall",
						},
					],
					recommended: "hoch",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Die zuständige Funktion stuft jeden Vorfall {{a:stufen}} ein. Maßgeblich sind Auswirkung und Dringlichkeit, insbesondere:",
				},
				{
					kind: "ul",
					items: [
						"Zahl der betroffenen Kund:innen, Beschäftigten oder Geschäftspartner:innen",
						"Dauer der Störung und betroffene Dienste, vor allem kritische oder wichtige Funktionen",
						"Art und Menge der betroffenen Daten, vor allem personenbezogene oder vertrauliche Daten",
						"wirtschaftlicher Schaden und Folgen für den Ruf von {{org}}",
						"Ausbreitung über Standorte oder Länder hinweg",
					],
				},
				{
					kind: "p",
					text: "Die Geschäftsleitung wird {{a:eskalation}} unverzüglich informiert. Unabhängig von der Stufe wird sie immer informiert, wenn eine Meldepflicht gegenüber einer Behörde bestehen kann.",
				},
				{
					kind: "p",
					text: "Ändert sich die Lage, passt die zuständige Funktion die Einstufung an und hält den Grund fest.",
				},
			],
		},
		{
			id: "meldungen",
			heading: "Meldungen an Behörden und Betroffene",
			questions: [
				{
					key: "pruefung_frist",
					kind: "number",
					label:
						"Innerhalb wie vieler Stunden wird geprüft, ob eine Meldepflicht besteht?",
					help: "Gesetzliche Fristen beginnen oft schon mit dem Erkennen eines Vorfalls. Eine kurze interne Frist lässt Zeit für die Meldung.",
					gap: "Prüffrist",
					unit: ["Stunde", "Stunden"],
					min: 1,
					max: 24,
					recommended: 4,
				},
				{
					key: "freigabe",
					kind: "choice",
					label: "Wer gibt Meldungen an Behörden frei?",
					gap: "Freigabe der Meldung",
					options: [
						{
							value: "gl",
							label: "Die Geschäftsleitung",
							text: "die Geschäftsleitung",
						},
						{
							value: "funktion",
							label: "Die zuständige Funktion, Geschäftsleitung informiert",
							text: "die zuständige Funktion; die Geschäftsleitung wird spätestens mit der Meldung informiert",
						},
					],
					recommended: "gl",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Ob ein Vorfall gemeldet werden muss, prüft die zuständige Funktion spätestens {{a:pruefung_frist}} nach Eingang der Meldung. Je nach Vorfall kommen diese Meldungen in Betracht, soweit die Regeln für {{org}} gelten:",
				},
				{
					kind: "ul",
					items: [
						"Verletzungen des Schutzes personenbezogener Daten an die zuständige Datenschutzaufsicht, unverzüglich und möglichst binnen 72 Stunden, nachdem sie bekannt wurden (DSGVO)",
						"schwerwiegende IKT-bezogene Vorfälle an die zuständige Finanzaufsicht, mit Erstmeldung, Zwischenmeldung und Abschlussbericht (DORA)",
						"erhebliche Sicherheitsvorfälle an die zuständige Behörde, mit Frühwarnung, Meldung und Abschlussbericht (NIS2)",
					],
				},
				{
					kind: "p",
					text: "Meldungen gehen innerhalb der gesetzlichen Fristen an die Behörde. Die zuständige Funktion hält die Fristen für jeden Vorfall im Vorfallregister fest.",
				},
				{
					kind: "p",
					text: "Die Freigabe einer Meldung erteilt {{a:freigabe}}.",
				},
				{
					kind: "p",
					when: { key: "freigabe", is: ["gl"] },
					text: "Ist die Geschäftsleitung nicht rechtzeitig erreichbar, meldet die zuständige Funktion fristgerecht und informiert die Geschäftsleitung danach.",
				},
				{
					kind: "p",
					text: "Betroffene Personen und Kund:innen informiert {{org}}, wenn das Gesetz es verlangt oder es zu ihrem Schutz nötig ist. Jede Meldung wird mit Zeitpunkt, Inhalt und Empfänger:innen festgehalten. Auch die Entscheidung, nicht zu melden, wird begründet dokumentiert.",
				},
			],
		},
		{
			id: "reaktion",
			heading: "Reaktion und Beweissicherung",
			questions: [
				{
					key: "forensik",
					kind: "choice",
					label:
						"Wer unterstützt bei schweren Vorfällen, zum Beispiel bei der Sicherung von Spuren?",
					help: "Ein Rahmenvertrag spart im Ernstfall Zeit, weil Vertrag und Ansprechpersonen schon feststehen.",
					gap: "Unterstützung bei schweren Vorfällen",
					options: [
						{
							value: "intern",
							label: "Eigene Fachleute",
							text: "Schwere Vorfälle untersuchen eigene Fachleute, die in der Sicherung von Spuren geschult sind",
						},
						{
							value: "rahmenvertrag",
							label: "Externer Dienstleister mit Rahmenvertrag",
							text: "Für schwere Vorfälle besteht ein Rahmenvertrag mit einem spezialisierten Dienstleister für Vorfallbehandlung, der kurzfristig unterstützt",
						},
						{
							value: "bedarf",
							label: "Externer Dienstleister bei Bedarf",
							text: "Für schwere Vorfälle beauftragt die zuständige Funktion bei Bedarf einen spezialisierten Dienstleister für Vorfallbehandlung",
						},
					],
					recommended: "rahmenvertrag",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Die zuständige Funktion koordiniert die Reaktion in dieser Reihenfolge:",
				},
				{
					kind: "ul",
					items: [
						"Eindämmen: die Ausbreitung stoppen, zum Beispiel betroffene Systeme vom Netz trennen oder Konten sperren.",
						"Spuren sichern: Protokolle, Abbilder von Datenträgern und Zeitpunkte sichern, bevor Systeme verändert werden; jede Übergabe von Beweisen wird festgehalten.",
						"Beseitigen: die Ursache entfernen, zum Beispiel Schadsoftware löschen, Lücken schließen, Passwörter und Schlüssel wechseln.",
						"Wiederherstellen: Systeme aus geprüften Sicherungen zurückspielen und erst nach einer Prüfung wieder freigeben.",
					],
				},
				{
					kind: "p",
					text: "Beschäftigte verändern betroffene Geräte nicht, löschen nichts und folgen den Anweisungen der zuständigen Funktion. Eigene Ermittlungen, etwa Kontakt zu Angreifenden, unterbleiben.",
				},
				{ kind: "p", text: "{{a:forensik}}." },
				{
					kind: "p",
					text: "Gefährdet ein Vorfall kritische Geschäftsprozesse, wird der Notfall- und Wiederanlaufplan aktiviert und bei Bedarf der Krisenstab einberufen. Während eines Vorfalls nutzen die Beteiligten Kommunikationswege, die nicht betroffen sind.",
				},
			],
		},
		{
			id: "nachbetrachtung",
			heading: "Nachbetrachtung und Dokumentation",
			questions: [
				{
					key: "nachbetrachtung_frist",
					kind: "number",
					label:
						"Wie viele Tage nach Abschluss eines Vorfalls findet die Nachbetrachtung spätestens statt?",
					help: "Solange die Erinnerung frisch ist, lassen sich Ursachen und Abläufe am besten klären.",
					gap: "Frist der Nachbetrachtung",
					unit: ["Tag", "Tage"],
					min: 1,
					max: 60,
					recommended: 14,
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Jeder Vorfall, der an die Geschäftsleitung eskaliert oder an eine Behörde gemeldet wurde, wird nachbetrachtet. Die Nachbetrachtung findet spätestens {{a:nachbetrachtung_frist}} nach Abschluss des Vorfalls statt. Geklärt werden dabei:",
				},
				{
					kind: "ul",
					items: [
						"die Ursache und warum bestehende Maßnahmen den Vorfall nicht verhindert haben",
						"der Ablauf, die Reaktionszeiten und ob Meldungen rechtzeitig waren",
						"was gut funktioniert hat und was nicht",
						"Maßnahmen mit Verantwortlichen und Fristen, zum Beispiel Änderungen an Controls, Richtlinien oder Schulungen",
					],
				},
				{
					kind: "p",
					text: "Die Maßnahmen werden als Aufgaben verfolgt. Erkenntnisse fließen in die Risikoanalyse, in Schulungen und in die Managementbewertung ein.",
				},
				{ kind: "p", text: "Im Vorfallregister steht zu jedem Vorfall:" },
				{
					kind: "ul",
					items: [
						"Zeitpunkt des Erkennens und der Meldung",
						"Beschreibung, Einstufung und betroffene Systeme und Daten",
						"ergriffene Maßnahmen und Meldungen an Behörden",
						"Ergebnis der Nachbetrachtung",
					],
				},
			],
		},
	],
};
