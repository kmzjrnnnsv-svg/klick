import type { PolicyBuilder } from "../types";

// Endgeräte- und Mobilgeräterichtlinie (RL-ENDGERAETE). Inhalte nach
// ISO 27001 A.8.1/A.7.9/A.6.7, BSI SYS.2/SYS.3; vor dem Verkauf fachlich
// prüfen (CLAUDE.md, Offene Punkte).

export const ENDGERAETE: PolicyBuilder = {
	code: "RL-ENDGERAETE",
	version: 1,
	sections: [
		{
			id: "zweck",
			heading: "Zweck und Geltungsbereich",
			questions: [
				{
					key: "geraete",
					kind: "choice",
					label: "Welche Geräte deckt die Richtlinie ab?",
					gap: "Geräte",
					options: [
						{
							value: "firma",
							label: "Nur Firmengeräte",
							text: "Laptops, Arbeitsplatzrechner, Smartphones und Tablets, die {{org}} bereitstellt",
						},
						{
							value: "firma_byod",
							label: "Firmengeräte und private Geräte",
							text: "Laptops, Arbeitsplatzrechner, Smartphones und Tablets, die {{org}} bereitstellt, sowie private Geräte, mit denen auf Daten von {{org}} zugegriffen wird",
						},
					],
					recommended: "firma",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Diese Richtlinie legt fest, wie Endgeräte bei {{org}} eingerichtet, genutzt und zurückgegeben werden, damit Informationen auf ihnen geschützt bleiben. Sie gilt für alle Beschäftigten, Auszubildenden und externen Mitarbeitenden.",
				},
				{ kind: "p", text: "Erfasst sind: {{a:geraete}}." },
			],
		},
		{
			id: "verwaltung",
			heading: "Ausgabe und Verwaltung",
			questions: [
				{
					key: "verwaltung",
					kind: "function",
					label: "Wer gibt Geräte aus und verwaltet sie?",
					help: "Diese Stelle führt das Geräteverzeichnis und spielt Updates ein.",
					gap: "verwaltende Stelle",
					suggest: "isb_ciso",
				},
				{
					key: "mdm",
					kind: "choice",
					label: "Werden die Geräte zentral verwaltet (MDM)?",
					help: "Mit einer Geräteverwaltung lassen sich Einstellungen erzwingen und verlorene Geräte sperren.",
					gap: "zentrale Verwaltung",
					options: [
						{
							value: "ja",
							label: "Ja, alle Geräte",
							text: "Alle Geräte sind in der zentralen Geräteverwaltung (MDM) registriert; die Sicherheitseinstellungen werden dort erzwungen",
						},
						{
							value: "teilweise",
							label: "Nur Smartphones und Tablets",
							text: "Smartphones und Tablets sind in der zentralen Geräteverwaltung (MDM) registriert; Laptops und Arbeitsplatzrechner werden nach einer dokumentierten Grundkonfiguration eingerichtet",
						},
						{
							value: "nein",
							label: "Nein",
							text: "Die Geräte werden nach einer dokumentierten Grundkonfiguration eingerichtet und regelmäßig geprüft",
						},
					],
					recommended: "ja",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Geräte gibt {{a:verwaltung}} aus. Jedes Gerät steht mit verantwortlicher Person, Seriennummer und Ausgabedatum im Geräteverzeichnis (Asset-Register).",
				},
				{ kind: "p", text: "{{a:mdm}}." },
			],
		},
		{
			id: "schutz",
			heading: "Mindestschutz",
			questions: [
				{
					key: "sperre",
					kind: "number",
					label:
						"Nach wie vielen Minuten ohne Eingabe sperrt sich der Bildschirm?",
					gap: "Bildschirmsperre",
					unit: ["Minute", "Minuten"],
					min: 1,
					max: 60,
					recommended: 5,
				},
				{
					key: "anmeldung",
					kind: "choice",
					label: "Wie melden sich Beschäftigte am Gerät an?",
					gap: "Anmeldung am Gerät",
					options: [
						{
							value: "bio",
							label: "Biometrie oder PIN mit mindestens 6 Ziffern",
							text: "per Fingerabdruck, Gesichtserkennung oder einer PIN mit mindestens 6 Ziffern",
						},
						{
							value: "passwort",
							label: "Passwort mit mindestens 12 Zeichen",
							text: "mit einem Passwort aus mindestens 12 Zeichen",
						},
					],
					recommended: "bio",
				},
			],
			blocks: [
				{ kind: "p", text: "Auf jedem Gerät gilt:" },
				{
					kind: "ul",
					items: [
						"Der Datenträger ist vollständig verschlüsselt (zum Beispiel BitLocker, FileVault oder die Verschlüsselung von iOS und Android).",
						"Die Anmeldung erfolgt {{a:anmeldung}}.",
						"Der Bildschirm sperrt sich nach {{a:sperre}} ohne Eingabe; beim Verlassen des Platzes sperren Beschäftigte ihn selbst.",
						"Betriebssystem und Anwendungen sind auf einem vom Hersteller unterstützten Stand; Sicherheitsupdates werden nach der Patchrichtlinie eingespielt.",
						"Ein Schutz vor Schadsoftware ist aktiv und aktuell.",
						"Nur freigegebene Anwendungen aus vertrauenswürdigen Quellen werden installiert.",
					],
				},
			],
		},
		{
			id: "privat",
			heading: "Private Geräte",
			questions: [
				{
					key: "byod_zugang",
					kind: "choice",
					label: "Worauf dürfen private Geräte zugreifen?",
					gap: "Zugriff privater Geräte",
					when: { key: "geraete", is: ["firma_byod"] },
					options: [
						{
							value: "mail",
							label: "Nur Mail und Kalender",
							text: "nur auf Mail und Kalender",
						},
						{
							value: "apps",
							label: "Mail, Kalender und freigegebene Apps",
							text: "auf Mail, Kalender und ausdrücklich freigegebene Anwendungen",
						},
					],
					recommended: "mail",
				},
			],
			blocks: [
				{
					kind: "p",
					when: { key: "geraete", is: ["firma"] },
					text: "Private Geräte dürfen nicht auf Daten von {{org}} zugreifen. Ausnahmen genehmigt die verwaltende Stelle schriftlich und befristet.",
				},
				{
					kind: "p",
					when: { key: "geraete", is: ["firma_byod"] },
					text: "Private Geräte dürfen {{a:byod_zugang}} zugreifen. Diese Geräte erfüllen denselben Mindestschutz wie Firmengeräte; Daten von {{org}} liegen in einem getrennten Bereich (zum Beispiel einem Arbeitsprofil), den {{org}} aus der Ferne löschen kann.",
				},
			],
		},
		{
			id: "verlust",
			heading: "Verlust und Diebstahl",
			questions: [
				{
					key: "meldestelle",
					kind: "text",
					label:
						"Wo melden Beschäftigte ein verlorenes oder gestohlenes Gerät?",
					help: "Eine Stelle, die auch abends erreichbar ist, zum Beispiel Servicedesk oder Bereitschaft.",
					gap: "Meldestelle",
					example: "beim IT-Servicedesk unter 030 1234567 oder it@example.com",
				},
				{
					key: "meldefrist",
					kind: "choice",
					label: "Wie schnell muss ein Verlust gemeldet werden?",
					gap: "Meldefrist",
					options: [
						{ value: "sofort", label: "Sofort", text: "sofort" },
						{
							value: "24h",
							label: "Innerhalb von 24 Stunden",
							text: "innerhalb von 24 Stunden",
						},
					],
					recommended: "sofort",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Ein verlorenes oder gestohlenes Gerät wird {{a:meldefrist}} {{a:meldestelle}} gemeldet. Die verwaltende Stelle sperrt das Gerät, löscht es wenn möglich aus der Ferne und prüft, ob ein Sicherheitsvorfall nach der Vorfallrichtlinie vorliegt (etwa bei personenbezogenen Daten).",
				},
			],
		},
		{
			id: "rueckgabe",
			heading: "Rückgabe und Entsorgung",
			questions: [
				{
					key: "rueckgabe_frist",
					kind: "choice",
					label: "Wann geben Beschäftigte Geräte beim Austritt zurück?",
					gap: "Rückgabe",
					options: [
						{
							value: "letzter_tag",
							label: "Am letzten Arbeitstag",
							text: "spätestens am letzten Arbeitstag",
						},
						{
							value: "freistellung",
							label: "Mit Beginn einer Freistellung",
							text: "spätestens am letzten Arbeitstag, bei einer Freistellung mit deren Beginn",
						},
					],
					recommended: "freistellung",
				},
			],
			blocks: [
				{
					kind: "p",
					text: "Beim Austritt oder Rollenwechsel werden Geräte {{a:rueckgabe_frist}} zurückgegeben; die Rückgabe wird im Geräteverzeichnis vermerkt. Vor der Weitergabe oder Entsorgung werden Datenträger sicher gelöscht oder zerstört; die Löschung wird dokumentiert.",
				},
			],
		},
	],
};
