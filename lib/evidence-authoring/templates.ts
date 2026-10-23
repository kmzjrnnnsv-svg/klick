import type { ControlTestMethod, RoleFunction } from "@/db/schema/enums";
import type { EvidenceType } from "@/lib/evidence/store";

// Rohlinge: Nachweise direkt in Klick verfassen, wenn es keine Datei, keinen
// Link und keinen Screenshot gibt. Grundlage ISO 19011 — objektive Nachweise
// sind Aufzeichnungen, Tatsachenfeststellungen, Beobachtungen und
// Befragungsergebnisse; Aufzeichnungen sind unveränderlich (Änderung = neue
// Fassung). Jeder Rohling besteht aus Bausteinen; der Inhalt wird beim
// Abschließen zum PDF (wie die Nachweise aus Registern) und kann per Passkey
// unterschrieben werden. Inhalte nach Prüfpraxis, keine Rechtsberatung.

export type FieldDef = {
	key: string;
	label: string;
	type: "text" | "date" | "time" | "select";
	options?: readonly string[];
	required?: boolean;
	placeholder?: string;
	// Vorbelegung: heute bzw. Name der verfassenden Person
	initial?: "today" | "me";
};

export type ColumnDef = {
	key: string;
	label: string;
	type?: "text" | "date" | "select";
	options?: readonly string[];
	// Breite im PDF (Anteile)
	width?: number;
};

export type BlockDef =
	| { id: string; kind: "fields"; title?: string; fields: readonly FieldDef[] }
	| {
			id: string;
			kind: "text";
			title: string;
			hint: string;
			required?: boolean;
	  }
	| {
			id: string;
			kind: "list";
			title: string;
			hint: string;
			required?: boolean;
	  }
	| {
			id: string;
			kind: "table";
			title: string;
			hint?: string;
			columns: readonly ColumnDef[];
			// Vorbelegte Zeilen (z. B. Kennzahlen); Spaltenwerte in Reihenfolge
			rows?: readonly (readonly string[])[];
			required?: boolean;
	  }
	| {
			id: string;
			kind: "checklist";
			title: string;
			hint?: string;
			items?: readonly string[];
			// Prüffragen der gewählten Controls übernehmen
			fromControlQuestions?: boolean;
			required?: boolean;
	  }
	| { id: string; kind: "result"; title: string; required?: boolean }
	| { id: string; kind: "measures"; title: string; hint?: string }
	| {
			id: string;
			kind: "sections";
			title?: string;
			hint: string;
			required?: boolean;
	  };

export type TemplateGroup = "protocol" | "confirmation" | "list" | "free";

export type ListPreset = {
	key: string;
	title: string;
	columns: readonly ColumnDef[];
	// Treffer im Nachweis-Hinweis (Kleinschreibung)
	match: RegExp;
};

export type EvidenceTemplate = {
	key: string;
	code: string;
	title: string;
	group: TemplateGroup;
	purpose: string;
	// warum Prüfer:innen das als Nachweis anerkennen
	basis: string;
	evidenceType: EvidenceType;
	blocks: readonly BlockDef[];
	// Gegenzeichnung (Vorschlag); "-" = die verfassende Person
	signers: readonly (RoleFunction | "-")[];
	// Wirksamkeitstest im Testprogramm eintragen (Ergebnis aus dem Baustein „result“)
	testMethod?: ControlTestMethod;
	// gültig für … Monate (Wiedervorlage)
	reviewMonths: number;
	presets?: readonly ListPreset[];
};

export const RESULT_VALUES = ["pass", "partial", "fail"] as const;
export type ResultValue = (typeof RESULT_VALUES)[number];
export const RESULT_LABELS: Record<ResultValue, string> = {
	pass: "wirksam",
	partial: "teilweise wirksam",
	fail: "nicht wirksam",
};

export const CHECK_VALUES = ["yes", "partial", "no", "na"] as const;
export type CheckValue = (typeof CHECK_VALUES)[number];
export const CHECK_LABELS: Record<CheckValue, string> = {
	yes: "erfüllt",
	partial: "teilweise",
	no: "nicht erfüllt",
	na: "nicht anwendbar",
};

const datum = (label = "Datum"): FieldDef => ({
	key: "date",
	label,
	type: "date",
	required: true,
	initial: "today",
});
const durch = (label = "Durchgeführt von"): FieldDef => ({
	key: "by",
	label,
	type: "text",
	required: true,
	initial: "me",
});
const massnahmen: BlockDef = {
	id: "measures",
	kind: "measures",
	title: "Maßnahmen",
	hint: "Was folgt daraus — wer erledigt es bis wann? Auf Wunsch werden daraus Aufgaben.",
};
const ergebnis: BlockDef = {
	id: "result",
	kind: "result",
	title: "Ergebnis",
	required: true,
};

export const EVIDENCE_TEMPLATES: readonly EvidenceTemplate[] = [
	// ── Protokolle ────────────────────────────────────────────────────────
	{
		key: "besprechung",
		code: "RL-PROTOKOLL",
		title: "Besprechungsprotokoll",
		group: "protocol",
		purpose:
			"Hält eine Sitzung fest: wer teilnahm, was besprochen und entschieden wurde und wer bis wann was erledigt.",
		basis:
			"Aufzeichnung: Datum, Teilnehmende, Ergebnisse und Freigabe machen ein Protokoll prüffähig.",
		evidenceType: "document",
		blocks: [
			{
				id: "head",
				kind: "fields",
				fields: [
					{
						key: "occasion",
						label: "Anlass / Gremium",
						type: "text",
						required: true,
						placeholder: "z. B. ISMS-Jour-fixe, Krisenstab",
					},
					datum(),
					{ key: "start", label: "Beginn", type: "time" },
					{ key: "end", label: "Ende", type: "time" },
					{
						key: "place",
						label: "Ort / Format",
						type: "text",
						placeholder: "z. B. Raum 2.04, Videokonferenz",
					},
					{ key: "lead", label: "Leitung", type: "text" },
					durch("Protokoll"),
				],
			},
			{
				id: "participants",
				kind: "table",
				title: "Teilnehmende",
				columns: [
					{ key: "name", label: "Name", width: 3 },
					{ key: "role", label: "Funktion / Bereich", width: 3 },
					{
						key: "presence",
						label: "Anwesenheit",
						type: "select",
						options: ["anwesend", "entschuldigt", "Gast"],
						width: 2,
					},
				],
				required: true,
			},
			{
				id: "agenda",
				kind: "list",
				title: "Tagesordnung",
				hint: "Ein Punkt je Zeile.",
			},
			{
				id: "outcomes",
				kind: "table",
				title: "Ergebnisse und Beschlüsse",
				columns: [
					{ key: "topic", label: "Punkt", width: 2 },
					{ key: "outcome", label: "Ergebnis / Beschluss", width: 5 },
				],
				required: true,
			},
			massnahmen,
		],
		signers: ["-"],
		reviewMonths: 12,
	},
	{
		key: "unterweisung",
		code: "RL-UNTERWEISUNG",
		title: "Unterweisung mit Teilnahmeliste",
		group: "protocol",
		purpose:
			"Belegt, wer wann zu welchem Thema geschult oder unterwiesen wurde — mit Inhalten und Wirksamkeitskontrolle.",
		basis:
			"Kompetenznachweis (ISO 27001 7.2/7.3): Thema, Inhalte, Teilnehmende und Kontrolle der Wirksamkeit.",
		evidenceType: "document",
		blocks: [
			{
				id: "head",
				kind: "fields",
				fields: [
					{
						key: "topic",
						label: "Thema",
						type: "text",
						required: true,
						placeholder: "z. B. Phishing erkennen, Meldeweg bei Vorfällen",
					},
					datum(),
					{
						key: "duration",
						label: "Dauer",
						type: "text",
						placeholder: "z. B. 45 min",
					},
					{
						key: "form",
						label: "Form",
						type: "select",
						options: ["Präsenz", "Online", "E-Learning", "Selbststudium"],
					},
					durch(),
				],
			},
			{
				id: "contents",
				kind: "list",
				title: "Inhalte",
				hint: "Ein Inhalt je Zeile.",
				required: true,
			},
			{
				id: "participants",
				kind: "table",
				title: "Teilnehmende",
				columns: [
					{ key: "name", label: "Name", width: 3 },
					{ key: "role", label: "Funktion / Bereich", width: 3 },
					{
						key: "attended",
						label: "Teilgenommen",
						type: "select",
						options: ["ja", "nein", "nachgeholt"],
						width: 2,
					},
				],
				required: true,
			},
			{
				id: "effectiveness",
				kind: "text",
				title: "Wirksamkeitskontrolle",
				hint: "Wie wurde geprüft, dass es angekommen ist? z. B. Abschlusstest, Rückfragen, Phishing-Übung.",
			},
			massnahmen,
		],
		signers: ["-"],
		reviewMonths: 12,
	},
	{
		key: "uebung",
		code: "RL-UEBUNG",
		title: "Übungsprotokoll (Notfall, Krise, Wiederanlauf)",
		group: "protocol",
		purpose:
			"Dokumentiert eine Übung: Szenario, Ziele, Ablauf mit Zeiten, Ergebnis gegen die Vorgaben und Erkenntnisse.",
		basis:
			"Testnachweis (ISO 27001 5.30, DORA Art. 11/24, BSI 200-4): Ablauf, Zeiten gegen RTO/RPO und Lessons Learned.",
		evidenceType: "document",
		blocks: [
			{
				id: "head",
				kind: "fields",
				fields: [
					{ key: "name", label: "Übung", type: "text", required: true },
					{
						key: "type",
						label: "Art",
						type: "select",
						options: [
							"Planspiel (Tabletop)",
							"Funktionstest",
							"Teilübung",
							"Vollübung",
						],
						required: true,
					},
					datum(),
					durch("Leitung"),
					{ key: "observer", label: "Beobachtung", type: "text" },
					{
						key: "scope",
						label: "Betroffene Prozesse / Systeme",
						type: "text",
					},
				],
			},
			{
				id: "scenario",
				kind: "text",
				title: "Szenario",
				hint: "Was wurde angenommen? z. B. Ausfall des Rechenzentrums um 9 Uhr, Ransomware auf dem Dateiserver.",
				required: true,
			},
			{
				id: "goals",
				kind: "list",
				title: "Ziele",
				hint: "Was sollte die Übung zeigen? Ein Ziel je Zeile.",
				required: true,
			},
			{
				id: "timeline",
				kind: "table",
				title: "Ablauf",
				columns: [
					{ key: "time", label: "Uhrzeit", width: 1 },
					{ key: "event", label: "Ereignis", width: 3 },
					{ key: "reaction", label: "Reaktion / Entscheidung", width: 3 },
				],
			},
			{
				id: "targets",
				kind: "table",
				title: "Vorgaben und Ergebnis",
				columns: [
					{ key: "metric", label: "Kennzahl", width: 3 },
					{ key: "target", label: "Vorgabe", width: 2 },
					{ key: "actual", label: "Erreicht", width: 2 },
					{
						key: "met",
						label: "Erfüllt",
						type: "select",
						options: ["ja", "teilweise", "nein"],
						width: 1,
					},
				],
				rows: [
					["Wiederanlaufzeit (RTO)", "", "", ""],
					["Datenverlust (RPO)", "", "", ""],
					["Alarmierung bis Krisenstab", "", "", ""],
				],
			},
			ergebnis,
			{
				id: "lessons",
				kind: "list",
				title: "Erkenntnisse",
				hint: "Was lief gut, was nicht? Ein Punkt je Zeile.",
			},
			massnahmen,
		],
		signers: ["-", "bcm_manager"],
		testMethod: "bcm_exercise",
		reviewMonths: 12,
	},
	{
		key: "wiederherstellung",
		code: "RL-WIEDERHERSTELLUNG",
		title: "Wiederherstellungstest (Backup/Restore)",
		group: "protocol",
		purpose:
			"Belegt, dass sich Daten oder Schlüssel aus der Sicherung tatsächlich zurückholen lassen — mit Dauer und Prüfung der Vollständigkeit.",
		basis:
			"Wirksamkeitsnachweis (ISO 27001 8.13, DORA Art. 12): nur eine getestete Wiederherstellung zeigt, dass die Sicherung taugt.",
		evidenceType: "document",
		blocks: [
			{
				id: "head",
				kind: "fields",
				fields: [
					{
						key: "system",
						label: "System / Datenbestand",
						type: "text",
						required: true,
					},
					{
						key: "backupOf",
						label: "Sicherung vom",
						type: "date",
						required: true,
					},
					datum("Wiederherstellung am"),
					{
						key: "target",
						label: "Zielumgebung",
						type: "select",
						options: ["Testumgebung", "isolierte Umgebung", "Produktion"],
					},
					durch(),
					{ key: "tool", label: "Werkzeug / Verfahren", type: "text" },
				],
			},
			{
				id: "targets",
				kind: "table",
				title: "Vorgaben und Ergebnis",
				columns: [
					{ key: "metric", label: "Kennzahl", width: 3 },
					{ key: "target", label: "Vorgabe", width: 2 },
					{ key: "actual", label: "Erreicht", width: 2 },
				],
				rows: [
					["Wiederherstellungsdauer (RTO)", "", ""],
					["Alter der Sicherung (RPO)", "", ""],
				],
			},
			{
				id: "checks",
				kind: "checklist",
				title: "Prüfung",
				items: [
					"Sicherung vollständig lesbar",
					"Prüfsummen bzw. Integrität bestätigt",
					"Verschlüsselte Sicherung mit dem verwahrten Schlüssel entschlüsselt",
					"Anwendung startet mit den wiederhergestellten Daten",
					"Stichprobe fachlich geprüft",
					"Testumgebung danach bereinigt",
				],
				required: true,
			},
			ergebnis,
			{
				id: "deviations",
				kind: "text",
				title: "Abweichungen",
				hint: "Was lief anders als geplant und warum?",
			},
			massnahmen,
		],
		signers: ["-"],
		testMethod: "reperformance",
		reviewMonths: 12,
	},
	{
		key: "rezertifizierung",
		code: "RL-REZERTIFIZIERUNG",
		title: "Rezertifizierung von Zugriffsrechten",
		group: "protocol",
		purpose:
			"Belegt die Überprüfung der Konten und Rechte eines Systems — Grundlage, Entscheidung je Konto und Umsetzung.",
		basis:
			"Prüfer:innen erwarten die Kontenliste mit Stand, die Entscheidung je Konto und die Gegenzeichnung durch eine zweite Person (ISO 27001 5.18).",
		evidenceType: "document",
		blocks: [
			{
				id: "head",
				kind: "fields",
				fields: [
					{
						key: "system",
						label: "System / Anwendung",
						type: "text",
						required: true,
					},
					{
						key: "listDate",
						label: "Stand der Kontenliste",
						type: "date",
						required: true,
					},
					{
						key: "source",
						label: "Quelle der Liste",
						type: "text",
						required: true,
						placeholder: "z. B. Export aus dem Verzeichnisdienst",
					},
					datum("Geprüft am"),
					durch(),
					{ key: "owner", label: "Systemverantwortlich", type: "text" },
				],
			},
			{
				id: "accounts",
				kind: "table",
				title: "Konten",
				columns: [
					{ key: "account", label: "Konto", width: 2 },
					{ key: "person", label: "Person", width: 2 },
					{ key: "rights", label: "Rolle / Rechte", width: 3 },
					{
						key: "decision",
						label: "Entscheidung",
						type: "select",
						options: ["bestätigt", "angepasst", "entzogen"],
						width: 2,
					},
					{ key: "done", label: "Umgesetzt am", type: "date", width: 2 },
				],
				required: true,
			},
			{
				id: "summary",
				kind: "text",
				title: "Zusammenfassung",
				hint: "z. B. 42 Konten geprüft, 3 entzogen, 2 angepasst; verwaiste Konten: keine.",
			},
			ergebnis,
			massnahmen,
		],
		signers: ["-", "isb_ciso"],
		testMethod: "access_review",
		reviewMonths: 6,
	},
	{
		key: "pruefung",
		code: "RL-PRUEFUNG",
		title: "Prüfprotokoll (Stichprobe)",
		group: "protocol",
		purpose:
			"Hält die Prüfung eines Controls fest: Ziel, Grundgesamtheit, Stichprobe, Ergebnis je Element und Gesamturteil.",
		basis:
			"Stichprobenprüfung nach ISO 19011 Anhang A.6: Grundgesamtheit, Auswahl und Ergebnis machen das Urteil nachvollziehbar.",
		evidenceType: "document",
		blocks: [
			{
				id: "head",
				kind: "fields",
				fields: [
					{
						key: "subject",
						label: "Prüfgegenstand",
						type: "text",
						required: true,
					},
					{ key: "period", label: "Prüfzeitraum", type: "text" },
					datum("Geprüft am"),
					durch("Geprüft von"),
					{
						key: "method",
						label: "Methode",
						type: "select",
						options: [
							"Sichtprüfung",
							"Nachvollzug",
							"Befragung",
							"Beobachtung",
							"Datenanalyse",
						],
						required: true,
					},
				],
			},
			{
				id: "goal",
				kind: "text",
				title: "Prüfziel",
				hint: "Was soll die Prüfung zeigen?",
				required: true,
			},
			{
				id: "sample",
				kind: "fields",
				title: "Stichprobe",
				fields: [
					{ key: "population", label: "Grundgesamtheit", type: "text" },
					{ key: "size", label: "Stichprobengröße", type: "text" },
					{
						key: "selection",
						label: "Auswahl",
						type: "select",
						options: ["zufällig", "bewusst", "vollständig"],
					},
				],
			},
			{
				id: "items",
				kind: "table",
				title: "Ergebnis je Element",
				columns: [
					{ key: "item", label: "Element", width: 3 },
					{
						key: "outcome",
						label: "Ergebnis",
						type: "select",
						options: ["ok", "Mangel", "n. a."],
						width: 1,
					},
					{ key: "note", label: "Bemerkung", width: 3 },
				],
				required: true,
			},
			ergebnis,
			{
				id: "findings",
				kind: "list",
				title: "Feststellungen",
				hint: "Eine Feststellung je Zeile.",
			},
			massnahmen,
		],
		signers: ["-"],
		testMethod: "inspection",
		reviewMonths: 12,
	},
	{
		key: "begehung",
		code: "RL-BEGEHUNG",
		title: "Begehungsprotokoll",
		group: "protocol",
		purpose:
			"Dokumentiert eine Begehung vor Ort — Serverraum, Büro, Archiv, Clean Desk — mit Prüfpunkten und Feststellungen.",
		basis:
			"Beobachtung (ISO 19011): was vor Ort gesehen wurde, mit Datum, Bereich und Person festgehalten.",
		evidenceType: "document",
		blocks: [
			{
				id: "head",
				kind: "fields",
				fields: [
					{
						key: "area",
						label: "Bereich / Standort",
						type: "text",
						required: true,
					},
					datum(),
					durch("Begangen von"),
					{ key: "with", label: "Begleitet von", type: "text" },
				],
			},
			{
				id: "checks",
				kind: "checklist",
				title: "Prüfpunkte",
				items: [
					"Zutritt nur für Berechtigte, Türen und Fenster gesichert",
					"Besucher:innen angemeldet und begleitet",
					"Arbeitsplätze aufgeräumt (Clean Desk)",
					"Bildschirme gesperrt (Clear Screen)",
					"Vertrauliche Unterlagen verschlossen",
					"Brandschutz, Klima und Stromversorgung in Ordnung",
					"Datenträger und Ausdrucke sicher entsorgt",
				],
				required: true,
			},
			{
				id: "findings",
				kind: "list",
				title: "Feststellungen",
				hint: "Eine Feststellung je Zeile.",
			},
			massnahmen,
		],
		signers: ["-"],
		testMethod: "inspection",
		reviewMonths: 12,
	},
	{
		key: "auswertung",
		code: "RL-AUSWERTUNG",
		title: "Review- und Auswertungsprotokoll",
		group: "protocol",
		purpose:
			"Belegt die regelmäßige Durchsicht von Protokollen, Regeln oder Alarmen (z. B. Logs, Firewall-Regeln) mit Auffälligkeiten und Bewertung.",
		basis:
			"Überwachungsnachweis (ISO 27001 8.15/8.16): Zeitraum, Quellen und Bewertung zeigen, dass ausgewertet wird.",
		evidenceType: "log_extract",
		blocks: [
			{
				id: "head",
				kind: "fields",
				fields: [
					{ key: "subject", label: "Gegenstand", type: "text", required: true },
					{
						key: "period",
						label: "Zeitraum",
						type: "text",
						required: true,
						placeholder: "z. B. 01.–30.09.",
					},
					{
						key: "sources",
						label: "Quellen",
						type: "text",
						placeholder: "z. B. Firewall, Cloud-Protokolle, SIEM",
					},
					datum(),
					durch(),
				],
			},
			{
				id: "findings",
				kind: "table",
				title: "Auffälligkeiten",
				columns: [
					{ key: "when", label: "Zeitpunkt", width: 2 },
					{ key: "what", label: "Beschreibung", width: 4 },
					{
						key: "rating",
						label: "Bewertung",
						type: "select",
						options: ["unkritisch", "zu prüfen", "Vorfall"],
						width: 2,
					},
					{ key: "action", label: "Maßnahme / Verweis", width: 3 },
				],
			},
			{
				id: "assessment",
				kind: "text",
				title: "Bewertung",
				hint: "Gesamteindruck; auch „keine Auffälligkeiten“ ist ein Ergebnis.",
				required: true,
			},
			ergebnis,
			massnahmen,
		],
		signers: ["-"],
		testMethod: "inspection",
		reviewMonths: 3,
	},
	{
		key: "aenderung",
		code: "RL-AENDERUNG",
		title: "Änderungs- und Freigabeprotokoll",
		group: "protocol",
		purpose:
			"Dokumentiert eine Änderung an Systemen oder Prozessen: Anlass, Risiko, Test, Freigabe im Vier-Augen-Prinzip, Umsetzung und Rückfallplan.",
		basis:
			"Änderungsnachweis (ISO 27001 8.32, DORA Art. 9(4)(e)): Freigabe vor Umsetzung, Test und Rückfallplan.",
		evidenceType: "document",
		blocks: [
			{
				id: "head",
				kind: "fields",
				fields: [
					{ key: "change", label: "Änderung", type: "text", required: true },
					{
						key: "system",
						label: "System / Prozess",
						type: "text",
						required: true,
					},
					{
						key: "type",
						label: "Art",
						type: "select",
						options: ["Standard", "Normal", "Notfall"],
						required: true,
					},
					durch("Beantragt von"),
					datum("Beantragt am"),
					{ key: "planned", label: "Geplant für", type: "date" },
				],
			},
			{
				id: "reason",
				kind: "text",
				title: "Begründung",
				hint: "Warum ist die Änderung nötig?",
				required: true,
			},
			{
				id: "risk",
				kind: "text",
				title: "Auswirkung und Risiko",
				hint: "Wer oder was ist betroffen, was kann schiefgehen?",
				required: true,
			},
			{
				id: "test",
				kind: "text",
				title: "Test und Abnahme",
				hint: "Wie wurde getestet, wer hat abgenommen?",
			},
			{
				id: "rollback",
				kind: "text",
				title: "Rückfallplan",
				hint: "Wie wird die Änderung zurückgenommen, wenn sie scheitert?",
				required: true,
			},
			{
				id: "done",
				kind: "fields",
				title: "Umsetzung",
				fields: [
					{ key: "doneAt", label: "Umgesetzt am", type: "date" },
					{ key: "doneBy", label: "Umgesetzt von", type: "text" },
				],
			},
			{
				id: "review",
				kind: "text",
				title: "Nachkontrolle",
				hint: "Läuft alles wie erwartet?",
			},
		],
		signers: ["-", "isb_ciso"],
		reviewMonths: 12,
	},
	{
		key: "befragung",
		code: "RL-BEFRAGUNG",
		title: "Befragungsprotokoll",
		group: "protocol",
		purpose:
			"Hält eine Befragung fest — Fragen, Antworten und gesichtete Belege —, z. B. zur Wirksamkeit eines Controls.",
		basis:
			"Befragung nach ISO 19011: Aussagen zählen, wenn sie dokumentiert, mit Belegen abgeglichen und bestätigt sind.",
		evidenceType: "document",
		blocks: [
			{
				id: "head",
				kind: "fields",
				fields: [
					{
						key: "person",
						label: "Befragte Person",
						type: "text",
						required: true,
					},
					{ key: "role", label: "Funktion", type: "text", required: true },
					{ key: "topic", label: "Thema", type: "text", required: true },
					datum(),
					durch("Befragt von"),
				],
			},
			{
				id: "qa",
				kind: "table",
				title: "Fragen und Antworten",
				columns: [
					{ key: "q", label: "Frage", width: 3 },
					{ key: "a", label: "Antwort", width: 4 },
					{ key: "proof", label: "Beleg gesichtet", width: 2 },
				],
				required: true,
			},
			{
				id: "assessment",
				kind: "text",
				title: "Bewertung",
				hint: "Deckt sich die Auskunft mit den Belegen?",
			},
			ergebnis,
			massnahmen,
		],
		signers: ["-"],
		testMethod: "interview",
		reviewMonths: 12,
	},
	{
		key: "vermerk",
		code: "RL-VERMERK",
		title: "Aktenvermerk",
		group: "protocol",
		purpose:
			"Hält einen Sachverhalt, eine Bewertung oder eine Entscheidung knapp und datiert fest — wenn kein anderer Rohling passt.",
		basis:
			"Tatsachenfeststellung: wer hat wann was festgestellt oder entschieden.",
		evidenceType: "document",
		blocks: [
			{
				id: "head",
				kind: "fields",
				fields: [
					{ key: "occasion", label: "Anlass", type: "text", required: true },
					datum(),
					durch("Verfasst von"),
					{ key: "to", label: "Verteiler", type: "text" },
				],
			},
			{
				id: "facts",
				kind: "text",
				title: "Sachverhalt",
				hint: "Was ist geschehen oder festgestellt worden?",
				required: true,
			},
			{
				id: "assessment",
				kind: "text",
				title: "Bewertung",
				hint: "Wie ist es einzuordnen?",
			},
			{
				id: "decision",
				kind: "text",
				title: "Entscheidung / Ergebnis",
				hint: "Was wurde entschieden, was gilt jetzt?",
			},
			massnahmen,
		],
		signers: ["-"],
		reviewMonths: 12,
	},
	// ── Bestätigungen ─────────────────────────────────────────────────────
	{
		key: "bestaetigung",
		code: "RL-BESTAETIGUNG",
		title: "Bestätigung (Attestierung)",
		group: "confirmation",
		purpose:
			"Eine verantwortliche Person bestätigt einen Zustand — mit Zeitraum, Grundlage und Einschränkungen —, unterschrieben per Passkey.",
		basis:
			"Selbstauskunft mit Unterschrift; zählt mehr, wenn die Grundlage (gesichtete Unterlagen, Stichproben) genannt ist.",
		evidenceType: "attestation",
		blocks: [
			{
				id: "head",
				kind: "fields",
				fields: [
					durch("Bestätigt von"),
					{ key: "role", label: "Funktion", type: "text", required: true },
					{
						key: "period",
						label: "Gilt für den Zeitraum",
						type: "text",
						placeholder: "z. B. Geschäftsjahr 2026",
					},
					datum(),
				],
			},
			{
				id: "statement",
				kind: "text",
				title: "Aussage",
				hint: "„Hiermit bestätige ich, dass …“",
				required: true,
			},
			{
				id: "basis",
				kind: "list",
				title: "Grundlage",
				hint: "Welche Unterlagen, Stichproben oder Gespräche stützen die Aussage? Eine je Zeile.",
			},
			{
				id: "limits",
				kind: "text",
				title: "Einschränkungen",
				hint: "Was ist ausdrücklich nicht abgedeckt?",
			},
		],
		signers: ["-"],
		reviewMonths: 12,
	},
	{
		key: "uebergabe",
		code: "RL-UEBERGABE",
		title: "Übergabe- und Rückgabeprotokoll",
		group: "confirmation",
		purpose:
			"Belegt Ausgabe und Rückgabe von Geräten, Schlüsseln und Zugängen beim Eintritt, Wechsel oder Austritt.",
		basis:
			"On-/Offboarding-Nachweis (ISO 27001 5.11, 6.5, 5.18): was ausgegeben, zurückgenommen und gesperrt wurde, mit Datum.",
		evidenceType: "document",
		blocks: [
			{
				id: "head",
				kind: "fields",
				fields: [
					{ key: "person", label: "Person", type: "text", required: true },
					{
						key: "occasion",
						label: "Anlass",
						type: "select",
						options: ["Eintritt", "Wechsel", "Austritt", "Leihe"],
						required: true,
					},
					datum(),
					durch(),
				],
			},
			{
				id: "items",
				kind: "table",
				title: "Gegenstände",
				columns: [
					{ key: "item", label: "Gegenstand", width: 3 },
					{ key: "id", label: "Kennung / Inventarnr.", width: 2 },
					{ key: "out", label: "Ausgegeben am", type: "date", width: 2 },
					{ key: "back", label: "Zurück am", type: "date", width: 2 },
				],
			},
			{
				id: "access",
				kind: "checklist",
				title: "Zugänge",
				items: [
					"Benutzerkonto angelegt bzw. gesperrt",
					"Rechte nach Rolle vergeben bzw. entzogen",
					"E-Mail und Weiterleitungen geregelt",
					"Zutrittsmedien ausgegeben bzw. zurückgenommen",
					"Mobile Geräte eingerichtet bzw. gelöscht",
					"Vertraulichkeit unterschrieben bzw. auf Fortgeltung hingewiesen",
				],
				required: true,
			},
			{
				id: "notes",
				kind: "text",
				title: "Bemerkungen",
				hint: "z. B. fehlende Rückgaben und wie damit umgegangen wird.",
			},
		],
		signers: ["-"],
		reviewMonths: 24,
	},
	// ── Listen ────────────────────────────────────────────────────────────
	{
		key: "liste",
		code: "RL-LISTE",
		title: "Liste / Verzeichnis",
		group: "list",
		purpose:
			"Ein Verzeichnis mit festen Spalten — z. B. Schlüsselinhaber:innen, Notfallkontakte, privilegierte Werkzeuge. Stand und Verantwortliche stehen im Kopf.",
		basis:
			"Aufzeichnung mit Stand: Prüfer:innen gleichen Listen mit der Wirklichkeit ab — Datum und Verantwortung gehören dazu.",
		evidenceType: "document",
		blocks: [
			{
				id: "head",
				kind: "fields",
				fields: [
					datum("Stand"),
					durch("Verantwortlich"),
					{ key: "scope", label: "Geltungsbereich", type: "text" },
				],
			},
			{
				id: "entries",
				kind: "table",
				title: "Einträge",
				columns: [
					{ key: "entry", label: "Eintrag", width: 3 },
					{ key: "desc", label: "Beschreibung", width: 4 },
					{ key: "owner", label: "Verantwortlich", width: 2 },
					{ key: "note", label: "Bemerkung", width: 2 },
				],
				required: true,
			},
			{
				id: "notes",
				kind: "text",
				title: "Hinweise",
				hint: "z. B. Quelle der Angaben, nächste Überprüfung.",
			},
		],
		signers: ["-"],
		reviewMonths: 12,
		presets: [
			{
				key: "schluesselinhaber",
				title: "Liste der Schlüsselinhaber:innen",
				match: /schlüsselinhaber|schluesselinhaber|key ?holder|schlüsselanteil/,
				columns: [
					{ key: "key", label: "Schlüssel / Anteil", width: 3 },
					{ key: "holder", label: "Inhaber:in", width: 3 },
					{ key: "deputy", label: "Vertretung", width: 2 },
					{ key: "place", label: "Aufbewahrung (allgemein)", width: 3 },
					{ key: "since", label: "Seit", type: "date", width: 2 },
				],
			},
			{
				key: "kontakte",
				title: "Kontaktliste für Notfall und Krise",
				match:
					/kontaktliste|notfallkontakt|krisenkontakt|alarmierungsliste|erreichbarkeit/,
				columns: [
					{ key: "role", label: "Rolle", width: 3 },
					{ key: "name", label: "Name", width: 3 },
					{ key: "phone", label: "Telefon", width: 2 },
					{ key: "mail", label: "E-Mail", width: 3 },
					{ key: "deputy", label: "Vertretung", width: 2 },
				],
			},
			{
				key: "werkzeuge",
				title: "Freigabeliste privilegierter Werkzeuge",
				match:
					/privilegierte(r|n)? werkzeug|freigabeliste|hilfsprogramm|utility/,
				columns: [
					{ key: "tool", label: "Werkzeug", width: 3 },
					{ key: "purpose", label: "Zweck", width: 4 },
					{ key: "for", label: "Freigegeben für", width: 3 },
					{ key: "at", label: "Freigegeben am", type: "date", width: 2 },
					{ key: "by", label: "Freigegeben von", width: 2 },
				],
			},
			{
				key: "kritische-funktionen",
				title: "Liste kritischer Funktionen",
				match: /kritische(r|n)? (funktion|geschäftsprozess|prozess)/,
				columns: [
					{ key: "function", label: "Funktion", width: 3 },
					{ key: "process", label: "Prozess", width: 3 },
					{ key: "why", label: "Begründung", width: 4 },
					{ key: "mtpd", label: "Max. Ausfallzeit", width: 2 },
					{ key: "owner", label: "Verantwortlich", width: 2 },
				],
			},
			{
				key: "zutrittsprotokoll",
				title: "Besucher- und Zutrittsprotokoll",
				match: /zutrittsprotokoll|besucher|zugangsprotokoll|zutrittsbuch/,
				columns: [
					{ key: "date", label: "Datum", type: "date", width: 2 },
					{ key: "person", label: "Person", width: 3 },
					{ key: "company", label: "Firma", width: 2 },
					{ key: "area", label: "Bereich", width: 2 },
					{ key: "from", label: "Von", width: 1 },
					{ key: "to", label: "Bis", width: 1 },
					{ key: "escort", label: "Begleitet von", width: 2 },
				],
			},
			{
				key: "zutritt",
				title: "Zutrittsberechtigungen",
				match:
					/zutrittsberechtig|zutrittsrecht|schließberechtig|schliessberechtig/,
				columns: [
					{ key: "person", label: "Person", width: 3 },
					{ key: "area", label: "Bereich", width: 3 },
					{ key: "from", label: "Berechtigt seit", type: "date", width: 2 },
					{ key: "to", label: "Berechtigt bis", type: "date", width: 2 },
					{ key: "by", label: "Genehmigt von", width: 2 },
				],
			},
			{
				key: "software",
				title: "Freigegebene Software",
				match: /software|whitelist|allowlist|positivliste|anwendungsliste/,
				columns: [
					{ key: "name", label: "Software", width: 3 },
					{ key: "version", label: "Version", width: 1 },
					{ key: "purpose", label: "Zweck", width: 3 },
					{ key: "license", label: "Lizenz", width: 2 },
					{ key: "at", label: "Freigegeben am", type: "date", width: 2 },
				],
			},
			{
				key: "admin-konten",
				title: "Administrative Konten",
				match:
					/admin|privilegierte(r|n)? (konten|zugäng|zugang|benutzer)|notfallkonto|break.?glass/,
				columns: [
					{ key: "account", label: "Konto", width: 2 },
					{ key: "person", label: "Person", width: 3 },
					{ key: "system", label: "System", width: 2 },
					{ key: "purpose", label: "Zweck", width: 3 },
					{
						key: "reviewed",
						label: "Zuletzt überprüft",
						type: "date",
						width: 2,
					},
				],
			},
		],
	},
	{
		key: "checkliste",
		code: "RL-CHECKLISTE",
		title: "Checkliste",
		group: "list",
		purpose:
			"Prüfpunkte mit Ergebnis und Bemerkung — vorbelegt mit den Prüffragen der gewählten Controls, frei ergänzbar.",
		basis:
			"Prüfnachweis: jeder Punkt mit Ergebnis und Bemerkung, Datum und prüfender Person.",
		evidenceType: "document",
		blocks: [
			{
				id: "head",
				kind: "fields",
				fields: [
					{ key: "subject", label: "Gegenstand", type: "text", required: true },
					datum("Geprüft am"),
					durch("Geprüft von"),
				],
			},
			{
				id: "checks",
				kind: "checklist",
				title: "Prüfpunkte",
				fromControlQuestions: true,
				required: true,
			},
			ergebnis,
			massnahmen,
		],
		signers: ["-"],
		testMethod: "inspection",
		reviewMonths: 12,
	},
	{
		key: "konfiguration",
		code: "RL-KONFIGURATION",
		title: "Konfigurationsnachweis (Soll/Ist)",
		group: "list",
		purpose:
			"Belegt Einstellungen eines Systems als Soll/Ist-Vergleich statt als Screenshot — mit Version, Stand und prüfender Person.",
		basis:
			"Nachvollziehbarer Abgleich (ISO 27001 8.9): Vorgabe, festgestellter Wert, Quelle und Datum.",
		evidenceType: "config_export",
		blocks: [
			{
				id: "head",
				kind: "fields",
				fields: [
					{ key: "system", label: "System", type: "text", required: true },
					{ key: "version", label: "Version / Build", type: "text" },
					{
						key: "env",
						label: "Umgebung",
						type: "select",
						options: ["Produktion", "Test", "Entwicklung"],
					},
					{
						key: "source",
						label: "Quelle",
						type: "text",
						placeholder: "z. B. Admin-Konsole, Gruppenrichtlinie, Export",
					},
					datum("Geprüft am"),
					durch("Geprüft von"),
				],
			},
			{
				id: "settings",
				kind: "table",
				title: "Einstellungen",
				columns: [
					{ key: "setting", label: "Einstellung", width: 3 },
					{ key: "target", label: "Soll", width: 2 },
					{ key: "actual", label: "Ist", width: 2 },
					{
						key: "met",
						label: "Erfüllt",
						type: "select",
						options: ["ja", "teilweise", "nein"],
						width: 1,
					},
				],
				required: true,
			},
			ergebnis,
			{
				id: "deviations",
				kind: "text",
				title: "Abweichungen und Begründung",
				hint: "Warum weicht etwas ab, und ist das genehmigt?",
			},
			massnahmen,
		],
		signers: ["-"],
		testMethod: "inspection",
		reviewMonths: 6,
	},
	// ── Frei ──────────────────────────────────────────────────────────────
	{
		key: "text",
		code: "RL-TEXT",
		title: "Textdokument",
		group: "free",
		purpose:
			"Freier Text mit Abschnitten — wenn kein anderer Rohling passt, z. B. eine Beschreibung des Vorgehens.",
		basis:
			"Dokumentierte Information mit Datum und verfassender Person; für Abläufe besser ein gelenktes Dokument unter Dokumente.",
		evidenceType: "document",
		blocks: [
			{
				id: "head",
				kind: "fields",
				fields: [datum(), durch("Verfasst von")],
			},
			{
				id: "sections",
				kind: "sections",
				hint: "Abschnitte mit Überschrift und Text.",
				required: true,
			},
		],
		signers: ["-"],
		reviewMonths: 12,
	},
];

export const TEMPLATE_BY_KEY: ReadonlyMap<string, EvidenceTemplate> = new Map(
	EVIDENCE_TEMPLATES.map((t) => [t.key, t]),
);

export const TEMPLATE_GROUPS: readonly { key: TemplateGroup; title: string }[] =
	[
		{ key: "protocol", title: "Protokolle" },
		{ key: "confirmation", title: "Bestätigungen" },
		{ key: "list", title: "Listen und Prüfungen" },
		{ key: "free", title: "Frei" },
	];

// Spalten einer Tabelle — bei Listen mit Vorlage die Spalten der Vorlage
export function tableColumns(
	template: EvidenceTemplate,
	block: Extract<BlockDef, { kind: "table" }>,
	preset: string | null,
): readonly ColumnDef[] {
	if (template.key === "liste" && block.id === "entries" && preset) {
		const p = template.presets?.find((x) => x.key === preset);
		if (p) return p.columns;
	}
	return block.columns;
}

export function presetOf(
	template: EvidenceTemplate,
	preset: string | null,
): ListPreset | null {
	return (preset && template.presets?.find((p) => p.key === preset)) || null;
}
