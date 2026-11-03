import type { PolicyBuilder } from "../types";

// Backup-Konzept (KZ-BACKUP). Inhalte nach ISO 27001 A.8.13 (ISO 27002
// 8.13), BSI CON.3 (Datensicherungskonzept), DORA Art. 12, DSGVO Art. 17
// und 32; vor dem Verkauf fachlich prüfen (CLAUDE.md, Offene Punkte).

export const BACKUP: PolicyBuilder = {
	code: "KZ-BACKUP",
	version: 1,
	sections: [
		{
			id: "zweck",
			heading: "Zweck und Geltungsbereich",
			questions: [
				{
					key: "umfang",
					kind: "choice",
					label: "Was wird gesichert?",
					gap: "Umfang der Sicherung",
					options: [
						{
							value: "alle",
							label: "Alle Server, Datenbanken und Cloud-Daten",
							text: "alle Server, Datenbanken, Dateiablagen und Daten in Cloud-Diensten sowie die Konfigurationen von Netz und Systemen",
						},
						{
							value: "register",
							label: "Was im Asset-Register als sicherungspflichtig steht",
							text: "alle Systeme und Daten, die im Asset-Register als sicherungspflichtig gekennzeichnet sind",
						},
					],
					recommended: "alle",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Dieses Konzept legt fest, welche Daten {{org}} sichert, wie oft, wo und wie lange. Ziel ist, Daten nach Fehlern, Ausfällen oder Angriffen vollständig und rechtzeitig wiederherzustellen.",
				},
				{ kind: "p", text: "Gesichert werden {{a:umfang}}." },
				{
					kind: "p",
					text: "Daten in Cloud-Diensten wie Mail oder Dateiablagen sichert {{org}} selbst, außer der Anbieter übernimmt das nachweislich und vertraglich.",
				},
				{
					kind: "p",
					text: "Endgeräte werden nicht einzeln gesichert; Arbeitsdaten liegen in den zentralen Ablagen.",
				},
			],
		},
		{
			id: "sicherung",
			heading: "Häufigkeit",
			questions: [
				{
					key: "haeufigkeit",
					kind: "choice",
					label: "Wie oft laufen die Sicherungen?",
					help: "Richte dich nach dem Datenverlust, den ein Prozess höchstens verkraftet. Bei Buchungen oder Zahlungen sind das oft nur Minuten.",
					gap: "Häufigkeit",
					options: [
						{ value: "taeglich", label: "Täglich", text: "täglich" },
						{
							value: "mehrmals",
							label: "Täglich, Datenbanken mehrmals am Tag",
							text: "täglich, Datenbanken mit wichtigen Geschäftsdaten zusätzlich mehrmals am Tag",
						},
						{
							value: "woechentlich",
							label: "Wöchentlich",
							text: "wöchentlich",
						},
					],
					recommended: "taeglich",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Die Sicherungen laufen automatisch und {{a:haeufigkeit}}.",
				},
				{
					kind: "p",
					text: "Der Abstand richtet sich nach dem tolerierbaren Datenverlust (Recovery Point Objective, RPO) aus der Business-Impact-Analyse. Verlangt ein Prozess einen kürzeren Abstand, gilt dieser.",
				},
				{
					kind: "p",
					text: "Gesichert wird so, dass ein in sich stimmiger Stand entsteht, etwa mit den Sicherungsfunktionen der Datenbank statt durch Kopieren laufender Dateien.",
				},
			],
		},
		{
			id: "schutz",
			heading: "Verschlüsselung und Standorte",
			questions: [
				{
					key: "kopie",
					kind: "choice",
					label: "Wo und wie wird die zweite Kopie der Sicherungen aufbewahrt?",
					help: "Unveränderbar heißt: Auch mit Admin-Rechten lässt sich die Sicherung bis zum Ablauf der Frist weder ändern noch löschen. Das schützt vor Erpressungssoftware.",
					gap: "getrennte Kopie",
					options: [
						{
							value: "getrennt_fest",
							label: "An einem anderen Ort und unveränderbar",
							text: "an einem räumlich getrennten Standort und unveränderbar (zum Beispiel mit Object Lock oder auf einem Offline-Medium)",
						},
						{
							value: "getrennt",
							label: "An einem anderen Ort",
							text: "an einem räumlich getrennten Standort",
						},
					],
					recommended: "getrennt_fest",
				},
				{
					key: "standort",
					kind: "text",
					label: "Wo liegt die Kopie am getrennten Standort?",
					help: "Nenne Ort und, falls vorhanden, den Dienstleister.",
					gap: "Standort der Kopie",
					example: "im Rechenzentrum der Beispiel Hosting GmbH in Nürnberg",
				},
				{
					key: "verschluesselung",
					kind: "choice",
					label: "Welche Sicherungen werden verschlüsselt?",
					gap: "Verschlüsselung",
					options: [
						{
							value: "alle",
							label: "Alle Sicherungen",
							text: "alle Sicherungen",
						},
						{
							value: "extern",
							label: "Nur Sicherungen außer Haus",
							text: "alle Sicherungen, die die eigenen Räume verlassen oder bei einem Dienstleister liegen",
						},
					],
					recommended: "alle",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Die Sicherungen folgen der 3-2-1-Regel: drei Kopien der Daten auf zwei verschiedenen Speicherarten, davon eine an einem anderen Ort.",
				},
				{
					kind: "p",
					text: "Mindestens eine Kopie jeder Sicherung wird {{a:kopie}} aufbewahrt. Die getrennte Kopie liegt {{a:standort}}.",
				},
				{
					kind: "p",
					text: "Der getrennte Standort ist so gewählt, dass ein Ereignis am Hauptstandort, etwa Brand, Hochwasser oder Stromausfall, ihn nicht zugleich trifft.",
				},
				{
					kind: "p",
					text: "Verschlüsselt werden {{a:verschluesselung}}. Es gilt ein anerkanntes Verfahren nach dem Kryptokonzept, etwa AES mit 256 Bit.",
				},
				{
					kind: "p",
					text: "Die Schlüssel liegen getrennt von den Sicherungen und sind auch dann verfügbar, wenn die Hauptsysteme ausgefallen sind.",
				},
				{
					kind: "p",
					text: "Die Sicherungsumgebung hat eigene Zugangsdaten mit MFA. Konten der normalen Verwaltung können Sicherungen weder ändern noch löschen.",
				},
			],
		},
		{
			id: "aufbewahrung",
			heading: "Aufbewahrung",
			questions: [
				{
					key: "aufbewahrung_tage",
					kind: "number",
					label: "Wie viele Tage wird jede Sicherung mindestens aufbewahrt?",
					help: "Die Frist sollte länger sein als die Zeit, in der ein Befall unbemerkt bleiben kann. Üblich sind 30 Tage oder mehr.",
					gap: "Aufbewahrungsdauer",
					unit: ["Tag", "Tage"],
					min: 7,
					max: 365,
					recommended: 30,
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Jede Sicherung wird mindestens {{a:aufbewahrung_tage}} aufbewahrt. So lässt sich auch nach einem unbemerkten Befall durch Schadsoftware ein sauberer Stand zurückholen.",
				},
				{
					kind: "p",
					text: "Längere Aufbewahrung einzelner Stände legt die verantwortliche Stelle des Systems fest, wenn ein Geschäftsprozess sie verlangt.",
				},
				{
					kind: "p",
					text: "Gesetzliche Aufbewahrungspflichten, etwa nach HGB und AO, erfüllt die Archivierung, nicht die Datensicherung.",
				},
				{
					kind: "p",
					text: "Gelöschte personenbezogene Daten verschwinden spätestens mit dem Ablauf der Aufbewahrung aus den Sicherungen. Wird ein älterer Stand zurückgespielt, werden Löschungen seit dem Sicherungszeitpunkt erneut ausgeführt.",
				},
			],
		},
		{
			id: "tests",
			heading: "Wiederherstellung und Tests",
			questions: [
				{
					key: "restore_monate",
					kind: "number",
					label:
						"In welchem Abstand wird die Wiederherstellung kritischer Systeme getestet?",
					help: "Kritisch sind Systeme, deren Ausfall wichtige Geschäftsprozesse stoppt. Mindestens einmal im Jahr, besser halbjährlich.",
					gap: "Testabstand",
					unit: ["Monat", "Monate"],
					min: 1,
					max: 12,
					recommended: 6,
				},
				{
					key: "test_art",
					kind: "choice",
					label: "Wie wird getestet?",
					gap: "Art des Tests",
					options: [
						{
							value: "voll",
							label: "Ganzes System in einer Testumgebung",
							text: "das vollständige System in einer getrennten Testumgebung wiederhergestellt und seine Funktion geprüft",
						},
						{
							value: "stichprobe",
							label: "Stichproben von Dateien und Datenbanken",
							text: "eine Stichprobe von Dateien und Datenbanken wiederhergestellt und auf Vollständigkeit geprüft",
						},
					],
					recommended: "voll",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Für kritische Systeme beträgt der Abstand zwischen zwei Wiederherstellungstests höchstens {{a:restore_monate}}, für alle übrigen Systeme höchstens 12 Monate.",
				},
				{ kind: "p", text: "Beim Test wird {{a:test_art}}." },
				{
					kind: "p",
					text: "Jeder Test wird protokolliert: System, Datum, Stand der Sicherung, Dauer der Wiederherstellung, Ergebnis und Mängel.",
				},
				{
					kind: "p",
					text: "Die gemessene Dauer wird mit der zulässigen Ausfallzeit (Recovery Time Objective, RTO) verglichen. Mängel werden als Abweichung erfasst und behoben.",
				},
			],
		},
		{
			id: "betrieb",
			heading: "Verantwortung und Überwachung",
			questions: [
				{
					key: "verantwortlich",
					kind: "function",
					label: "Welche Funktion verantwortet die Datensicherung?",
					help: "Diese Funktion pflegt das Konzept, überwacht die Sicherungen und plant die Tests.",
					gap: "verantwortliche Funktion",
					suggest: "bcm_manager",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "{{a:verantwortlich}} verantwortet dieses Konzept, überwacht die Sicherungen und plant die Wiederherstellungstests.",
				},
				{
					kind: "p",
					text: "Jede Sicherung wird automatisch überwacht. Eine fehlgeschlagene Sicherung meldet sich sofort beim IT-Betrieb und wird spätestens am nächsten Arbeitstag nachgeholt.",
				},
				{
					kind: "p",
					text: "{{a:verantwortlich}} meldet wiederholte Fehler und gescheiterte Tests der Geschäftsleitung.",
				},
				{
					kind: "p",
					text: "Das Konzept wird mindestens jährlich und nach wesentlichen Änderungen an den Systemen überprüft.",
				},
			],
		},
	],
};
