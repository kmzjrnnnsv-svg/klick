import { isFunctionKey } from "@/lib/compliance/function-key";
import type {
	BuilderAnswer,
	BuilderAnswers,
	BuilderBlock,
	BuilderCondition,
	BuilderItem,
	BuilderQuestion,
	PolicyBuilder,
} from "./types";

// Richtlinien-Baukasten: Antworten in den Text einsetzen (rein). Offene
// Lücken bleiben sichtbar, z. B. „[Bildschirmsperre, z. B. 5 Minuten]“,
// damit niemand eine halbe Richtlinie für fertig hält.

export type RenderPart =
	| { t: "text"; text: string }
	| { t: "answer"; key: string; text: string }
	| { t: "gap"; key: string; text: string };

export type RenderedBlock =
	| { kind: "p"; parts: RenderPart[] }
	| { kind: "ul"; items: RenderPart[][] };

export type RenderedSection = {
	id: string;
	number: number;
	heading: string;
	blocks: RenderedBlock[];
};

export type RenderContext = {
	title: string;
	orgName: string;
	// Funktionsschlüssel → Anzeige, z. B. „Informationssicherheitsbeauftragte:r“
	functionName: (key: string) => string;
};

const GAP = /\{\{(a:[a-z0-9_]+|org)\}\}/g;

function conditionHolds(
	c: BuilderCondition | undefined,
	answers: BuilderAnswers,
): boolean {
	if (!c) return true;
	const v = answers[c.key];
	return v !== undefined && c.is.includes(String(v));
}

/** Fragen, die bei diesen Antworten gelten (Bedingungen erfüllt) */
export function visibleQuestions(
	b: PolicyBuilder,
	answers: BuilderAnswers,
): BuilderQuestion[] {
	return b.sections.flatMap((s) =>
		s.questions.filter((q) => conditionHolds(q.when, answers)),
	);
}

export function questionByKey(b: PolicyBuilder): Map<string, BuilderQuestion> {
	return new Map(
		b.sections.flatMap((s) => s.questions.map((q) => [q.key, q] as const)),
	);
}

const isAnswered = (v: BuilderAnswer | undefined): boolean =>
	v !== undefined && String(v).trim() !== "";

function numberText(q: { unit: readonly [string, string] }, n: number) {
	return `${n.toLocaleString("de-DE")} ${n === 1 ? q.unit[0] : q.unit[1]}`;
}

/** Eingesetzter Text einer Antwort; null = (noch) keine gültige Antwort */
export function answerText(
	q: BuilderQuestion,
	v: BuilderAnswer | undefined,
	ctx: Pick<RenderContext, "functionName">,
): string | null {
	if (!isAnswered(v)) return null;
	switch (q.kind) {
		case "choice": {
			const o = q.options.find((x) => x.value === String(v));
			return o ? (o.text ?? o.label) : null;
		}
		case "text":
			return String(v)
				.trim()
				.replace(/\s*\n\s*/g, " ");
		case "number": {
			const n = Number(v);
			return Number.isFinite(n) ? numberText(q, n) : null;
		}
		case "function":
			return isFunctionKey(String(v)) ? ctx.functionName(String(v)) : null;
	}
}

/** Beispiel für die offene Lücke */
export function exampleText(
	q: BuilderQuestion,
	ctx: Pick<RenderContext, "functionName">,
): string {
	switch (q.kind) {
		case "choice": {
			const o =
				q.options.find((x) => x.value === q.recommended) ?? q.options[0];
			return o ? (o.text ?? o.label) : "";
		}
		case "text":
			return q.example;
		case "number":
			return numberText(q, q.recommended ?? q.min);
		case "function":
			return ctx.functionName(q.suggest);
	}
}

function renderText(
	text: string,
	answers: BuilderAnswers,
	questions: Map<string, BuilderQuestion>,
	ctx: RenderContext,
): RenderPart[] {
	const parts: RenderPart[] = [];
	let last = 0;
	for (const m of text.matchAll(GAP)) {
		if (m.index > last)
			parts.push({ t: "text", text: text.slice(last, m.index) });
		last = m.index + m[0].length;
		const token = m[1] ?? "";
		if (token === "org") {
			parts.push({ t: "text", text: ctx.orgName });
			continue;
		}
		const key = token.slice(2);
		const q = questions.get(key);
		if (!q) {
			// verwaiste Lücke: im Test ausgeschlossen, hier sichtbar lassen
			parts.push({ t: "gap", key, text: `[${key}]` });
			continue;
		}
		// Optionen dürfen den Namen der Organisation enthalten
		const org = (x: string) => x.replaceAll("{{org}}", ctx.orgName);
		const a = answerText(q, answers[key], ctx);
		parts.push(
			a !== null
				? { t: "answer", key, text: org(a) }
				: {
						t: "gap",
						key,
						text: `[${q.gap}, z. B. ${org(exampleText(q, ctx))}]`,
					},
		);
	}
	if (last < text.length) parts.push({ t: "text", text: text.slice(last) });
	return parts;
}

const itemOf = (i: BuilderItem) => (typeof i === "string" ? { text: i } : i);

/** Antworten in die Vorlage einsetzen: Abschnitte für die Vorschau */
export function renderSections(
	b: PolicyBuilder,
	answers: BuilderAnswers,
	ctx: RenderContext,
): RenderedSection[] {
	const questions = questionByKey(b);
	return b.sections.map((s, i) => ({
		id: s.id,
		number: i + 1,
		heading: s.heading,
		blocks: s.blocks
			.filter((bl: BuilderBlock) => conditionHolds(bl.when, answers))
			.map((bl): RenderedBlock => {
				if (bl.kind === "p")
					return {
						kind: "p",
						parts: renderText(bl.text, answers, questions, ctx),
					};
				return {
					kind: "ul",
					items: bl.items
						.map(itemOf)
						.filter((it) => conditionHolds(it.when, answers))
						.map((it) => renderText(it.text, answers, questions, ctx)),
				};
			})
			.filter((bl) => bl.kind === "p" || bl.items.length > 0),
	}));
}

const plain = (parts: readonly RenderPart[]) =>
	parts.map((p) => p.text).join("");

/**
 * Ganze Richtlinie als Markdown, mit demselben Kopf wie die Vorlagen
 * (Platzhalter `{{docNumber}}` usw. ersetzt `fillDocumentTokens`).
 */
export function renderPolicy(
	b: PolicyBuilder,
	answers: BuilderAnswers,
	ctx: RenderContext,
): { sections: RenderedSection[]; markdown: string } {
	const sections = renderSections(b, answers, ctx);
	const lines = [
		`# ${ctx.title}`,
		"",
		"| Feld | Wert |",
		"|---|---|",
		"| Dokumentnummer | {{docNumber}} |",
		"| Version | {{version}} |",
		"| Eigner:in | {{owner}} |",
		"| Freigabe | {{approver}} |",
		"| Gültig ab | {{effectiveFrom}} |",
		"| Nächster Review | {{nextReviewAt}} |",
		"",
	];
	for (const s of sections) {
		lines.push(`## ${s.number}. ${s.heading}`, "");
		for (const bl of s.blocks) {
			if (bl.kind === "p") lines.push(plain(bl.parts), "");
			else lines.push(...bl.items.map((it) => `- ${plain(it)}`), "");
		}
	}
	lines.push(
		"## Rechtsgrundlagen und Controls",
		"",
		"Siehe Verknüpfungen dieses Dokuments (Controls und ihre Anforderungen je Rahmenwerk).",
		"",
	);
	return { sections, markdown: lines.join("\n") };
}

export type Completion = {
	answered: number;
	total: number;
	bySection: { id: string; answered: number; total: number }[];
};

/** „x von y beantwortet“, gesamt und je Abschnitt (nur geltende Fragen) */
export function policyCompletion(
	b: PolicyBuilder,
	answers: BuilderAnswers,
	ctx: Pick<RenderContext, "functionName"> = { functionName: (k) => k },
): Completion {
	const bySection = b.sections.map((s) => {
		const qs = s.questions.filter((q) => conditionHolds(q.when, answers));
		return {
			id: s.id,
			total: qs.length,
			answered: qs.filter((q) => answerText(q, answers[q.key], ctx) !== null)
				.length,
		};
	});
	return {
		answered: bySection.reduce((n, s) => n + s.answered, 0),
		total: bySection.reduce((n, s) => n + s.total, 0),
		bySection,
	};
}

const MAX_TEXT = 2000;

/**
 * Eingaben aus dem Browser prüfen: unbekannte Schlüssel fallen weg, Auswahl
 * nur aus den Optionen, Zahl im Bereich, Funktion nur als Schlüssel, Text
 * höchstens 2 000 Zeichen. Leere Werte löschen die Antwort.
 */
export function cleanAnswers(
	b: PolicyBuilder,
	raw: Readonly<Record<string, unknown>>,
): Record<string, BuilderAnswer> {
	const questions = questionByKey(b);
	const out: Record<string, BuilderAnswer> = {};
	for (const [key, value] of Object.entries(raw)) {
		const q = questions.get(key);
		if (!q || value === null || value === undefined) continue;
		const s = String(value).trim();
		if (s === "") continue;
		switch (q.kind) {
			case "choice":
				if (q.options.some((o) => o.value === s)) out[key] = s;
				break;
			case "text":
				out[key] = s.slice(0, MAX_TEXT);
				break;
			case "number": {
				const n = Number(s);
				if (Number.isInteger(n) && n >= q.min && n <= q.max) out[key] = n;
				break;
			}
			case "function":
				if (isFunctionKey(s)) out[key] = s;
				break;
		}
	}
	return out;
}

/**
 * Vorbelegung beim Start: Funktionsfragen mit der vorgeschlagenen Funktion,
 * wenn sie bestellt ist. Empfohlene Werte belegt Klick nie vor; sie stehen
 * als „Empfohlen“ an der Frage.
 */
export function prefillAnswers(
	b: PolicyBuilder,
	held: ReadonlySet<string>,
): Record<string, BuilderAnswer> {
	const out: Record<string, BuilderAnswer> = {};
	for (const s of b.sections)
		for (const q of s.questions)
			if (q.kind === "function" && held.has(q.suggest)) out[q.key] = q.suggest;
	return out;
}

/** Schlüssel, deren Antwort sich geändert hat (für das Audit) */
export function changedKeys(
	before: BuilderAnswers,
	after: BuilderAnswers,
): string[] {
	const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
	return [...keys].filter((k) => before[k] !== after[k]).sort();
}
