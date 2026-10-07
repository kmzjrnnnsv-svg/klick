// Jahres-Testprogramm (ISO 27001 9.1, DORA Art. 24–26, NIS2 Art. 21(2)(f),
// ZAG-MaRisk AT 7.3): Abdeckung je Jahr — BCM-Übung je kritischem Prozess,
// jährlicher Pentest, quartalsweise Rezertifizierung — und Zählwerk.

export type TestRow = {
	id: string;
	method: string;
	plannedAt: string | null;
	testedAt: Date | null;
	result: string | null;
	processId: string | null;
	nextTestAt: string | null;
};

export type ProgrammeStatus = {
	year: number;
	planned: number;
	performed: number;
	passed: number;
	failed: number;
	overduePlanned: number;
	pentestDone: boolean;
	bcmGaps: { id: string; code: string; name: string }[];
	accessReviewQuarters: boolean[]; // Q1–Q4
};

function yearOf(d: string | Date | null): number | null {
	if (!d) return null;
	return new Date(d).getUTCFullYear();
}

export function programmeStatus(
	year: number,
	tests: readonly TestRow[],
	criticalProcesses: readonly { id: string; code: string; name: string }[],
	now = new Date(),
): ProgrammeStatus {
	const inYear = tests.filter(
		(t) => yearOf(t.testedAt) === year || yearOf(t.plannedAt) === year,
	);
	const performed = inYear.filter((t) => t.testedAt !== null);
	const planned = inYear.filter((t) => t.testedAt === null && t.plannedAt);
	const today = now.toISOString().slice(0, 10);
	const bcmDone = new Set(
		performed
			.filter((t) => t.method === "bcm_exercise" && t.processId)
			.map((t) => t.processId as string),
	);
	const quarters = [false, false, false, false];
	for (const t of performed) {
		if (t.method !== "access_review" || !t.testedAt) continue;
		const q = Math.floor(new Date(t.testedAt).getUTCMonth() / 3);
		quarters[q] = true;
	}
	return {
		year,
		planned: planned.length,
		performed: performed.length,
		passed: performed.filter((t) => t.result === "pass").length,
		failed: performed.filter((t) => t.result === "fail").length,
		overduePlanned: planned.filter((t) => (t.plannedAt ?? "") < today).length,
		pentestDone: performed.some((t) => t.method === "pentest"),
		bcmGaps: criticalProcesses.filter((p) => !bcmDone.has(p.id)),
		accessReviewQuarters: quarters,
	};
}
