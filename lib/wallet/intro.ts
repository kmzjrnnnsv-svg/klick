// Geführte Einführung in den Wallet-Bereich (je Person): Schritte und
// Stand in wallet_preferences (introStep = zuletzt abgeschlossener Schritt).
// Pure, getestet (tests/wallet-intro.test.ts).

export const INTRO_STEPS = [
	"willkommen",
	"sicherheit",
	"netz",
	"konto",
	"kurse",
	"einzahlung",
] as const;
export type IntroStep = (typeof INTRO_STEPS)[number];

export const isIntroStep = (v: unknown): v is IntroStep =>
	typeof v === "string" && (INTRO_STEPS as readonly string[]).includes(v);

export const introHref = (s: IntroStep) => `/wallet/einfuehrung/${s}`;

export function introNeighbours(step: IntroStep): {
	prev: IntroStep | null;
	next: IntroStep | null;
} {
	const i = INTRO_STEPS.indexOf(step);
	return {
		prev: INTRO_STEPS[i - 1] ?? null,
		next: INTRO_STEPS[i + 1] ?? null,
	};
}

// Weiter bei dem Schritt nach dem zuletzt abgeschlossenen
export function resumeStep(done: string | null): IntroStep {
	if (!isIntroStep(done)) return INTRO_STEPS[0];
	return introNeighbours(done).next ?? done;
}

// Beim ersten Öffnen von /wallet führt die Einführung — bis sie
// abgeschlossen oder auf „Später“ gestellt ist
export function shouldShowIntro(p: {
	introCompletedAt: Date | null;
	introDeferredAt: Date | null;
}): boolean {
	return !p.introCompletedAt && !p.introDeferredAt;
}

// Fortschritt, der gespeichert wird: nie rückwärts (wer zurückblättert und
// erneut „Weiter“ wählt, verliert keinen späteren Stand)
export function laterStep(current: string | null, step: IntroStep): IntroStep {
	if (!isIntroStep(current)) return step;
	return INTRO_STEPS.indexOf(step) > INTRO_STEPS.indexOf(current)
		? step
		: current;
}
