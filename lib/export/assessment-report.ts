import type { AssessmentQuestion } from "@/db/schema/enums";
import type { Measure } from "@/lib/assessments/measures";
import {
	type AnswerState,
	type AssessmentScore,
	questionVerdict,
	type Verdict,
} from "@/lib/assessments/score";

// Gap-Analyse-Bericht (Markdown): Ergebnis je Kapitel, alle Fragen mit
// Bewertung, Maßnahmenplan, Methode. Lieferobjekt für Beratung und
// Geschäftsleitung. Rein; die Route lädt Daten und kennzeichnet den Export.

const VERDICT: Record<Verdict, string> = {
	fulfilled: "erfüllt",
	unproven: "nicht belegt",
	partial: "teilweise",
	not_fulfilled: "nicht erfüllt",
	open: "offen",
	not_applicable: "nicht relevant",
};
const KIND: Record<Measure["kind"], string> = {
	implement: "umsetzen",
	clarify: "klären",
	evidence: "belegen",
};

const cell = (v: unknown) =>
	v === null || v === undefined
		? ""
		: String(v).replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ");

export function buildAssessmentMarkdown(input: {
	orgName: string;
	code: string;
	title: string;
	frameworks: string[];
	status: string;
	asOf: string | null;
	questions: readonly AssessmentQuestion[];
	answers: ReadonlyMap<
		string,
		AnswerState & { comment?: string | null; naReason?: string | null }
	>;
	score: AssessmentScore;
	measures: readonly Measure[];
	generatedAt?: Date;
}): string {
	const s = input.score;
	const at = (input.generatedAt ?? new Date()).toISOString().slice(0, 10);
	const lines: string[] = [
		`# ${input.title}`,
		"",
		"| | |",
		"|---|---|",
		`| Organisation | ${cell(input.orgName)} |`,
		`| Kennung | ${input.code} |`,
		`| Rahmenwerke | ${cell(input.frameworks.join(", "))} |`,
		`| Stichtag | ${input.asOf ?? at} |`,
		`| Stand | ${at} (${cell(input.status)}) |`,
		`| Ergebnis | **${s.score ?? "—"} / 100** |`,
		`| Beantwortet | ${s.progress.answered} von ${s.progress.total} |`,
		"",
		"## Zusammenfassung",
		"",
		`Erfüllt ${s.counts.fulfilled} · nicht belegt ${s.counts.unproven} · teilweise ${s.counts.partial} · nicht erfüllt ${s.counts.not_fulfilled} · offen ${s.counts.open} · nicht relevant ${s.counts.not_applicable}.`,
		"",
		"| Kapitel | Beantwortet | Ergebnis |",
		"|---|---|---|",
		...s.bySection.map(
			(b) =>
				`| ${cell(b.title)} | ${b.answered}/${b.total} | ${b.score ?? "—"} |`,
		),
		"",
		"## Maßnahmenplan",
		"",
	];
	if (input.measures.length === 0) lines.push("Keine offenen Maßnahmen.", "");
	else {
		lines.push(
			"| # | Art | Control | Aufwand | Deckt | Abdeckung danach | Empfehlung |",
			"|---|---|---|---|---|---|---|",
		);
		for (const [i, m] of input.measures.entries())
			lines.push(
				`| ${i + 1} | ${KIND[m.kind]} | ${m.controlCode} ${cell(m.title)} | ${m.effort} | ${m.requirements} Anf. | ${m.coverageAfter !== undefined ? `${Math.round(m.coverageAfter)} %` : ""} | ${cell(m.recommendation ?? "")} |`,
			);
		lines.push("");
	}
	lines.push("## Fragen und Bewertung", "");
	let section = "";
	for (const q of input.questions) {
		if (q.sectionCode !== section) {
			section = q.sectionCode;
			lines.push(
				`### ${q.sectionTitle}`,
				"",
				"| Control | Frage | Bewertung | Nachweise | Notiz |",
				"|---|---|---|---|---|",
			);
		}
		const a = input.answers.get(q.code);
		const note = a?.naReason ?? a?.comment ?? "";
		lines.push(
			`| ${q.code} | ${cell(q.text)} | ${VERDICT[questionVerdict(q, a)]} | ${a?.evidenceCount ?? 0} | ${cell(note)} |`,
		);
		const next = input.questions[input.questions.indexOf(q) + 1];
		if (!next || next.sectionCode !== section) lines.push("");
	}
	lines.push(
		"## Methode",
		"",
		"Eine Frage je Control der gewählten Rahmenwerke (gemeinsame Controls einmal). Wirksam ist die Bewertung durch ISB/Berater:in, sonst die Selbstauskunft: erfüllt 1, teilweise 0,5, „Ja“ ohne Nachweis 0,5 (nicht belegt), nein/offen 0; nicht relevante Fragen zählen nicht. Gewichtet nach gedeckten Anforderungen. Maßnahmen in der Reihenfolge des größten Hebels je Aufwand.",
		"",
		"_Selbsteinschätzung auf Basis der in Klick erfassten Antworten – kein Testat und keine Rechtsberatung._",
		"",
	);
	return lines.join("\n");
}
