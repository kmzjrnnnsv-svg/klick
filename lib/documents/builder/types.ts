import type { RoleFunction } from "@/db/schema/enums";

// Richtlinien-Baukasten (Teil 5, Nov 2026): eine Vorlage besteht aus
// Abschnitten; jeder Abschnitt stellt Fragen und hat Text mit Lücken
// `{{a:<schlüssel>}}` (Antwort) und `{{org}}` (Name der Organisation).
// Rein, ohne Server-Importe: Vorschau im Browser und Rendern auf dem
// Server nutzen dieselben Regeln (render.ts).

export type BuilderAnswer = string | number;
export type BuilderAnswers = Readonly<Record<string, BuilderAnswer>>;

/** Frage oder Text gilt nur, wenn die Antwort auf `key` einer der Werte ist */
export type BuilderCondition = { key: string; is: readonly string[] };

type QuestionBase = {
	key: string;
	// Frage in Du-Form, z. B. „Nach wie vielen Minuten sperrt sich der Bildschirm?“
	label: string;
	help?: string;
	// Name der Lücke im Text, solange unbeantwortet, z. B. „Bildschirmsperre“
	gap: string;
	when?: BuilderCondition;
};

export type ChoiceOption = {
	value: string;
	// Knopf, z. B. „5 Minuten“
	label: string;
	// eingesetzter Text; ohne = label
	text?: string;
};

export type ChoiceQuestion = QuestionBase & {
	kind: "choice";
	options: readonly ChoiceOption[];
	recommended?: string;
};

export type TextQuestion = QuestionBase & {
	kind: "text";
	// Beispiel als Platzhalter, z. B. „IT-Servicedesk, Telefon 0800 …“
	example: string;
	multiline?: boolean;
};

export type NumberQuestion = QuestionBase & {
	kind: "number";
	// Einheit Einzahl und Mehrzahl, z. B. ["Minute", "Minuten"]
	unit: readonly [string, string];
	min: number;
	max: number;
	recommended?: number;
};

export type FunctionQuestion = QuestionBase & {
	kind: "function";
	// vorgeschlagene Funktion; ist sie bestellt, ist sie vorbelegt
	suggest: RoleFunction;
};

export type BuilderQuestion =
	| ChoiceQuestion
	| TextQuestion
	| NumberQuestion
	| FunctionQuestion;

export type BuilderItem = string | { text: string; when?: BuilderCondition };

export type BuilderBlock =
	| { kind: "p"; text: string; when?: BuilderCondition }
	| { kind: "ul"; items: readonly BuilderItem[]; when?: BuilderCondition };

export type BuilderSection = {
	id: string;
	heading: string;
	questions: readonly BuilderQuestion[];
	blocks: readonly BuilderBlock[];
};

export type PolicyBuilder = {
	// Code der Dokument-Vorlage, z. B. „RL-ENDGERAETE“
	code: string;
	// Fassung des Baukastens; steigt, wenn sich Fragen oder Text ändern
	version: number;
	sections: readonly BuilderSection[];
};

/** Gespeicherter Stand am Dokument (`documents.builder`) */
export type { DocumentBuilderState } from "@/db/schema/enums";
