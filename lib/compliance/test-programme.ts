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
	// Notfallübung je kritischem Standort (C3)
	siteId?: string | null;
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
	// kritische Standorte ohne Notfallübung im Jahr
	siteGaps: { id: string; name: string }[];
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
	criticalSites: readonly { id: string; name: string }[] = [],
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
	const sitesDone = new Set(
		performed
			.filter((t) => t.method === "bcm_exercise" && t.siteId)
			.map((t) => t.siteId as string),
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
		siteGaps: criticalSites.filter((x) => !sitesDone.has(x.id)),
		accessReviewQuarters: quarters,
	};
}

// Fälligkeit der Notfallübung je kritischem Standort (Kalender, C3):
// zwölf Monate nach der letzten Übung, ohne Übung bis Jahresende. Standorte
// mit geplanter Übung erscheinen schon über den geplanten Test.
export function siteExerciseDue(
	criticalSites: readonly { id: string; name: string }[],
	tests: readonly TestRow[],
	now = new Date(),
): { id: string; name: string; dueAt: string; lastAt: string | null }[] {
	const out: {
		id: string;
		name: string;
		dueAt: string;
		lastAt: string | null;
	}[] = [];
	for (const site of criticalSites) {
		const exercises = tests.filter(
			(t) => t.method === "bcm_exercise" && t.siteId === site.id,
		);
		if (exercises.some((t) => !t.testedAt && t.plannedAt)) continue;
		const last = exercises
			.map((t) => t.testedAt)
			.filter((d): d is Date => d !== null)
			.sort((a, b) => b.getTime() - a.getTime())[0];
		const due = last
			? new Date(
					Date.UTC(
						last.getUTCFullYear() + 1,
						last.getUTCMonth(),
						last.getUTCDate(),
					),
				)
			: new Date(Date.UTC(now.getUTCFullYear(), 11, 31));
		out.push({
			id: site.id,
			name: site.name,
			dueAt: due.toISOString().slice(0, 10),
			lastAt: last ? last.toISOString().slice(0, 10) : null,
		});
	}
	return out;
}
