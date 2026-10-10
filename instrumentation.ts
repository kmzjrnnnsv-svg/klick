import type { Instrumentation } from "next";

// Läuft einmal beim Start eines Server-Prozesses: Env validieren (fail fast),
// Scheduler starten. KLICK_DISABLE_JOBS=true für CI/Tests.
export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	const { validateEnv } = await import("@/lib/env");
	const env = validateEnv();
	// Ohne Zustellweg kommt in Produktion kein Anmelde-Link an (der Inhalt wird
	// bewusst nicht geloggt) — einmal laut beim Start statt still je Login.
	if (env.NODE_ENV === "production" && !env.RESEND_API_KEY && !env.SMTP_HOST) {
		const { logger } = await import("@/lib/log");
		logger.error(
			"Kein Mailversand konfiguriert (RESEND_API_KEY oder SMTP_HOST) — Anmelde-Links und Einladungen werden nicht zugestellt",
		);
	}
	if (process.env.KLICK_DISABLE_JOBS === "true") return;
	const { startScheduler } = await import("@/lib/jobs/boss");
	await startScheduler();
}

// Request-Fehler: strukturiert loggen und — wenn GLITCHTIP_DSN gesetzt ist —
// gescrubbt an GlitchTip melden (lib/observability/glitchtip.ts, kein SDK).
export const onRequestError: Instrumentation.onRequestError = async (
	err,
	request,
	context,
) => {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	const { logger } = await import("@/lib/log");
	const e = err as Error & { digest?: string };
	logger.error(
		{
			err: { message: e.message, digest: e.digest },
			path: request.path,
			method: request.method,
			routeType: context.routeType,
			routePath: context.routePath,
		},
		"request error",
	);
	// Erwartete Auth-Umleitungen sind kein Fehler für das Tracking.
	if (e.name === "AuthError") return;
	const { captureException } = await import("@/lib/observability/glitchtip");
	await captureException(e, {
		path: request.path,
		method: request.method,
		routeType: context.routeType,
		routePath: context.routePath,
	});
};
