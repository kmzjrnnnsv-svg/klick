import type { PolicyBuilder } from "../types";

// Dienstleister- und Auslagerungsrichtlinie (RL-DIENSTLEISTER). Inhalte nach
// ISO 27001 A.5.19 bis A.5.23, DORA Art. 28 bis 30, NIS2 Art. 21(2)(d),
// MaRisk AT 9 und DSGVO Art. 28, jeweils allgemein gefasst.
// vor dem Verkauf fachlich prüfen (CLAUDE.md, Offene Punkte)

export const DIENSTLEISTER: PolicyBuilder = {
	code: "RL-DIENSTLEISTER",
	version: 1,
	sections: [
		{
			id: "zweck",
			heading: "Zweck und Geltungsbereich",
			questions: [
				{
					key: "umfang",
					kind: "choice",
					label: "Für welche Dienstleister gilt die Richtlinie?",
					gap: "erfasste Dienstleister",
					options: [
						{
							value: "alle",
							label: "Alle mit Zugriff auf Daten oder Systeme",
							text: "alle Dienstleister, die auf Informationen oder Systeme von {{org}} zugreifen oder für den Geschäftsbetrieb wichtige Leistungen erbringen",
						},
						{
							value: "it",
							label: "Nur IT-Dienstleister",
							text: "alle Dienstleister, die IT-Leistungen für {{org}} erbringen, zum Beispiel Cloud, Hosting, Software und IT-Betrieb",
						},
					],
					recommended: "alle",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Diese Richtlinie legt fest, wie {{org}} Dienstleister auswählt, prüft, vertraglich bindet, überwacht und wechselt. So bleiben Risiken aus Fremdbezug und Auslagerung beherrschbar.",
				},
				{
					kind: "p",
					text: "Die Richtlinie gilt für {{a:umfang}}. Erfasst sind auch Auslagerungen und die Unterauftragnehmer der Dienstleister.",
				},
				{
					kind: "p",
					text: "Die Verantwortung für ausgelagerte Aufgaben bleibt bei der Geschäftsleitung von {{org}}. Eine Auslagerung darf weder die Steuerung des Geschäfts noch die Prüfung durch die Aufsicht beeinträchtigen.",
				},
			],
		},
		{
			id: "einstufung",
			heading: "Zuständigkeit und Einstufung",
			questions: [
				{
					key: "verantwortlich",
					kind: "function",
					label: "Wer steuert Dienstleister und Auslagerungen?",
					help: "Diese Stelle führt das Dienstleisterregister, stuft Dienstleister ein und überwacht sie.",
					gap: "zuständige Funktion",
					suggest: "outsourcing_officer",
				},
				{
					key: "stufen",
					kind: "choice",
					label: "In wie vielen Stufen wird die Kritikalität eingestuft?",
					gap: "Stufen der Kritikalität",
					options: [
						{
							value: "drei",
							label: "Drei Stufen",
							text: "drei Stufen (hoch, mittel, gering)",
						},
						{
							value: "zwei",
							label: "Zwei Stufen",
							text: "zwei Stufen (kritisch, nicht kritisch)",
						},
					],
					recommended: "drei",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Dienstleister und Auslagerungen steuert die Funktion {{a:verantwortlich}}. Fachbereiche, die einen Dienstleister beauftragen wollen, beziehen diese Funktion vor der Auswahl ein.",
				},
				{
					kind: "p",
					text: "Vor Vertragsschluss stuft die zuständige Funktion jeden Dienstleister nach seiner Kritikalität in {{a:stufen}} ein. Die höchste Stufe erhält ein Dienstleister, wenn mindestens einer dieser Punkte zutrifft:",
				},
				{
					kind: "ul",
					items: [
						"Der Dienstleister unterstützt eine kritische oder wichtige Funktion von {{org}}.",
						"Ein Ausfall oder eine Schlechtleistung würde den Geschäftsbetrieb, Kund:innen oder Pflichten gegenüber der Aufsicht erheblich beeinträchtigen.",
						"Der Dienstleister verarbeitet vertrauliche oder personenbezogene Daten in großem Umfang.",
						"Der Dienstleister ist kurzfristig nicht ersetzbar.",
					],
				},
				{
					kind: "p",
					text: "Dienstleister der höchsten Stufe heißen in dieser Richtlinie „kritisch“. Wesentliche Auslagerungen sind immer kritisch. Die Beauftragung eines kritischen Dienstleisters genehmigt die Geschäftsleitung.",
				},
			],
		},
		{
			id: "auswahl",
			heading: "Auswahl und Sorgfaltsprüfung",
			questions: [
				{
					key: "pruefung",
					kind: "choice",
					label:
						"Wie werden kritische Dienstleister vor Vertragsschluss zusätzlich geprüft?",
					help: "Ein eigenes Audit lohnt sich vor allem, wenn keine anerkannten Nachweise vorliegen.",
					gap: "zusätzliche Prüfung",
					options: [
						{
							value: "nachweise",
							label: "Fragebogen und Nachweise",
							text: "mit einem Fragebogen zur Informationssicherheit und anerkannten Nachweisen wie einem ISO-27001-Zertifikat oder einem SOC-2-Bericht",
						},
						{
							value: "audit",
							label: "Fragebogen, Nachweise und eigenes Audit",
							text: "mit einem Fragebogen zur Informationssicherheit, anerkannten Nachweisen und einem eigenen Audit",
						},
					],
					recommended: "nachweise",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Vor der Auswahl prüft die zuständige Funktion jeden Dienstleister in einem Umfang, der zu seiner Kritikalität passt. Geprüft werden insbesondere:",
				},
				{
					kind: "ul",
					items: [
						"fachliche Eignung, Zuverlässigkeit und wirtschaftliche Lage",
						"Informationssicherheit und Datenschutz, einschließlich Zertifikaten und Prüfberichten",
						"Orte, an denen die Leistung erbracht und Daten verarbeitet werden",
						"eingesetzte Unterauftragnehmer",
						"Abhängigkeiten, zum Beispiel wenn schon mehrere wichtige Leistungen beim selben Anbieter liegen",
					],
				},
				{
					kind: "p",
					text: "Kritische Dienstleister prüft die zuständige Funktion zusätzlich {{a:pruefung}}.",
				},
				{
					kind: "p",
					text: "Ergebnis, Risiken und Entscheidung werden dokumentiert. Erhebliche Risiken fließen in die Risikoanalyse ein.",
				},
			],
		},
		{
			id: "vertrag",
			heading: "Vertragliche Mindestinhalte",
			questions: [
				{
					key: "vorfall_meldung",
					kind: "number",
					label:
						"Innerhalb wie vieler Stunden müssen Dienstleister Sicherheitsvorfälle melden?",
					help: "Die Frist muss zu den eigenen Meldepflichten passen; diese beginnen oft schon mit dem Erkennen.",
					gap: "Meldefrist für Dienstleister",
					unit: ["Stunde", "Stunden"],
					min: 1,
					max: 72,
					recommended: 24,
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Jeder Vertrag mit einem Dienstleister regelt schriftlich mindestens:",
				},
				{
					kind: "ul",
					items: [
						"Leistung, Ort der Leistung und Ort der Datenverarbeitung",
						"Vertraulichkeit und Anforderungen an die Informationssicherheit",
						"die Pflicht, Sicherheitsvorfälle, die {{org}} betreffen können, spätestens {{a:vorfall_meldung}} nach Bekanntwerden zu melden",
						"Einsatz von Unterauftragnehmern nur nach vorheriger Information, mit einem Recht zum Widerspruch",
						"Rückgabe und Löschung der Daten bei Vertragsende",
						"Prüf- und Zugangsrechte für {{org}}",
					],
				},
				{
					kind: "p",
					text: "Verarbeitet ein Dienstleister personenbezogene Daten im Auftrag, schließt {{org}} zusätzlich einen Vertrag zur Auftragsverarbeitung. Verträge mit kritischen Dienstleistern regeln außerdem:",
				},
				{
					kind: "ul",
					items: [
						"Service-Level mit messbaren Zielen und regelmäßige Berichte",
						"Notfallpläne des Dienstleisters und deren Tests",
						"uneingeschränkte Prüf- und Zugangsrechte, auch für Prüfer:innen und die Aufsicht",
						"Mitwirkung an Tests und Übungen von {{org}}",
						"Kündigungsrechte, angemessene Übergangsfristen und Unterstützung beim Ausstieg",
					],
				},
				{
					kind: "p",
					text: "Unterliegt {{org}} der DORA, enthalten Verträge mit IKT-Dienstleistern die dort verlangten Mindestinhalte.",
				},
			],
		},
		{
			id: "ueberwachung",
			heading: "Überwachung",
			questions: [
				{
					key: "review_kritisch",
					kind: "number",
					label:
						"Alle wie viele Monate werden kritische Dienstleister neu bewertet?",
					help: "Üblich ist eine Bewertung im Jahr, bei hohem Risiko auch öfter.",
					gap: "Turnus für kritische Dienstleister",
					unit: ["Monat", "Monate"],
					min: 3,
					max: 36,
					recommended: 12,
				},
				{
					key: "review_sonstige",
					kind: "choice",
					label: "Wie oft werden die übrigen Dienstleister geprüft?",
					gap: "Turnus für übrige Dienstleister",
					options: [
						{ value: "24", label: "Alle 24 Monate", text: "alle 24 Monate" },
						{ value: "36", label: "Alle 36 Monate", text: "alle 36 Monate" },
						{
							value: "anlass",
							label: "Nur bei Anlass",
							text: "nur bei Anlass",
						},
					],
					recommended: "24",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Kritische Dienstleister bewertet die zuständige Funktion mindestens alle {{a:review_kritisch}} neu. Die übrigen Dienstleister werden {{a:review_sonstige}} geprüft. Grundlage sind:",
				},
				{
					kind: "ul",
					items: [
						"Berichte zu Service-Levels und Störungen",
						"Gültigkeit von Zertifikaten und Prüfberichten",
						"Vorfälle beim Dienstleister",
						"Änderungen an Leistung, Standorten oder Unterauftragnehmern",
					],
				},
				{
					kind: "p",
					text: "Außer der Reihe prüft die zuständige Funktion nach einem schweren Vorfall, bei einer wesentlichen Vertragsänderung oder beim Wechsel wichtiger Unterauftragnehmer. Bei Mängeln vereinbart sie Maßnahmen mit Fristen und verfolgt deren Umsetzung.",
				},
				{
					kind: "p",
					text: "Liegen mehrere kritische Leistungen beim selben Anbieter, bewertet die zuständige Funktion das Risiko dieser Abhängigkeit und berichtet es der Geschäftsleitung.",
				},
			],
		},
		{
			id: "ausstieg",
			heading: "Ausstieg",
			questions: [
				{
					key: "exitplan",
					kind: "choice",
					label: "Wie oft werden die Ausstiegspläne geprüft?",
					help: "Ein Plan, der nie geprüft wird, scheitert oft an veralteten Annahmen über Daten, Zeit und Alternativen.",
					gap: "Prüfung der Ausstiegspläne",
					options: [
						{ value: "jaehrlich", label: "Jährlich", text: "jährlich" },
						{
							value: "zwei_jahre",
							label: "Alle zwei Jahre",
							text: "alle zwei Jahre",
						},
					],
					recommended: "jaehrlich",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Für jeden kritischen Dienstleister gibt es einen schriftlichen Ausstiegsplan. Er beschreibt:",
				},
				{
					kind: "ul",
					items: [
						"Auslöser, zum Beispiel Insolvenz, schwere Vertragsverletzung, nicht mehr tragbare Risiken oder eine Anordnung der Aufsicht",
						"Alternativen: ein anderer Anbieter oder die Übernahme der Leistung durch {{org}} selbst",
						"Rückführung und Löschung der Daten",
						"einen realistischen Zeitplan, mit dem kritische oder wichtige Funktionen ohne Unterbrechung weiterlaufen",
					],
				},
				{
					kind: "p",
					text: "Die zuständige Funktion prüft die Pläne {{a:exitplan}} auf Durchführbarkeit und passt sie bei Änderungen an.",
				},
			],
		},
		{
			id: "register",
			heading: "Dienstleisterregister und Anzeigen",
			questions: [
				{
					key: "register_pruefung",
					kind: "choice",
					label:
						"Wie oft wird das Dienstleisterregister auf Vollständigkeit geprüft?",
					gap: "Prüfung des Registers",
					options: [
						{
							value: "vierteljaehrlich",
							label: "Vierteljährlich",
							text: "mindestens vierteljährlich",
						},
						{
							value: "halbjaehrlich",
							label: "Halbjährlich",
							text: "mindestens halbjährlich",
						},
						{
							value: "jaehrlich",
							label: "Jährlich",
							text: "mindestens jährlich",
						},
					],
					recommended: "jaehrlich",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Die zuständige Funktion führt ein Register aller Dienstleister. Es enthält Leistung, Einstufung, Vertragsdaten, Standorte, verarbeitete Daten, Unterauftragnehmer und das Datum der letzten Bewertung.",
				},
				{
					kind: "p",
					text: "Das Register wird {{a:register_pruefung}} auf Vollständigkeit und Aktualität geprüft.",
				},
				{
					kind: "p",
					text: "Unterliegt {{org}} der DORA, enthält das Register die Angaben des Informationsregisters, das der Aufsicht auf Anforderung vorgelegt wird. Geplante Verträge über kritische oder wichtige Funktionen zeigt {{org}} der Aufsicht an, soweit eine Anzeigepflicht besteht.",
				},
			],
		},
	],
};
