import type { PolicyBuilder } from "../types";

// Personalsicherheit (RL-PERSONAL). Inhalte nach ISO 27001 A.6.1 bis A.6.7,
// BSI ORP.2 und NIS2 Art. 21(2)(i); Überprüfung nur im arbeits- und
// datenschutzrechtlich zulässigen Rahmen.
// vor dem Verkauf fachlich prüfen (CLAUDE.md, Offene Punkte)

export const PERSONAL: PolicyBuilder = {
	code: "RL-PERSONAL",
	version: 1,
	sections: [
		{
			id: "zweck",
			heading: "Zweck und Geltungsbereich",
			questions: [
				{
					key: "geltung",
					kind: "choice",
					label: "Für wen gilt die Richtlinie?",
					gap: "Personenkreis",
					options: [
						{
							value: "beschaeftigte",
							label: "Beschäftigte",
							text: "alle Beschäftigten und Auszubildenden von {{org}}",
						},
						{
							value: "mit_externen",
							label: "Beschäftigte und Externe",
							text: "alle Beschäftigten und Auszubildenden von {{org}} sowie für Leiharbeitskräfte, freie Mitarbeitende und andere Externe mit Zugang zu Informationen",
						},
					],
					recommended: "mit_externen",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Diese Richtlinie legt fest, wie {{org}} Informationen vor, während und nach einer Beschäftigung schützt. Geregelt sind Überprüfung, Vertraulichkeit, Schulung, der Umgang mit Verstößen, das Arbeiten außerhalb der Geschäftsräume und der Austritt.",
				},
				{ kind: "p", text: "Die Richtlinie gilt für {{a:geltung}}." },
				{
					kind: "p",
					when: { key: "geltung", is: ["mit_externen"] },
					text: "Für Externe, die über einen Dienstleister tätig werden, sorgt der Vertrag mit dem Dienstleister für gleichwertige Regeln, vor allem bei Überprüfung und Vertraulichkeit.",
				},
			],
		},
		{
			id: "einstellung",
			heading: "Vor der Einstellung",
			questions: [
				{
					key: "ueberpruefung",
					kind: "choice",
					label:
						"Wie gründlich werden Bewerber:innen vor der Einstellung überprüft?",
					help: "Ein Führungszeugnis darf nur verlangt werden, wenn die Position es rechtfertigt. Kläre den Umfang mit dem Datenschutz und, falls vorhanden, dem Betriebsrat.",
					gap: "Überprüfung",
					options: [
						{
							value: "grund",
							label: "Grundprüfung für alle",
							text: "Identität, Lebenslauf, Zeugnisse und Qualifikationen",
						},
						{
							value: "erweitert",
							label:
								"Grundprüfung, für Vertrauenspositionen zusätzlich Führungszeugnis",
							text: "Identität, Lebenslauf, Zeugnisse und Qualifikationen, bei Positionen mit erhöhtem Vertrauen zusätzlich das Führungszeugnis",
						},
					],
					recommended: "erweitert",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Vor der Einstellung prüft {{org}} {{a:ueberpruefung}}. Umfang und Tiefe richten sich nach der Position und nach der Einstufung der Informationen, auf die die Person zugreifen wird.",
				},
				{
					kind: "p",
					when: { key: "ueberpruefung", is: ["erweitert"] },
					text: "Positionen mit erhöhtem Vertrauen sind zum Beispiel die Geschäftsleitung, Administrator:innen und Funktionen mit Zugriff auf Zahlungsverkehr oder streng vertrauliche Daten.",
				},
				{
					kind: "p",
					text: "Die Überprüfung erfolgt nur im gesetzlich zulässigen Rahmen. Ergebnisse werden vertraulich behandelt und nur so lange gespeichert wie nötig.",
				},
				{
					kind: "p",
					text: "Arbeitsverträge verweisen auf die Pflichten zur Informationssicherheit. Vor dem ersten Zugang bestätigen neue Beschäftigte, dass sie die für sie geltenden Richtlinien kennen.",
				},
			],
		},
		{
			id: "vertraulichkeit",
			heading: "Vertraulichkeit",
			questions: [
				{
					key: "nda",
					kind: "choice",
					label: "Wie wird die Vertraulichkeit vereinbart?",
					gap: "Vertraulichkeitsvereinbarung",
					options: [
						{
							value: "vertrag",
							label:
								"Klausel im Arbeitsvertrag, gesonderte Vereinbarung für Externe",
							text: "Für Beschäftigte gilt die Vertraulichkeitsklausel im Arbeitsvertrag; Externe unterzeichnen vor dem ersten Zugang eine gesonderte Vertraulichkeitsvereinbarung",
						},
						{
							value: "gesondert",
							label: "Gesonderte Vereinbarung für alle",
							text: "Alle Beschäftigten und Externen unterzeichnen vor dem ersten Zugang eine gesonderte Vertraulichkeitsvereinbarung",
						},
					],
					recommended: "vertrag",
				},
			],
			blocks: [
				{ kind: "p", text: "{{a:nda}}. Die Vereinbarungen legen fest:" },
				{
					kind: "ul",
					items: [
						"welche Informationen vertraulich sind",
						"wie mit ihnen umzugehen ist und wann sie zurückgegeben oder gelöscht werden",
						"dass die Pflicht über das Ende der Beschäftigung oder des Auftrags hinaus gilt",
						"welche Folgen ein Verstoß hat",
					],
				},
				{
					kind: "p",
					text: "Wer personenbezogene Daten verarbeitet, wird zusätzlich auf die Vertraulichkeit nach dem Datenschutzrecht verpflichtet. Die Vereinbarungen werden überprüft, wenn sich Anforderungen ändern, mindestens aber bei jeder Überarbeitung dieser Richtlinie.",
				},
			],
		},
		{
			id: "schulung",
			heading: "Schulung und Sensibilisierung",
			questions: [
				{
					key: "schulung_verantwortlich",
					kind: "function",
					label: "Wer organisiert die Schulungen zur Informationssicherheit?",
					help: "Diese Stelle legt die Inhalte fest, lädt ein und überwacht die Teilnahme.",
					gap: "zuständige Funktion",
					suggest: "isb_ciso",
				},
				{
					key: "schulung_eintritt",
					kind: "choice",
					label: "Wann absolvieren neue Beschäftigte die erste Schulung?",
					gap: "erste Schulung",
					options: [
						{
							value: "vor_zugang",
							label: "Vor dem ersten Zugang zu Systemen",
							text: "vor dem ersten Zugang zu Systemen",
						},
						{
							value: "erste_woche",
							label: "In der ersten Arbeitswoche",
							text: "in der ersten Arbeitswoche",
						},
						{
							value: "erster_monat",
							label: "Im ersten Monat",
							text: "im ersten Monat",
						},
					],
					recommended: "erste_woche",
				},
				{
					key: "schulung_intervall",
					kind: "number",
					label: "Alle wie viele Monate wird die Schulung wiederholt?",
					help: "Üblich ist eine Wiederholung im Jahr.",
					gap: "Wiederholung",
					unit: ["Monat", "Monate"],
					min: 3,
					max: 36,
					recommended: 12,
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Schulungen zur Informationssicherheit organisiert die Funktion {{a:schulung_verantwortlich}}. Neue Beschäftigte absolvieren die Grundschulung {{a:schulung_eintritt}}. Danach wird die Schulung alle {{a:schulung_intervall}} wiederholt.",
				},
				{ kind: "p", text: "Die Schulung behandelt mindestens:" },
				{
					kind: "ul",
					items: [
						"die geltenden Richtlinien und wo sie zu finden sind",
						"Phishing, Betrug und andere Formen der Manipulation",
						"sichere Anmeldung mit Passkey, Passwort und zweitem Faktor",
						"Umgang mit vertraulichen und personenbezogenen Daten",
						"Erkennen und Melden von Vorfällen",
						"sicheres Arbeiten außerhalb der Geschäftsräume",
					],
				},
				{
					kind: "p",
					text: "Wer besondere Aufgaben hat, etwa in Administration, Entwicklung oder Geschäftsleitung, erhält zusätzliche Schulungen. Die Teilnahme wird dokumentiert. Bleibt eine Schulung nach einer Erinnerung offen, wird die Führungskraft informiert.",
				},
			],
		},
		{
			id: "verstoesse",
			heading: "Verstöße",
			questions: [
				{
					key: "entscheidung",
					kind: "choice",
					label:
						"Wer entscheidet über arbeitsrechtliche Maßnahmen nach einem Verstoß?",
					gap: "Entscheidung über Maßnahmen",
					options: [
						{
							value: "gl",
							label: "Die Geschäftsleitung",
							text: "die Geschäftsleitung",
						},
						{
							value: "personal",
							label: "Personalabteilung mit Führungskraft",
							text: "die Personalabteilung gemeinsam mit der Führungskraft, bei schweren Verstößen die Geschäftsleitung",
						},
					],
					recommended: "gl",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Verstöße gegen Regeln zur Informationssicherheit werden in einem festgelegten, fairen Verfahren behandelt. Vor jeder Maßnahme wird der Sachverhalt geklärt und die betroffene Person angehört.",
				},
				{
					kind: "p",
					text: "Die Maßnahme richtet sich nach Art und Schwere des Verstoßes, nach Vorsatz oder Fahrlässigkeit, nach Wiederholung und nach den Folgen für {{org}}. Möglich sind ein klärendes Gespräch, eine Nachschulung, eine Abmahnung oder eine Kündigung.",
				},
				{
					kind: "p",
					text: "Über arbeitsrechtliche Maßnahmen entscheidet {{a:entscheidung}}. Der Betriebsrat wird beteiligt, soweit er Mitbestimmungsrechte hat.",
				},
				{
					kind: "p",
					text: "Wer einen eigenen Fehler sofort meldet, hilft, den Schaden zu begrenzen; das wird zugunsten der Person berücksichtigt.",
				},
			],
		},
		{
			id: "mobil",
			heading: "Arbeiten außerhalb der Geschäftsräume",
			questions: [
				{
					key: "mobil",
					kind: "choice",
					label: "Ist Arbeiten im Homeoffice oder unterwegs erlaubt?",
					gap: "mobiles Arbeiten",
					options: [
						{
							value: "vereinbarung",
							label: "Ja, mit Vereinbarung",
							text: "nach einer schriftlichen Vereinbarung mit der Führungskraft erlaubt",
						},
						{
							value: "alle",
							label: "Ja, für alle",
							text: "für alle Beschäftigten erlaubt, deren Aufgaben es zulassen",
						},
						{
							value: "ausnahme",
							label: "Nur ausnahmsweise",
							text: "nur ausnahmsweise mit Zustimmung der Führungskraft erlaubt",
						},
					],
					recommended: "vereinbarung",
				},
				{
					key: "ausland",
					kind: "choice",
					label: "Darf aus dem Ausland gearbeitet werden?",
					help: "Arbeit aus dem Ausland kann Datenschutz, Steuern, Sozialversicherung und Exportkontrolle berühren.",
					gap: "Arbeiten aus dem Ausland",
					options: [
						{
							value: "eu",
							label: "In der EU nach Zustimmung der Führungskraft",
							text: "innerhalb der EU nach Zustimmung der Führungskraft erlaubt, außerhalb der EU nur mit Zustimmung der Geschäftsleitung",
						},
						{
							value: "zustimmung",
							label: "Nur mit Zustimmung der Geschäftsleitung",
							text: "nur mit vorheriger Zustimmung der Geschäftsleitung erlaubt",
						},
						{ value: "nein", label: "Nicht erlaubt", text: "nicht erlaubt" },
					],
					recommended: "zustimmung",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Arbeiten im Homeoffice oder unterwegs ist {{a:mobil}}. Arbeiten aus dem Ausland ist {{a:ausland}}.",
				},
				{ kind: "p", text: "Außerhalb der Geschäftsräume gilt:" },
				{
					kind: "ul",
					items: [
						"Gearbeitet wird nur mit Geräten, die {{org}} freigegeben hat, und über gesicherte Verbindungen.",
						"Der Arbeitsplatz ist so gewählt, dass Unbefugte weder auf den Bildschirm sehen noch vertrauliche Gespräche mithören können.",
						"Geräte und Unterlagen bleiben nie unbeaufsichtigt und werden nach der Arbeit sicher verwahrt.",
						"Vertrauliche Unterlagen auf Papier werden nur mitgenommen, wenn es nötig ist, und nie im Hausmüll entsorgt.",
					],
				},
			],
		},
		{
			id: "austritt",
			heading: "Austritt und Wechsel",
			questions: [
				{
					key: "zugang_entzug",
					kind: "number",
					label:
						"Wie viele Stunden nach Ende des letzten Arbeitstags sind alle Zugänge spätestens gesperrt?",
					help: "Bei einer Freistellung oder fristlosen Kündigung gilt die Sperre sofort.",
					gap: "Sperrfrist",
					unit: ["Stunde", "Stunden"],
					min: 1,
					max: 72,
					recommended: 24,
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Personalabteilung oder Führungskraft melden jeden Austritt und jeden Wechsel der Aufgabe rechtzeitig an die IT.",
				},
				{
					kind: "p",
					text: "Alle Zugänge werden spätestens {{a:zugang_entzug}} nach Ende des letzten Arbeitstags gesperrt. Bei einer Freistellung oder fristlosen Kündigung werden sie sofort gesperrt. Bei einem Wechsel der Aufgabe werden nicht mehr nötige Rechte in derselben Frist entzogen.",
				},
				{
					kind: "p",
					text: "Spätestens am letzten Arbeitstag gibt die Person alle Werte von {{org}} zurück:",
				},
				{
					kind: "ul",
					items: [
						"Geräte, Datenträger und Zubehör",
						"Ausweise, Schlüssel und Sicherheitsschlüssel",
						"Unterlagen und Daten, auch aus privaten Ablagen",
					],
				},
				{
					kind: "p",
					text: "Die Rückgabe wird bestätigt und im Geräteverzeichnis vermerkt. Beim Austritt wird die Person daran erinnert, dass die Pflicht zur Vertraulichkeit fortgilt.",
				},
			],
		},
	],
};
