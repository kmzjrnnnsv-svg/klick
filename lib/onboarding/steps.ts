// Wizard step order. Drives the progress indicator + post-step routing.
// Plain module (no "use server") so client components can import the constants.
export const ONBOARDING_STEPS = [
	"welcome",
	"basics",
	"upload",
	"skills",
	"visibility",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
