import type { PolicyBuilder } from "../types";

// Protokollierungs- und Überwachungskonzept (RL-LOGGING). Inhalte nach
// ISO 27001 A.8.15, A.8.16 und A.8.17, BSI OPS.1.1.5 und DER.1, DORA
// Art. 10, NIS2 Art. 21 Abs. 2 b, DSGVO Art. 5 Abs. 1 c und Art. 25,
// § 87 Abs. 1 Nr. 6 BetrVG; vor dem Verkauf fachlich prüfen (CLAUDE.md,
// Offene Punkte).

export const LOGGING: PolicyBuilder = {
	code: "RL-LOGGING",
	version: 1,
	sections: [
		{
			id: "zweck",
			heading: "Zweck und Geltungsbereich",
			questions: [
				{
					key: "quellen",
					kind: "choice",
					label: "Welche Systeme protokollieren nach diesem Konzept?",
					gap: "erfasste Systeme",
					options: [
						{
							value: "alle",
							label: "Alle Systeme",
							text: "alle Server, Anwendungen, Cloud-Dienste, Netz- und Sicherheitskomponenten sowie die zentralen Verzeichnisdienste wie Active Directory oder Entra ID",
						},
						{
							value: "kritisch",
							label: "Kritische und von außen erreichbare Systeme",
							text: "alle Systeme mit hohem Schutzbedarf, alle aus dem Internet erreichbaren Systeme sowie Netz- und Sicherheitskomponenten",
						},
					],
					recommended: "alle",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Dieses Konzept legt fest, was {{org}} protokolliert, wie lange Protokolle aufbewahrt und wie sie geschützt werden. Es regelt außerdem, wer sie auswertet und wann ein Alarm ausgelöst wird.",
				},
				{ kind: "p", text: "Erfasst sind: {{a:quellen}}." },
				{
					kind: "p",
					text: "Ziel ist, Angriffe und Fehler früh zu erkennen und Sicherheitsvorfälle vollständig nachvollziehen zu können.",
				},
			],
		},
		{
			id: "ereignisse",
			heading: "Ereignisse",
			questions: [
				{
					key: "zentral",
					kind: "choice",
					label: "Wo werden die Protokolle gesammelt?",
					help: "Ein SIEM sammelt Protokolle aus vielen Systemen, wertet sie aus und löst Alarme aus.",
					gap: "zentrale Sammlung",
					options: [
						{
							value: "siem",
							label: "In einem SIEM",
							text: "in einem zentralen System zur Auswertung von Sicherheitsereignissen (SIEM)",
						},
						{
							value: "logserver",
							label: "Auf einem zentralen Log-Server",
							text: "auf einem zentralen Log-Server",
						},
						{
							value: "soc",
							label: "Bei einem Dienstleister (SOC)",
							text: "bei einem beauftragten Dienstleister für Sicherheitsüberwachung (Security Operations Center, SOC)",
						},
					],
					recommended: "siem",
				},
				{
					key: "zeit",
					kind: "choice",
					label: "Woher beziehen die Systeme ihre Uhrzeit?",
					help: "Nur mit gleicher Uhrzeit lassen sich Ereignisse aus verschiedenen Systemen in die richtige Reihenfolge bringen.",
					gap: "Zeitquelle",
					options: [
						{
							value: "intern",
							label: "Von einem eigenen Zeitserver",
							text: "über einen internen Zeitserver, der seine Zeit von mindestens zwei vertrauenswürdigen Quellen bezieht",
						},
						{
							value: "extern",
							label: "Von öffentlichen Zeitservern",
							text: "über vertrauenswürdige öffentliche Zeitserver, etwa die der Physikalisch-Technischen Bundesanstalt (PTB)",
						},
					],
					recommended: "intern",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Protokolliert werden mindestens diese Ereignisse:",
				},
				{
					kind: "ul",
					items: [
						"erfolgreiche und fehlgeschlagene Anmeldungen sowie Abmeldungen",
						"Anlegen, Ändern und Löschen von Konten und Rechten",
						"Tätigkeiten mit privilegierten Konten",
						"Zugriffe auf vertrauliche Daten und deren Export",
						"Änderungen an Konfigurationen und Sicherheitseinstellungen",
						"Start, Stopp und Fehler von Diensten, auch der Protokollierung selbst",
						"Meldungen von Virenschutz, Firewall und Angriffserkennung",
					],
				},
				{
					kind: "p",
					text: "Jeder Eintrag enthält Zeitpunkt, handelnde Person oder handelndes System, Herkunft (etwa die IP-Adresse), Aktion und Ergebnis.",
				},
				{
					kind: "p",
					text: "Die Protokolle werden zeitnah {{a:zentral}} gesammelt.",
				},
				{
					kind: "p",
					text: "Alle Systeme synchronisieren ihre Uhrzeit automatisch {{a:zeit}}. Zeitstempel enthalten die Zeitzone, damit sich Ereignisse verschiedener Systeme zuordnen lassen.",
				},
			],
		},
		{
			id: "aufbewahrung",
			heading: "Aufbewahrung und Schutz",
			questions: [
				{
					key: "aufbewahrung_sicherheit",
					kind: "number",
					label: "Wie viele Monate werden Sicherheitsprotokolle aufbewahrt?",
					help: "Sicherheitsprotokolle sind Anmeldungen, Rechteänderungen, Admin-Tätigkeiten und Alarme. Angriffe fallen oft erst nach Monaten auf; üblich sind mindestens 6, besser 12 Monate.",
					gap: "Aufbewahrung der Sicherheitsprotokolle",
					unit: ["Monat", "Monate"],
					min: 3,
					max: 120,
					recommended: 12,
				},
				{
					key: "aufbewahrung_betrieb",
					kind: "number",
					label:
						"Wie viele Tage werden sonstige Betriebsprotokolle aufbewahrt?",
					help: "Betriebsprotokolle dienen vor allem der Fehlersuche. Eine kurze Frist vermeidet unnötige personenbezogene Daten.",
					gap: "Aufbewahrung der Betriebsprotokolle",
					unit: ["Tag", "Tage"],
					min: 7,
					max: 365,
					recommended: 30,
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Sicherheitsprotokolle werden {{a:aufbewahrung_sicherheit}} aufbewahrt, sonstige Betriebsprotokolle {{a:aufbewahrung_betrieb}}. Danach werden sie automatisch gelöscht.",
				},
				{
					kind: "p",
					text: "Protokolle zu einem laufenden Sicherheitsvorfall oder Verfahren bleiben bis zu dessen Abschluss erhalten.",
				},
				{
					kind: "p",
					text: "Protokolle sind vor Veränderung und unbefugtem Zugriff geschützt:",
				},
				{
					kind: "ul",
					items: [
						"Die Übertragung an die zentrale Sammlung ist verschlüsselt.",
						"Nur ein kleiner, benannter Personenkreis darf Protokolle lesen; niemand darf sie ändern.",
						"Wer ein System verwaltet, kann dessen Protokolle in der zentralen Sammlung weder ändern noch löschen.",
						"Speicher mit Schreibschutz oder eine Kette aus Prüfsummen machen Veränderungen erkennbar.",
						"Zugriffe auf die Protokolle werden selbst protokolliert.",
						"Fällt die Protokollierung aus oder läuft der Speicher voll, löst das einen Alarm aus.",
					],
				},
			],
		},
		{
			id: "datenschutz",
			heading: "Datenschutz und Datensparsamkeit",
			questions: [
				{
					key: "pseudo",
					kind: "choice",
					label:
						"Werden personenbezogene Daten in Protokollen gekürzt oder pseudonymisiert?",
					help: "Pseudonymisiert heißt: Statt eines Namens oder einer IP-Adresse steht ein Kürzel, das nur ein enger Kreis zuordnen kann.",
					gap: "Umgang mit Personenbezug",
					options: [
						{
							value: "pseudo",
							label: "Ja, wo die Auswertung das zulässt",
							text: "werden gekürzt oder pseudonymisiert, soweit die Auswertung das zulässt",
						},
						{
							value: "voll",
							label: "Nein, sie bleiben vollständig",
							text: "bleiben vollständig erhalten, weil die Auswertung von Sicherheitsvorfällen sie braucht; der Lesezugriff ist dafür besonders eng begrenzt",
						},
					],
					recommended: "pseudo",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Protokolle enthalten nur Daten, die für Sicherheit und Betrieb nötig sind. Nie protokolliert werden:",
				},
				{
					kind: "ul",
					items: [
						"Passwörter, Einmalcodes, Schlüssel und Zugangstoken",
						"Sitzungskennungen und Cookies",
						"vollständige Kartennummern und Bankverbindungen",
						"Inhalte von Nachrichten und Dokumenten",
						"besondere Kategorien personenbezogener Daten, etwa Gesundheitsdaten",
					],
				},
				{
					kind: "p",
					text: "Personenbezogene Daten in Protokollen {{a:pseudo}}.",
				},
				{
					kind: "p",
					text: "Die Auswertung dient der Sicherheit und dem Betrieb, nicht der Leistungs- oder Verhaltenskontrolle von Beschäftigten.",
				},
				{
					kind: "p",
					text: "Beschäftigte werden über Art, Zweck und Dauer der Protokollierung informiert. Besteht ein Betriebsrat, wird die Protokollierung vor der Einführung mit ihm vereinbart.",
				},
				{
					kind: "p",
					text: "Die oder der Datenschutzbeauftragte wird vor Änderungen an diesem Konzept beteiligt.",
				},
			],
		},
		{
			id: "alarme",
			heading: "Alarme",
			questions: [
				{
					key: "alarm_ziel",
					kind: "text",
					label: "Wohin gehen Alarme?",
					help: "Eine Stelle, die auch außerhalb der Geschäftszeiten erreichbar ist.",
					gap: "Empfänger der Alarme",
					example:
						"an die Rufbereitschaft der IT unter 030 1234567 und an security@example.com",
				},
				{
					key: "alarm_reaktion",
					kind: "choice",
					label: "Wie schnell wird ein kritischer Alarm bearbeitet?",
					gap: "Reaktionszeit",
					options: [
						{
							value: "immer",
							label: "Rund um die Uhr innerhalb einer Stunde",
							text: "rund um die Uhr innerhalb einer Stunde",
						},
						{
							value: "geschaeftszeiten",
							label: "In den Geschäftszeiten, sonst Rufbereitschaft",
							text: "während der Geschäftszeiten innerhalb einer Stunde, außerhalb davon über die Rufbereitschaft",
						},
					],
					recommended: "geschaeftszeiten",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Ein Alarm wird automatisch ausgelöst, unter anderem bei:",
				},
				{
					kind: "ul",
					items: [
						"vielen fehlgeschlagenen Anmeldungen an einem Konto oder aus einer Quelle",
						"der Anmeldung eines privilegierten Kontos zu ungewöhnlicher Zeit oder von einem neuen Ort",
						"Änderungen an Administratorgruppen und Sicherheitseinstellungen",
						"ungewöhnlich großen Datenabflüssen oder Exporten",
						"Meldungen von Virenschutz und Angriffserkennung",
						"einem Ausfall der Protokollierung",
					],
				},
				{
					kind: "p",
					text: "Alarme gehen automatisch {{a:alarm_ziel}}. Kritische Alarme werden {{a:alarm_reaktion}} bearbeitet.",
				},
				{
					kind: "p",
					text: "Jeder Alarm wird bewertet und mit Ergebnis dokumentiert. Bestätigt sich ein Sicherheitsvorfall, gilt die Vorfallrichtlinie.",
				},
			],
		},
		{
			id: "auswertung",
			heading: "Auswertung",
			questions: [
				{
					key: "pruefer",
					kind: "function",
					label: "Welche Funktion wertet die Protokolle aus?",
					help: "Wer ein System verwaltet, sollte dessen Protokolle nicht allein auswerten.",
					gap: "auswertende Funktion",
					suggest: "isb_ciso",
				},
				{
					key: "auswertung_takt",
					kind: "choice",
					label: "Wie oft werden die Protokolle auch ohne Alarm durchgesehen?",
					gap: "Rhythmus der Durchsicht",
					options: [
						{ value: "tag", label: "Täglich", text: "täglich" },
						{ value: "woche", label: "Wöchentlich", text: "wöchentlich" },
						{ value: "monat", label: "Monatlich", text: "monatlich" },
					],
					recommended: "woche",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "{{a:pruefer}} sieht die Protokolle {{a:auswertung_takt}} durch, auch wenn kein Alarm vorliegt. Auffälligkeiten und Ergebnisse werden dokumentiert.",
				},
				{
					kind: "p",
					text: "Wer ein System verwaltet, wertet dessen Protokolle nicht allein aus.",
				},
				{
					kind: "p",
					text: "Die Regeln für Alarme werden mindestens jährlich und nach jedem Sicherheitsvorfall überprüft und angepasst.",
				},
				{
					kind: "p",
					text: "{{a:pruefer}} berichtet der Geschäftsleitung in den regelmäßigen Sicherheitsberichten über Alarme, Auffälligkeiten und den Zustand der Protokollierung.",
				},
			],
		},
	],
};
