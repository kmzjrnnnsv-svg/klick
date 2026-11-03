import type { PolicyBuilder } from "../types";

// Schwachstellen- und Patchmanagement (RL-PATCH). Inhalte nach ISO 27001
// A.8.8, A.8.19 und A.8.32, BSI OPS.1.1.3, DORA Art. 9 Abs. 4 f, NIS2
// Art. 21 Abs. 2 e; Fristen nach üblicher Praxis (CVSS-Stufen, CISA-Katalog
// aktiv ausgenutzter Schwachstellen als Anhalt); vor dem Verkauf fachlich
// prüfen (CLAUDE.md, Offene Punkte).

export const PATCH: PolicyBuilder = {
	code: "RL-PATCH",
	version: 1,
	sections: [
		{
			id: "zweck",
			heading: "Zweck und Geltungsbereich",
			questions: [
				{
					key: "umfang",
					kind: "choice",
					label: "Was deckt die Richtlinie ab?",
					help: "Entwickelt deine Organisation eigene Software, gehören auch deren Bibliotheken und Abhängigkeiten dazu.",
					gap: "Umfang",
					options: [
						{
							value: "it",
							label: "IT-Systeme und Anwendungen",
							text: "Betriebssysteme, Anwendungen, Netzkomponenten, Endgeräte und Cloud-Dienste, soweit {{org}} sie selbst verwaltet",
						},
						{
							value: "it_dev",
							label: "Zusätzlich selbst entwickelte Software",
							text: "Betriebssysteme, Anwendungen, Netzkomponenten, Endgeräte und Cloud-Dienste, soweit {{org}} sie selbst verwaltet, sowie selbst entwickelte Software und ihre Abhängigkeiten",
						},
					],
					recommended: "it",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Diese Richtlinie regelt, wie {{org}} Schwachstellen erkennt, bewertet und in festen Fristen behebt. Ziel ist, bekannte Lücken zu schließen, bevor Angreifer sie ausnutzen.",
				},
				{ kind: "p", text: "Erfasst sind: {{a:umfang}}." },
				{
					kind: "p",
					text: "Bei Cloud-Diensten, die ein Anbieter betreibt, prüft {{org}} anhand von Vertrag und Nachweisen, dass der Anbieter vergleichbare Fristen einhält.",
				},
			],
		},
		{
			id: "quellen",
			heading: "Quellen und Scans",
			questions: [
				{
					key: "verantwortlich",
					kind: "function",
					label:
						"Welche Funktion steuert das Schwachstellen- und Patchmanagement?",
					help: "Diese Funktion bewertet Meldungen und überwacht die Fristen. Das Einspielen übernimmt meist der IT-Betrieb.",
					gap: "steuernde Funktion",
					suggest: "isb_ciso",
				},
				{
					key: "scan_takt",
					kind: "choice",
					label:
						"Wie oft werden die Systeme automatisch auf Schwachstellen gescannt?",
					gap: "Scan-Rhythmus",
					options: [
						{ value: "woche", label: "Wöchentlich", text: "wöchentlich" },
						{ value: "monat", label: "Monatlich", text: "monatlich" },
						{
							value: "quartal",
							label: "Vierteljährlich",
							text: "vierteljährlich",
						},
					],
					recommended: "woche",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "{{a:verantwortlich}} steuert das Schwachstellen- und Patchmanagement. Der IT-Betrieb spielt Patches ein; die Verantwortlichen der Systeme stimmen Wartungsfenster ab.",
				},
				{
					kind: "p",
					text: "Grundlage ist das Asset-Register, denn nur dort erfasste Systeme werden vollständig geprüft. Hinweise auf Schwachstellen kommen aus diesen Quellen:",
				},
				{
					kind: "ul",
					items: [
						"Sicherheitshinweise der Hersteller und Dienstleister",
						"Warnmeldungen des BSI (CERT-Bund)",
						"Kataloge aktiv ausgenutzter Schwachstellen, etwa „Known Exploited Vulnerabilities“ der US-Behörde CISA",
						"automatische Schwachstellenscans und Penetrationstests",
						"Hinweise von außen, etwa über eine Sicherheitsadresse oder die Datei „security.txt“",
					],
				},
				{
					kind: "p",
					text: "Alle Systeme im Geltungsbereich werden {{a:scan_takt}} automatisch auf bekannte Schwachstellen gescannt. Aus dem Internet erreichbare Systeme werden zusätzlich nach jeder wesentlichen Änderung gescannt.",
				},
				{
					kind: "p",
					when: { key: "umfang", is: ["it_dev"] },
					text: "Abhängigkeiten selbst entwickelter Software werden bei jedem Build automatisch auf bekannte Schwachstellen geprüft und in einer Stückliste (SBOM) dokumentiert.",
				},
			],
		},
		{
			id: "fristen",
			heading: "Bewertung und Fristen",
			questions: [
				{
					key: "frist_kritisch",
					kind: "number",
					label:
						"Wie viele Tage dürfen bis zur Behebung einer kritischen Schwachstelle höchstens vergehen?",
					help: "Kritisch heißt: CVSS-Wert ab 9,0. Üblich sind höchstens 14 Tage; für aktiv ausgenutzte Lücken gilt die Notfall-Frist.",
					gap: "Frist für kritische Schwachstellen",
					unit: ["Tag", "Tage"],
					min: 1,
					max: 30,
					recommended: 14,
				},
				{
					key: "frist_hoch",
					kind: "number",
					label:
						"Wie viele Tage dürfen bei einer hohen Schwachstelle höchstens vergehen?",
					help: "Hoch heißt: CVSS-Wert von 7,0 bis 8,9.",
					gap: "Frist für hohe Schwachstellen",
					unit: ["Tag", "Tage"],
					min: 1,
					max: 90,
					recommended: 30,
				},
				{
					key: "frist_mittel",
					kind: "number",
					label:
						"Wie viele Tage dürfen bei einer mittleren Schwachstelle höchstens vergehen?",
					help: "Mittel heißt: CVSS-Wert von 4,0 bis 6,9.",
					gap: "Frist für mittlere Schwachstellen",
					unit: ["Tag", "Tage"],
					min: 1,
					max: 180,
					recommended: 90,
				},
			],
			blocks: [
				{
					kind: "p",
					text: "{{a:verantwortlich}} stuft jede Schwachstelle nach ihrem CVSS-Wert ein, einer Skala von 0 bis 10 für die Schwere. Die Stufe steigt, wenn die Lücke bereits ausgenutzt wird oder das System aus dem Internet erreichbar ist.",
				},
				{ kind: "p", text: "Für die Behebung gelten diese Fristen:" },
				{
					kind: "ul",
					items: [
						"Kritisch (CVSS ab 9,0): höchstens {{a:frist_kritisch}}",
						"Hoch (CVSS 7,0 bis 8,9): höchstens {{a:frist_hoch}}",
						"Mittel (CVSS 4,0 bis 6,9): höchstens {{a:frist_mittel}}",
						"Niedrig (CVSS unter 4,0): mit der nächsten regulären Wartung",
					],
				},
				{
					kind: "p",
					text: "Die Frist beginnt, sobald die Schwachstelle bekannt und ein Patch oder eine wirksame Abhilfe verfügbar ist. Ist noch kein Patch verfügbar, setzt der IT-Betrieb eine Abhilfe um, etwa eine geänderte Konfiguration oder eine Abschottung.",
				},
				{
					kind: "p",
					text: "Patches werden vor dem Einspielen getestet, soweit die Frist das zulässt, zum Beispiel an einer kleinen Gruppe von Systemen. Das Einspielen folgt dem Änderungsmanagement.",
				},
				{
					kind: "p",
					text: "Nach dem Einspielen bestätigt ein erneuter Scan, dass die Schwachstelle behoben ist.",
				},
			],
		},
		{
			id: "notfall",
			heading: "Notfall-Patches",
			questions: [
				{
					key: "notfall_frist",
					kind: "choice",
					label:
						"Wie schnell wird eine aktiv ausgenutzte Schwachstelle an einem System im Internet behoben?",
					gap: "Notfall-Frist",
					options: [
						{
							value: "24h",
							label: "Innerhalb von 24 Stunden",
							text: "innerhalb von 24 Stunden",
						},
						{
							value: "48h",
							label: "Innerhalb von 48 Stunden",
							text: "innerhalb von 48 Stunden",
						},
						{
							value: "72h",
							label: "Innerhalb von 72 Stunden",
							text: "innerhalb von 72 Stunden",
						},
					],
					recommended: "48h",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Wird eine kritische Schwachstelle bereits aktiv ausgenutzt und ist das System aus dem Internet erreichbar, gilt ein Notfall. Die Lücke wird dann {{a:notfall_frist}} behoben oder das System abgeschottet.",
				},
				{
					kind: "p",
					text: "{{a:verantwortlich}} gibt Notfall-Patches gemeinsam mit der verantwortlichen Stelle des Systems frei. Das reguläre Änderungsverfahren darf dabei abgekürzt werden; die Dokumentation wird spätestens am nächsten Arbeitstag nachgeholt.",
				},
				{
					kind: "p",
					text: "Lässt sich die Lücke nicht rechtzeitig schließen, wird der betroffene Dienst abgeschaltet oder vom Netz getrennt, bis die Abhilfe wirkt. Ob ein Sicherheitsvorfall vorliegt, wird nach der Vorfallrichtlinie geprüft.",
				},
			],
		},
		{
			id: "ausnahmen",
			heading: "Ausnahmen",
			questions: [
				{
					key: "ausnahme_freigabe",
					kind: "choice",
					label: "Wer genehmigt eine Ausnahme von den Fristen?",
					gap: "Genehmigung von Ausnahmen",
					options: [
						{
							value: "gestuft",
							label: "Je nach Stufe",
							text: "bei kritischen und hohen Schwachstellen die Geschäftsleitung, sonst die Funktion, die das Patchmanagement steuert",
						},
						{
							value: "gl",
							label: "Immer die Geschäftsleitung",
							text: "die Geschäftsleitung",
						},
					],
					recommended: "gestuft",
				},
				{
					key: "ausnahme_dauer",
					kind: "number",
					label: "Wie lange darf eine Ausnahme höchstens gelten?",
					gap: "Höchstdauer einer Ausnahme",
					unit: ["Monat", "Monate"],
					min: 1,
					max: 12,
					recommended: 6,
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Lässt sich eine Frist nicht einhalten, beantragt die verantwortliche Stelle des Systems eine Ausnahme. Der Antrag nennt Grund, Risiko, Ersatzmaßnahmen und den geplanten Termin der Behebung.",
				},
				{
					kind: "p",
					text: "Eine Ausnahme genehmigt {{a:ausnahme_freigabe}}. Die Ausnahme ist auf höchstens {{a:ausnahme_dauer}} befristet und steht im Ausnahmeregister.",
				},
				{
					kind: "p",
					text: "Systeme ohne Sicherheitsupdates des Herstellers werden ersetzt oder vom übrigen Netz abgeschottet. Bis dahin gilt für sie eine befristete Ausnahme mit einem Plan für die Ablösung.",
				},
			],
		},
		{
			id: "berichte",
			heading: "Berichterstattung",
			questions: [
				{
					key: "bericht_takt",
					kind: "choice",
					label: "Wie oft erhält die Geschäftsleitung einen Bericht?",
					gap: "Berichtsrhythmus",
					options: [
						{ value: "monat", label: "Monatlich", text: "monatlich" },
						{
							value: "quartal",
							label: "Vierteljährlich",
							text: "vierteljährlich",
						},
						{ value: "halbjahr", label: "Halbjährlich", text: "halbjährlich" },
					],
					recommended: "quartal",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "{{a:verantwortlich}} berichtet der Geschäftsleitung {{a:bericht_takt}}. Der Bericht enthält mindestens:",
				},
				{
					kind: "ul",
					items: [
						"die Anzahl offener Schwachstellen je Stufe",
						"den Anteil fristgerecht behobener Schwachstellen",
						"überschrittene Fristen mit Grund",
						"laufende Ausnahmen mit ihrem Ablaufdatum",
					],
				},
				{
					kind: "p",
					text: "Überschrittene Fristen bei kritischen Schwachstellen und jeder Notfall werden der Geschäftsleitung sofort gemeldet.",
				},
			],
		},
	],
};
