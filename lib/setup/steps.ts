// Geführte Einrichtung (D0): Schritte, Stand in org_settings.setupFlags.
// Pure, getestet (tests/setup-steps.test.ts).

// Sechs Schritte (S4, Nov 2026): Standorte stehen im Schritt „Unternehmen“;
// /einrichtung/standorte leitet dorthin um, alte Flags mit „standorte“
// werden beim Lesen übergangen.
export const SETUP_STEPS = [
	"rollen",
	"unternehmen",
	"taetigkeit",
	"it-daten",
	"rahmenwerke",
	"gap-analyse",
] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

// Schlüssel in setupFlags (Record<string, string>)
export const SETUP_FLAG = {
	started: "setupStartedAt",
	done: "setupDone",
	completed: "setupCompletedAt",
	deferred: "setupDeferredAt",
} as const;

export function isSetupStep(v: string | undefined): v is SetupStep {
	return (SETUP_STEPS as readonly string[]).includes(v ?? "");
}

export type SetupState = {
	started: boolean;
	done: SetupStep[];
	next: SetupStep | null;
	completed: boolean;
	deferred: boolean;
	// Pflichtteil bis einschließlich Rahmenwerke erledigt
	essentialsDone: boolean;
};

export function setupState(
	flags: Readonly<Record<string, string>>,
): SetupState {
	const done = (flags[SETUP_FLAG.done] ?? "").split(",").filter(isSetupStep);
	const set = new Set(done);
	const completed = Boolean(flags[SETUP_FLAG.completed]);
	return {
		started: Boolean(flags[SETUP_FLAG.started]),
		done: SETUP_STEPS.filter((s) => set.has(s)),
		next: completed ? null : (SETUP_STEPS.find((s) => !set.has(s)) ?? null),
		completed,
		deferred: Boolean(flags[SETUP_FLAG.deferred]),
		essentialsDone: set.has("rahmenwerke"),
	};
}

// Schritt als erledigt markieren → neue Flags (idempotent)
export function markStepDone(
	flags: Readonly<Record<string, string>>,
	step: SetupStep,
	now: Date,
): Record<string, string> {
	const done = new Set(setupState(flags).done);
	done.add(step);
	const out: Record<string, string> = {
		...flags,
		[SETUP_FLAG.done]: SETUP_STEPS.filter((s) => done.has(s)).join(","),
	};
	if (!out[SETUP_FLAG.started]) out[SETUP_FLAG.started] = now.toISOString();
	if (step === "gap-analyse") out[SETUP_FLAG.completed] = now.toISOString();
	return out;
}

// /heute leitet nur neue Orgs in die Einrichtung, solange der Pflichtteil
// fehlt und niemand „Später fortsetzen“ gewählt hat.
export function shouldRedirectToSetup(s: SetupState): boolean {
	return s.started && !s.essentialsDone && !s.deferred && !s.completed;
}

export function stepHref(step: SetupStep): string {
	return `/einrichtung/${step}`;
}

export function neighbours(step: SetupStep): {
	prev: SetupStep | null;
	next: SetupStep | null;
} {
	const i = SETUP_STEPS.indexOf(step);
	return {
		prev: i > 0 ? (SETUP_STEPS[i - 1] ?? null) : null,
		next: i < SETUP_STEPS.length - 1 ? (SETUP_STEPS[i + 1] ?? null) : null,
	};
}
