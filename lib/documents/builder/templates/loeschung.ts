import type { PolicyBuilder } from "../types";

// Aufbewahrungs- und Löschkonzept (KZ-LOESCHUNG). Inhalte nach DSGVO
// Art. 5(1)(e), 17, 18 und 30(1)(f), ISO 27001 A.5.33 und A.8.10, DIN 66398
// (Löschklassen) und DIN 66399 (Vernichtung); handels- und steuerrechtliche
// Fristen und GwG nur allgemein, ohne einzelne Fristen je Unterlage.
// vor dem Verkauf fachlich prüfen (CLAUDE.md, Offene Punkte)

export const LOESCHUNG: PolicyBuilder = {
	code: "KZ-LOESCHUNG",
	version: 1,
	sections: [
		{
			id: "zweck",
			heading: "Zweck und Geltungsbereich",
			questions: [
				{
					key: "umfang",
					kind: "choice",
					label: "Welche Daten deckt das Konzept ab?",
					gap: "erfasste Daten",
					options: [
						{
							value: "personenbezogen",
							label: "Personenbezogene Daten",
							text: "alle personenbezogenen Daten",
						},
						{
							value: "alle",
							label: "Alle Geschäftsdaten",
							text: "alle personenbezogenen Daten und alle übrigen Geschäftsdaten",
						},
					],
					recommended: "alle",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Dieses Konzept legt fest, wie lange {{org}} Daten aufbewahrt und wie sie danach gelöscht werden. Daten werden nur so lange gespeichert, wie es für ihren Zweck nötig ist oder eine gesetzliche Pflicht es verlangt.",
				},
				{
					kind: "p",
					text: "Das Konzept gilt für {{a:umfang}}, die {{org}} verarbeitet, gleich ob in Anwendungen, Ablagen, Postfächern, Datensicherungen oder auf Papier.",
				},
				{
					kind: "p",
					text: "Löschen heißt: Daten sind so beseitigt, dass sie sich mit vertretbarem Aufwand nicht wiederherstellen lassen.",
				},
			],
		},
		{
			id: "klassen",
			heading: "Löschklassen und Regelfrist",
			questions: [
				{
					key: "verantwortlich",
					kind: "function",
					label: "Wer pflegt das Löschkonzept?",
					help: "Die Funktion Datenschutzbeauftragte:r berät und überwacht nur. Pflegen sollte das Konzept eine andere Funktion, damit die Überwachung unabhängig bleibt.",
					gap: "zuständige Funktion",
					suggest: "compliance",
				},
				{
					key: "uebersicht",
					kind: "choice",
					label: "Wo stehen die Löschfristen je Datenart?",
					help: "Das Verzeichnis von Verarbeitungstätigkeiten soll die Löschfristen ohnehin nennen.",
					gap: "Übersicht der Datenarten",
					options: [
						{
							value: "vvt",
							label: "Im Verzeichnis von Verarbeitungstätigkeiten",
							text: "im Verzeichnis von Verarbeitungstätigkeiten",
						},
						{
							value: "eigen",
							label: "In einer eigenen Übersicht",
							text: "in einer eigenen Übersicht der Löschregeln",
						},
					],
					recommended: "vvt",
				},
				{
					key: "regelfrist",
					kind: "number",
					label:
						"Wie viele Monate nach Erfüllung des Zwecks werden Daten ohne eigene Frist spätestens gelöscht?",
					help: "Die Regelfrist greift nur, wenn weder ein Gesetz noch die Übersicht eine andere Frist vorgibt.",
					gap: "Regelfrist",
					unit: ["Monat", "Monate"],
					min: 1,
					max: 36,
					recommended: 3,
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Das Konzept pflegt die Funktion {{a:verantwortlich}}. Die Funktion Datenschutzbeauftragte:r berät dabei und überwacht die Einhaltung. Für die Löschung in den einzelnen Anwendungen sind deren Verantwortliche zuständig.",
				},
				{
					kind: "p",
					text: "Jede Datenart steht mit Zweck, Speicherort, Löschklasse und zuständiger Stelle {{a:uebersicht}}. Eine Löschklasse verbindet eine Frist mit dem Ereignis, ab dem die Frist läuft.",
				},
				{
					kind: "p",
					text: "Gilt für eine Datenart weder eine gesetzliche Pflicht noch eine eigene Frist, wird sie spätestens {{a:regelfrist}} nach Erfüllung ihres Zwecks gelöscht (Regelfrist). {{org}} nutzt diese Löschklassen:",
				},
				{
					kind: "ul",
					items: [
						"Vorgangsdaten, zum Beispiel Anfragen ohne Vertrag oder Arbeitskopien: Regelfrist ab Abschluss des Vorgangs",
						"Bewerbungsdaten: nach Abschluss des Verfahrens und Ablauf der Fristen für mögliche Ansprüche, in der Regel nach sechs Monaten",
						"Vertrags- und Kundendaten: nach Ende der Geschäftsbeziehung und Ablauf der Verjährung möglicher Ansprüche",
						"aufbewahrungspflichtige Unterlagen: nach Ablauf der gesetzlichen Frist, meist gerechnet ab Ende des Kalenderjahrs, in dem die Unterlage entstanden ist",
					],
				},
			],
		},
		{
			id: "aufbewahrung",
			heading: "Gesetzliche Aufbewahrungspflichten",
			questions: [
				{
					key: "archiv",
					kind: "choice",
					label:
						"Wo liegen aufbewahrungspflichtige Unterlagen nach Ende ihres Zwecks?",
					gap: "Ablage aufbewahrungspflichtiger Unterlagen",
					options: [
						{
							value: "archiv",
							label: "In einem getrennten Archiv",
							text: "in einem getrennten Archiv, auf das nur wenige berechtigte Personen zugreifen",
						},
						{
							value: "gesperrt",
							label: "Im ursprünglichen System, gesperrt",
							text: "im ursprünglichen System, dort aber für die normale Nutzung gesperrt",
						},
					],
					recommended: "archiv",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Gesetzliche Aufbewahrungspflichten gehen kürzeren Fristen dieses Konzepts vor. Handels- und steuerrechtlich relevante Unterlagen bewahrt {{org}} nach den handels- und steuerrechtlichen Fristen auf, in der Regel bis zu 10 Jahre. Dazu gehören zum Beispiel Bücher, Jahresabschlüsse, Buchungsbelege, Rechnungen und Geschäftsbriefe.",
				},
				{
					kind: "p",
					text: "Weitere Pflichten können sich aus dem Aufsichtsrecht ergeben, etwa aus dem Geldwäschegesetz für Unterlagen zur Prüfung von Kund:innen. Jede Pflicht steht mit Fundstelle und Frist {{a:uebersicht}}.",
				},
				{
					kind: "p",
					text: "Nach Ende ihres Zwecks liegen aufbewahrungspflichtige Unterlagen {{a:archiv}}. Genutzt werden sie dann nur noch, um die Aufbewahrungspflicht zu erfüllen. Nach Ablauf der Pflicht werden sie im nächsten Löschlauf gelöscht.",
				},
			],
		},
		{
			id: "verfahren",
			heading: "Löschverfahren",
			questions: [
				{
					key: "laeufe",
					kind: "choice",
					label: "Wie oft finden die Löschläufe statt?",
					help: "Je seltener gelöscht wird, desto länger liegen fällige Daten noch vor.",
					gap: "Häufigkeit der Löschläufe",
					options: [
						{ value: "monatlich", label: "Monatlich", text: "monatlich" },
						{
							value: "vierteljaehrlich",
							label: "Vierteljährlich",
							text: "vierteljährlich",
						},
						{
							value: "halbjaehrlich",
							label: "Halbjährlich",
							text: "halbjährlich",
						},
						{ value: "jaehrlich", label: "Jährlich", text: "jährlich" },
					],
					recommended: "vierteljaehrlich",
				},
				{
					key: "papier",
					kind: "choice",
					label: "Wie werden Papierunterlagen vernichtet?",
					gap: "Vernichtung von Papier",
					options: [
						{
							value: "intern",
							label: "Mit Aktenvernichtern im Haus",
							text: "mit Aktenvernichtern im Haus",
						},
						{
							value: "entsorger",
							label: "Über einen zertifizierten Entsorger",
							text: "über einen zertifizierten Entsorgungsdienstleister mit verschlossenen Sammelbehältern",
						},
						{
							value: "beides",
							label: "Beides, je nach Menge",
							text: "mit Aktenvernichtern im Haus und bei größeren Mengen über einen zertifizierten Entsorgungsdienstleister",
						},
					],
					recommended: "beides",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Fällige Daten werden in Löschläufen gelöscht, die {{a:laeufe}} stattfinden. Wo möglich, löschen Anwendungen fällige Daten automatisch; sonst löschen die Verantwortlichen der Anwendung von Hand.",
				},
				{
					kind: "p",
					text: "Gelöscht wird so, dass eine Wiederherstellung mit vertretbarem Aufwand nicht möglich ist:",
				},
				{
					kind: "ul",
					items: [
						"in Anwendungen endgültig, einschließlich Papierkörben und Kopien",
						"auf Datenträgern durch sicheres Überschreiben, Löschen der Schlüssel verschlüsselter Daten oder Zerstören",
						"auf Papier durch Vernichtung nach DIN 66399, in einer Sicherheitsstufe passend zur Einstufung der Unterlagen",
					],
				},
				{
					kind: "p",
					text: "Die Vernichtung von Papier erfolgt {{a:papier}}.",
				},
				{
					kind: "p",
					text: "Verlangt eine Person die Löschung ihrer Daten, prüft die zuständige Funktion den Antrag und beantwortet ihn innerhalb eines Monats. Steht eine Aufbewahrungspflicht entgegen, wird die Verarbeitung eingeschränkt und die Person darüber informiert.",
				},
			],
		},
		{
			id: "sicherungen",
			heading: "Datensicherungen",
			questions: [
				{
					key: "backup_frist",
					kind: "number",
					label:
						"Nach wie vielen Tagen werden Datensicherungen spätestens gelöscht oder überschrieben?",
					help: "Langzeitsicherungen, etwa zum Jahresende, stehen als eigene Datenart mit eigener Frist in der Übersicht.",
					gap: "Aufbewahrung der Sicherungen",
					unit: ["Tag", "Tage"],
					min: 7,
					max: 365,
					recommended: 90,
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Datensicherungen werden spätestens {{a:backup_frist}} nach ihrer Erstellung gelöscht oder überschrieben. Langzeitsicherungen sind davon ausgenommen; sie stehen mit ihrer Frist {{a:uebersicht}}.",
				},
				{
					kind: "p",
					text: "Einzelne Daten werden nicht aus Sicherungen gelöscht. Gelöschte Daten bleiben dort bis zum Ablauf der Sicherung, sind aber für die normale Nutzung nicht zugänglich.",
				},
				{
					kind: "p",
					text: "Wird eine Sicherung zurückgespielt, werden bereits gelöschte Daten vor der weiteren Nutzung erneut gelöscht.",
				},
			],
		},
		{
			id: "nachweis",
			heading: "Nachweis und Löschprotokolle",
			questions: [
				{
					key: "protokoll",
					kind: "choice",
					label: "Wie lange werden Löschprotokolle aufbewahrt?",
					help: "Die Protokolle belegen, dass gelöscht wurde; sie enthalten selbst keine gelöschten Inhalte.",
					gap: "Aufbewahrung der Löschprotokolle",
					options: [
						{ value: "drei", label: "3 Jahre", text: "drei Jahre" },
						{ value: "fuenf", label: "5 Jahre", text: "fünf Jahre" },
						{ value: "zehn", label: "10 Jahre", text: "zehn Jahre" },
					],
					recommended: "drei",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Jeder Löschlauf wird protokolliert. Das Protokoll hält fest:",
				},
				{
					kind: "ul",
					items: [
						"Datum, Anwendung oder Ablage und gelöschte Datenart",
						"Anzahl der gelöschten Datensätze oder Unterlagen",
						"ausführende Person oder automatischer Lauf",
						"Fehler und zurückgestellte Löschungen mit Grund",
					],
				},
				{
					kind: "p",
					text: "Löschprotokolle enthalten keine Inhalte der gelöschten Daten. Die Protokolle werden {{a:protokoll}} lang aufbewahrt. Die zuständige Funktion prüft sie stichprobenartig und meldet Abweichungen der Geschäftsleitung.",
				},
			],
		},
		{
			id: "ausnahmen",
			heading: "Ausnahmen und Löschsperren",
			questions: [
				{
					key: "sperre",
					kind: "choice",
					label: "Wer verhängt und beendet eine Löschsperre?",
					help: "Eine Löschsperre hält Daten fest, die für ein Verfahren gebraucht werden, auch wenn ihre Frist abgelaufen ist.",
					gap: "Zuständigkeit für Löschsperren",
					options: [
						{
							value: "gl",
							label: "Die Geschäftsleitung",
							text: "die Geschäftsleitung",
						},
						{
							value: "funktion",
							label:
								"Die zuständige Funktion nach Rücksprache mit der Geschäftsleitung",
							text: "die zuständige Funktion nach Rücksprache mit der Geschäftsleitung",
						},
					],
					recommended: "gl",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Eine Löschsperre stoppt die Löschung, solange Daten für ein Gerichtsverfahren, eine Prüfung, eine Anfrage einer Behörde oder die Aufklärung eines Vorfalls gebraucht werden.",
				},
				{
					kind: "p",
					text: "Löschsperren verhängt und beendet {{a:sperre}}. Jede Sperre wird mit Anlass, betroffenen Daten und Datum dokumentiert und regelmäßig darauf geprüft, ob der Anlass noch besteht.",
				},
				{
					kind: "p",
					text: "Entfällt der Anlass, werden die Daten im nächsten Löschlauf gelöscht, sofern ihre Frist abgelaufen ist. Weitere Ausnahmen von diesem Konzept genehmigt die zuständige Funktion schriftlich, befristet und mit Begründung.",
				},
			],
		},
	],
};
