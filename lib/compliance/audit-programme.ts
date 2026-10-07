// Mehrjähriges Auditprogramm (ISO 27001 9.2, ZAG-MaRisk BT 2.3 Dreijahres-
// planung, DORA Art. 6(6)): Abdeckungs-Check — jede Domäne, jeder kritische
// Prozess und jeder wesentliche Dienstleister wird innerhalb des Zyklus
// geprüft. Plus Unabhängigkeitsprüfung: Auditor:in ≠ Owner des Prüfgegenstands.

export type ProgrammeItem = {
	scopeType: "domain" | "process" | "control" | "provider" | "framework";
	scopeRef: string;
	plannedYear: number;
	auditId?: string | null;
};

export type ExpectedScope = {
	domains: readonly string[];
	processes: readonly { code: string; name: string }[];
	providers: readonly { id: string; name: string }[];
};

export type ProgrammeGap = {
	scopeType: "domain" | "process" | "provider";
	scopeRef: string;
	label: string;
};

export function programmeCoverage(
	programme: { cycleStart: string | Date; cycleYears: number },
	items: readonly ProgrammeItem[],
	expected: ExpectedScope,
): {
	cycleStartYear: number;
	cycleEndYear: number;
	covered: number;
	total: number;
	gaps: ProgrammeGap[];
	unplannedYears: number[];
} {
	const start = new Date(programme.cycleStart);
	const cycleStartYear = start.getUTCFullYear();
	const cycleEndYear = cycleStartYear + Math.max(1, programme.cycleYears) - 1;
	const inCycle = items.filter(
		(i) => i.plannedYear >= cycleStartYear && i.plannedYear <= cycleEndYear,
	);
	const has = (type: ProgrammeItem["scopeType"], ref: string) =>
		inCycle.some((i) => i.scopeType === type && i.scopeRef === ref);
	const gaps: ProgrammeGap[] = [];
	for (const d of expected.domains)
		if (!has("domain", d))
			gaps.push({ scopeType: "domain", scopeRef: d, label: d });
	for (const p of expected.processes)
		if (!has("process", p.code))
			gaps.push({
				scopeType: "process",
				scopeRef: p.code,
				label: `${p.code} ${p.name}`,
			});
	for (const p of expected.providers)
		if (!has("provider", p.id))
			gaps.push({ scopeType: "provider", scopeRef: p.id, label: p.name });
	const total =
		expected.domains.length +
		expected.processes.length +
		expected.providers.length;
	const years: number[] = [];
	for (let y = cycleStartYear; y <= cycleEndYear; y++)
		if (!inCycle.some((i) => i.plannedYear === y)) years.push(y);
	return {
		cycleStartYear,
		cycleEndYear,
		covered: total - gaps.length,
		total,
		gaps,
		unplannedYears: years,
	};
}

export type IndependenceIssue = {
	auditorUserId: string;
	kind: "control" | "process";
	ref: string;
};

// Auditor:innen dürfen nicht prüfen, was sie selbst verantworten.
export function independenceIssues(
	auditorUserIds: readonly string[],
	owned: readonly {
		kind: "control" | "process";
		ref: string;
		ownerUserId: string | null;
	}[],
): IndependenceIssue[] {
	const set = new Set(auditorUserIds);
	return owned
		.filter((o) => o.ownerUserId && set.has(o.ownerUserId))
		.map((o) => ({
			auditorUserId: o.ownerUserId as string,
			kind: o.kind,
			ref: o.ref,
		}));
}
