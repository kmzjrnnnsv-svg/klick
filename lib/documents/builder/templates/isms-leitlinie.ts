import type { PolicyBuilder } from "../types";

// Informationssicherheitsleitlinie (RL-ISMS-LEITLINIE). Inhalte nach
// ISO 27001 5.1/5.2/5.3/6.2 und A.5.1/A.5.2/A.5.4/A.6.4, ISO 27002 5.1,
// BSI-Standard 200-2 (Leitlinie, Sicherheitsorganisation), DORA Art. 5/6,
// NIS2 Art. 20/21 Abs. 2 a; vor dem Verkauf fachlich prüfen (CLAUDE.md,
// Offene Punkte).

export const ISMS_LEITLINIE: PolicyBuilder = {
	code: "RL-ISMS-LEITLINIE",
	version: 1,
	sections: [
		{
			id: "zweck",
			heading: "Zweck und Geltungsbereich",
			questions: [
				{
					key: "geltung",
					kind: "choice",
					label: "Für welchen Bereich gilt die Leitlinie?",
					help: "Gilt dein ISMS nur für einen Teil des Unternehmens, wähle den festgelegten Geltungsbereich.",
					gap: "Geltungsbereich",
					options: [
						{
							value: "alle",
							label: "Für die ganze Organisation",
							text: "für alle Standorte, Bereiche, Systeme und Beschäftigten von {{org}}",
						},
						{
							value: "scope",
							label: "Für den festgelegten ISMS-Geltungsbereich",
							text: "für die Standorte, Bereiche und Systeme im festgelegten Geltungsbereich des ISMS von {{org}}",
						},
					],
					recommended: "alle",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Diese Leitlinie legt Ziele, Grundsätze und Verantwortung für die Informationssicherheit bei {{org}} fest. Die Geschäftsleitung hat sie beschlossen und setzt sich für ihre Umsetzung ein.",
				},
				{
					kind: "p",
					text: "Die Leitlinie gilt {{a:geltung}}. Externe Mitarbeitende und Dienstleister verpflichtet {{org}} vertraglich auf die Leitlinie, soweit sie mit Informationen von {{org}} arbeiten.",
				},
			],
		},
		{
			id: "ziele",
			heading: "Sicherheitsziele",
			questions: [
				{
					key: "schutzziele",
					kind: "choice",
					label: "Welches Schutzziel hat bei Zielkonflikten Vorrang?",
					help: "Banken und Zahlungsdienste stellen oft die Vertraulichkeit voran, Plattformbetreiber die Verfügbarkeit. Ohne klaren Schwerpunkt wähle „Alle gleichrangig“.",
					gap: "Gewichtung der Schutzziele",
					options: [
						{
							value: "gleich",
							label: "Alle gleichrangig",
							text: "Vertraulichkeit, Integrität und Verfügbarkeit gleichrangig",
						},
						{
							value: "vertraulichkeit",
							label: "Vertraulichkeit",
							text: "die Vertraulichkeit vorrangig, danach Integrität und Verfügbarkeit",
						},
						{
							value: "integritaet",
							label: "Integrität",
							text: "die Integrität vorrangig, danach Vertraulichkeit und Verfügbarkeit",
						},
						{
							value: "verfuegbarkeit",
							label: "Verfügbarkeit",
							text: "die Verfügbarkeit vorrangig, danach Integrität und Vertraulichkeit",
						},
					],
					recommended: "gleich",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "{{org}} schützt Informationen und die Systeme, die sie verarbeiten, nach drei Schutzzielen:",
				},
				{
					kind: "ul",
					items: [
						"Vertraulichkeit: Informationen sind nur Berechtigten zugänglich.",
						"Integrität: Informationen und Systeme sind vollständig, richtig und nicht unbefugt verändert.",
						"Verfügbarkeit: Informationen und Systeme stehen bereit, wenn sie gebraucht werden.",
					],
				},
				{
					kind: "p",
					text: "Bei der Bewertung von Risiken und bei Zielkonflikten gewichtet {{org}} {{a:schutzziele}}.",
				},
				{ kind: "p", text: "Daraus folgen diese übergeordneten Ziele:" },
				{
					kind: "ul",
					items: [
						"Gesetzliche, aufsichtsrechtliche und vertragliche Anforderungen werden eingehalten.",
						"Wichtige Geschäftsprozesse laufen bei Störungen weiter oder sind in festgelegter Zeit wiederhergestellt.",
						"Sicherheitsvorfälle werden früh erkannt, gemeldet und wirksam bearbeitet.",
						"Das Sicherheitsniveau wird laufend überprüft und verbessert.",
					],
				},
				{
					kind: "p",
					text: "Die Geschäftsleitung legt jedes Jahr messbare Sicherheitsziele mit Verantwortlichen und Terminen fest und lässt sich über deren Erreichung berichten.",
				},
			],
		},
		{
			id: "grundsaetze",
			heading: "Grundsätze",
			questions: [
				{
					key: "orientierung",
					kind: "choice",
					label: "Nach welchem Standard richtet sich das ISMS?",
					help: "ISMS steht für Managementsystem für Informationssicherheit. Die ISO/IEC 27001 ist international verbreitet, der IT-Grundschutz des BSI vor allem in Deutschland.",
					gap: "Standard des ISMS",
					options: [
						{ value: "iso", label: "ISO/IEC 27001", text: "der ISO/IEC 27001" },
						{
							value: "bsi",
							label: "BSI IT-Grundschutz",
							text: "dem IT-Grundschutz des BSI",
						},
						{
							value: "beide",
							label: "ISO/IEC 27001 auf Basis von IT-Grundschutz",
							text: "der ISO/IEC 27001 auf Basis des IT-Grundschutzes des BSI",
						},
					],
					recommended: "iso",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Das Managementsystem für Informationssicherheit (ISMS) von {{org}} folgt {{a:orientierung}}. Es berücksichtigt alle gesetzlichen und aufsichtsrechtlichen Anforderungen an {{org}}, zum Beispiel aus DORA oder NIS2.",
				},
				{ kind: "p", text: "Für alle Tätigkeiten gelten diese Grundsätze:" },
				{
					kind: "ul",
					items: [
						"Risikoorientierung: Maßnahmen richten sich nach dem Risiko für Informationen, Geschäftsprozesse und betroffene Personen.",
						"Angemessenheit: Aufwand und Schutz stehen in einem vertretbaren Verhältnis zum Wert der Informationen.",
						"Need-to-know und minimale Rechte: Jede Person erhält nur die Zugriffe, die sie für ihre Aufgaben braucht.",
						"Sicherheit von Anfang an: Neue Systeme, Prozesse und Dienstleister werden schon in der Planung auf Sicherheit geprüft.",
						"Mehrere Schutzschichten: Maßnahmen ergänzen sich, sodass ein einzelner Fehler nicht zum Schaden führt.",
						"Verantwortung aller: Alle Beschäftigten tragen zur Informationssicherheit bei und halten die Richtlinien ein.",
						"Nachvollziehbarkeit: Entscheidungen, Freigaben und Prüfungen werden dokumentiert.",
						"Laufende Verbesserung: Erkenntnisse aus Vorfällen, Audits und Tests fließen in das ISMS ein.",
					],
				},
			],
		},
		{
			id: "rollen",
			heading: "Rollen und Verantwortung",
			questions: [
				{
					key: "isb",
					kind: "function",
					label: "Welche Funktion steuert die Informationssicherheit?",
					help: "Meist die oder der Informationssicherheitsbeauftragte (ISB). Die Funktion sollte nicht zugleich den IT-Betrieb leiten.",
					gap: "steuernde Funktion",
					suggest: "isb_ciso",
				},
				{
					key: "bericht",
					kind: "choice",
					label: "Wie oft berichtet diese Funktion an die Geschäftsleitung?",
					gap: "Berichtsrhythmus",
					options: [
						{
							value: "quartal",
							label: "Vierteljährlich",
							text: "vierteljährlich",
						},
						{ value: "halbjahr", label: "Halbjährlich", text: "halbjährlich" },
						{
							value: "jahr",
							label: "Jährlich",
							text: "mindestens einmal im Jahr",
						},
					],
					recommended: "quartal",
				},
				{
					key: "gremium",
					kind: "choice",
					label: "Gibt es ein Gremium für Informationssicherheit?",
					help: "Ein Gremium stimmt Ziele, Risiken und Maßnahmen zwischen Leitung, IT und Fachbereichen ab. In kleinen Organisationen genügen oft die regelmäßigen Berichte.",
					gap: "Sicherheitsgremium",
					options: [
						{
							value: "ja",
							label: "Ja",
							text: "Ein Gremium für Informationssicherheit stimmt Ziele, Risiken und Maßnahmen zwischen Geschäftsleitung, IT und Fachbereichen ab",
						},
						{
							value: "nein",
							label: "Nein",
							text: "Ein eigenes Gremium für Informationssicherheit besteht nicht; die Abstimmung läuft über die regelmäßigen Berichte an die Geschäftsleitung",
						},
					],
					recommended: "ja",
				},
				{
					key: "gremium_takt",
					kind: "choice",
					label: "Wie oft tagt das Gremium?",
					gap: "Sitzungsrhythmus",
					when: { key: "gremium", is: ["ja"] },
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
					text: "Die Geschäftsleitung trägt die Gesamtverantwortung für die Informationssicherheit, beschließt diese Leitlinie und stellt Personal und Budget bereit.",
				},
				{
					kind: "p",
					text: "{{a:isb}} steuert das ISMS im Auftrag der Geschäftsleitung. Die Funktion berät, koordiniert Maßnahmen, prüft ihre Umsetzung und hat jederzeit direkten Zugang zur Geschäftsleitung.",
				},
				{
					kind: "p",
					text: "{{a:isb}} berichtet der Geschäftsleitung {{a:bericht}} über Lage, Risiken, Vorfälle und Maßnahmen, bei schwerwiegenden Vorfällen sofort.",
				},
				{ kind: "p", text: "{{a:gremium}}." },
				{
					kind: "p",
					when: { key: "gremium", is: ["ja"] },
					text: "Das Gremium tagt {{a:gremium_takt}} und bei Bedarf. Ihm gehören mindestens ein Mitglied der Geschäftsleitung, die steuernde Funktion für Informationssicherheit und Verantwortliche aus IT und Fachbereichen an.",
				},
				{ kind: "p", text: "Außerdem gilt:" },
				{
					kind: "ul",
					items: [
						"Führungskräfte setzen die Richtlinien in ihrem Bereich um und sorgen dafür, dass ihre Beschäftigten geschult sind.",
						"Verantwortliche für Informationen und Systeme legen deren Schutzbedarf fest und genehmigen Zugriffe.",
						"Beschäftigte und externe Mitarbeitende halten die Richtlinien ein und melden Auffälligkeiten.",
						"Die oder der Datenschutzbeauftragte wird bei allen Themen mit Personenbezug beteiligt.",
						"Die steuernde Funktion für Informationssicherheit ist von der Leitung des IT-Betriebs getrennt, damit keine Interessenkonflikte entstehen.",
					],
				},
			],
		},
		{
			id: "themen",
			heading: "Themenrichtlinien",
			questions: [],
			blocks: [
				{
					kind: "p",
					text: "Themenrichtlinien und Konzepte konkretisieren diese Leitlinie für einzelne Bereiche. Die Geschäftsleitung gibt jede Themenrichtlinie frei; {{a:isb}} hält sie aktuell.",
				},
				{
					kind: "p",
					text: "{{org}} regelt mindestens diese Themen in eigenen Richtlinien oder Konzepten:",
				},
				{
					kind: "ul",
					items: [
						"Klassifizierung und Umgang mit Informationen",
						"Zugang und Berechtigungen",
						"Kryptografie und Schlüsselverwaltung",
						"Endgeräte und mobiles Arbeiten",
						"Netzsicherheit",
						"Schwachstellen- und Patchmanagement",
						"Protokollierung und Überwachung",
						"Datensicherung",
						"Änderungsmanagement und sichere Entwicklung",
						"Dienstleister und Auslagerungen",
						"Umgang mit Sicherheitsvorfällen",
						"Notfallmanagement",
						"Personalsicherheit und Schulung",
					],
				},
				{
					kind: "p",
					text: "Alle Richtlinien sind den Beschäftigten zugänglich. Beschäftigte bestätigen die Kenntnisnahme der Richtlinien, die für sie gelten. Widerspricht eine Themenrichtlinie dieser Leitlinie, gilt die Leitlinie.",
				},
			],
		},
		{
			id: "verstoesse",
			heading: "Verstöße und Ausnahmen",
			questions: [
				{
					key: "meldestelle",
					kind: "text",
					label: "Wo melden Beschäftigte Sicherheitsvorfälle und Verstöße?",
					help: "Eine Stelle, die schnell reagiert, zum Beispiel der Servicedesk oder eine eigene Sicherheitsadresse.",
					gap: "Meldestelle",
					example:
						"beim IT-Servicedesk unter 030 1234567 oder an security@example.com",
				},
				{
					key: "ausnahme_dauer",
					kind: "number",
					label: "Wie lange darf eine Ausnahme höchstens gelten?",
					help: "Danach wird die Ausnahme neu bewertet und neu genehmigt.",
					gap: "Höchstdauer einer Ausnahme",
					unit: ["Monat", "Monate"],
					min: 1,
					max: 24,
					recommended: 12,
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Beschäftigte melden Sicherheitsvorfälle, Schwachstellen und Verstöße unverzüglich {{a:meldestelle}}. Wer in gutem Glauben meldet, hat keine Nachteile zu befürchten.",
				},
				{
					kind: "p",
					text: "Verstöße gegen diese Leitlinie oder die Themenrichtlinien können arbeitsrechtliche, vertragliche und rechtliche Folgen haben. Über Maßnahmen entscheidet die Geschäftsleitung in einem geregelten Verfahren, das die Schwere des Verstoßes berücksichtigt.",
				},
				{
					kind: "p",
					text: "Ausnahmen von einer Richtlinie sind nur auf schriftlichen Antrag möglich. Der Antrag nennt Grund, Risiko, Ersatzmaßnahmen und Dauer.",
				},
				{
					kind: "p",
					text: "{{a:isb}} bewertet jede Ausnahme. Ausnahmen mit hohem Risiko genehmigt die Geschäftsleitung und nimmt das verbleibende Risiko ausdrücklich an; alle übrigen genehmigt die steuernde Funktion für Informationssicherheit.",
				},
				{
					kind: "p",
					text: "Jede Ausnahme gilt höchstens {{a:ausnahme_dauer}} und steht im Ausnahmeregister.",
				},
			],
		},
		{
			id: "ueberpruefung",
			heading: "Überprüfung",
			questions: [
				{
					key: "pruefabstand",
					kind: "number",
					label:
						"In welchem Abstand überprüft die Geschäftsleitung die Leitlinie?",
					help: "ISO 27001 verlangt eine Überprüfung in geplanten Abständen; üblich ist einmal im Jahr.",
					gap: "Prüfabstand",
					unit: ["Monat", "Monate"],
					min: 6,
					max: 36,
					recommended: 12,
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Die Geschäftsleitung überprüft diese Leitlinie mindestens alle {{a:pruefabstand}}. Zusätzlich prüft sie die Leitlinie nach wesentlichen Änderungen, schweren Sicherheitsvorfällen oder neuen rechtlichen Anforderungen.",
				},
				{
					kind: "p",
					text: "Grundlage sind die Managementbewertung, die Ergebnisse interner und externer Audits und die Berichte der steuernden Funktion für Informationssicherheit.",
				},
				{
					kind: "p",
					text: "Die Leitlinie tritt mit dem Beschluss der Geschäftsleitung in Kraft und wird allen Beschäftigten bekannt gemacht.",
				},
			],
		},
	],
};
