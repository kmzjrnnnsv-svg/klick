// Etappen („Level“) und nächster Schritt — pure, getestet (tests/journey.test.ts).
// Fortschritt wird aus Zählwerten abgeleitet, nie gespeichert; Abzeichen sind
// erledigte Etappen. Keine Punkte, keine Ranglisten (seriös für Prüfer:innen).
// Texte: Journey.stage_<key>, Journey.step_<key>, Journey.why_<key>.

export const STARTED_CONTROLS_MIN = 10;
export const COVERAGE_TARGET_PCT = 80;

export type JourneyFacts = {
	memberCount: number;
	invitationCount: number;
	rolesRequired: number;
	rolesGaps: number;
	// aktive Freigabe-Workflows mit einer Stufe, die niemand besetzt
	workflowGaps: number;
	appetiteConfirmed: boolean;
	nis2?: { checked: boolean };
	tlpt?: { confirmed: boolean };
	controlsTotal: number;
	controlsWithOwner: number;
	controlsStarted: number;
	controlsImplemented: number;
	implementedWithoutEvidence: number;
	documentsValid: number;
	providers: number;
	risksAssessed: number;
	processesLinked: number;
	trainingRequirements: number;
	trainingAssignments: number;
	// niedrigste Abdeckung über die gewählten Rahmenwerke (null = keins)
	coverageMinPct: number | null;
	resolutionsRequired: number;
	resolutionsGaps: number;
	auditProgrammes: number;
	managementReviewsDone: number;
};

export type JourneyStepKey =
	| "team"
	| "roles"
	| "workflows"
	| "appetite"
	| "nis2"
	| "tlpt"
	| "owners"
	| "controls"
	| "policy"
	| "providers"
	| "risks"
	| "process"
	| "evidence"
	| "trainings"
	| "coverage"
	| "resolutions"
	| "auditProgramme"
	| "managementReview";

export type JourneyStep = {
	key: JourneyStepKey;
	done: boolean;
	href: string;
	// Schritt braucht Inhaber-Rechte (Team, Einstellungen)
	ownerOnly?: boolean;
	// Fortschritt innerhalb des Schritts (z. B. 4 von 10 Controls)
	count?: { done: number; total: number };
};

export type StageKey = "startklar" | "fundament" | "im_takt" | "pruefbereit";

export type JourneyStage = {
	key: StageKey;
	steps: JourneyStep[];
	done: boolean;
};

export type Journey = {
	stages: JourneyStage[];
	// Index der ersten nicht erledigten Etappe (= stages.length, wenn alles fertig)
	current: number;
	pct: number;
	next: (JourneyStep & { stage: StageKey }) | null;
	badges: StageKey[];
};

export function deriveJourney(f: JourneyFacts): Journey {
	const stages: JourneyStage[] = (
		[
			{
				key: "startklar",
				steps: [
					{
						key: "team",
						done: f.memberCount > 1 || f.invitationCount > 0,
						href: "/team",
						ownerOnly: true,
					},
					{
						key: "roles",
						done: f.rolesRequired > 0 && f.rolesGaps === 0,
						href: "/organisation?tab=rollen",
						count: {
							done: Math.max(0, f.rolesRequired - f.rolesGaps),
							total: f.rolesRequired,
						},
					},
					{
						key: "workflows",
						done: f.workflowGaps === 0,
						href: "/einstellungen?tab=workflows",
						ownerOnly: true,
					},
					{
						key: "appetite",
						done: f.appetiteConfirmed,
						href: "/einstellungen?tab=risk",
						ownerOnly: true,
					},
					...(f.nis2
						? [
								{
									key: "nis2" as const,
									done: f.nis2.checked,
									href: "/einstellungen?tab=frameworks",
									ownerOnly: true,
								},
							]
						: []),
					...(f.tlpt
						? [
								{
									key: "tlpt" as const,
									done: f.tlpt.confirmed,
									href: "/einstellungen?tab=frameworks",
									ownerOnly: true,
								},
							]
						: []),
				],
			},
			{
				key: "fundament",
				steps: [
					{
						key: "owners",
						done: f.controlsTotal > 0 && f.controlsWithOwner >= f.controlsTotal,
						href: "/controls?unowned=1",
						count: { done: f.controlsWithOwner, total: f.controlsTotal },
					},
					{
						key: "controls",
						done: f.controlsStarted >= STARTED_CONTROLS_MIN,
						href: "/controls",
						count: {
							done: Math.min(f.controlsStarted, STARTED_CONTROLS_MIN),
							total: STARTED_CONTROLS_MIN,
						},
					},
					{ key: "policy", done: f.documentsValid > 0, href: "/dokumente" },
					{ key: "providers", done: f.providers > 0, href: "/dienstleister" },
				],
			},
			{
				key: "im_takt",
				steps: [
					{ key: "risks", done: f.risksAssessed > 0, href: "/risiken" },
					{ key: "process", done: f.processesLinked > 0, href: "/prozesse" },
					{
						key: "evidence",
						done:
							f.controlsImplemented > 0 && f.implementedWithoutEvidence === 0,
						href: "/controls?status=implemented",
						count: {
							done: f.controlsImplemented - f.implementedWithoutEvidence,
							total: f.controlsImplemented,
						},
					},
					{
						key: "trainings",
						done: f.trainingRequirements > 0 && f.trainingAssignments > 0,
						href: "/schulungen",
					},
				],
			},
			{
				key: "pruefbereit",
				steps: [
					{
						key: "coverage",
						done:
							f.coverageMinPct !== null &&
							f.coverageMinPct >= COVERAGE_TARGET_PCT,
						href: "/rahmenwerke",
						count: {
							done: Math.min(f.coverageMinPct ?? 0, COVERAGE_TARGET_PCT),
							total: COVERAGE_TARGET_PCT,
						},
					},
					{
						key: "resolutions",
						done: f.resolutionsRequired > 0 && f.resolutionsGaps === 0,
						href: "/beschluesse?tab=pflicht",
						count: {
							done: Math.max(0, f.resolutionsRequired - f.resolutionsGaps),
							total: f.resolutionsRequired,
						},
					},
					{
						key: "auditProgramme",
						done: f.auditProgrammes > 0,
						href: "/audits?tab=programm",
					},
					{
						key: "managementReview",
						done: f.managementReviewsDone > 0,
						href: "/managementbewertung",
					},
				],
			},
		] satisfies { key: StageKey; steps: JourneyStep[] }[]
	).map((s) => ({ ...s, done: s.steps.every((x) => x.done) }));

	const all = stages.flatMap((s) => s.steps);
	const doneCount = all.filter((s) => s.done).length;
	const current = stages.findIndex((s) => !s.done);
	const at = current === -1 ? stages.length : current;
	const stage = stages[at];
	const step = stage?.steps.find((s) => !s.done);
	return {
		stages,
		current: at,
		pct: all.length === 0 ? 100 : Math.round((doneCount / all.length) * 100),
		next: stage && step ? { ...step, stage: stage.key } : null,
		badges: stages.filter((s) => s.done).map((s) => s.key),
	};
}
