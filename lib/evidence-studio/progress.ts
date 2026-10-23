import type { NachweisBogen } from "./sheet";

// Stand eines Normpunkts über die Bögen aller Controls, die ihn tragen
// (pure): Fragen und Nachweise, deren Quelle diese Anforderung ist.
export type RequirementProgress = {
	questions: { answered: number; total: number };
	items: { done: number; total: number; mandatoryOpen: number };
	state: "complete" | "partial" | "open";
};

export function requirementProgress(
	sheets: readonly NachweisBogen[],
	key: string,
): RequirementProgress {
	const seenQ = new Set<string>();
	const seenI = new Set<string>();
	let answered = 0;
	let qTotal = 0;
	let done = 0;
	let iTotal = 0;
	let mandatoryOpen = 0;
	for (const s of sheets) {
		for (const q of s.questions) {
			if (!q.sources.some((x) => x.key === key) || seenQ.has(q.id)) continue;
			seenQ.add(q.id);
			qTotal += 1;
			if (q.answer && q.answer.answer !== "no") answered += 1;
		}
		for (const i of s.items) {
			if (!i.sources.some((x) => x.key === key) || seenI.has(i.id)) continue;
			seenI.add(i.id);
			iTotal += 1;
			if (i.done) done += 1;
			else if (i.mandatory) mandatoryOpen += 1;
		}
	}
	const total = qTotal + iTotal;
	const ok = answered + done;
	return {
		questions: { answered, total: qTotal },
		items: { done, total: iTotal, mandatoryOpen },
		state: total > 0 && ok === total ? "complete" : ok > 0 ? "partial" : "open",
	};
}
