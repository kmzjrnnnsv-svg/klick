import { INTRO_STEPS, type IntroStep } from "@/lib/wallet/intro";

// Adressen der Einführung auf Englisch (Domain-Regel), die Schritte bleiben
// die gemeinsamen Schlüssel aus lib/wallet/intro (Stand in wallet_preferences).
export const WELCOME_SLUG: Record<IntroStep, string> = {
	willkommen: "start",
	sicherheit: "security",
	netz: "network",
	konto: "account",
	kurse: "prices",
	einzahlung: "deposit",
};

export const welcomeHref = (s: IntroStep) => `/welcome/${WELCOME_SLUG[s]}`;

export function stepFromSlug(slug: string): IntroStep | null {
	return INTRO_STEPS.find((s) => WELCOME_SLUG[s] === slug) ?? null;
}
