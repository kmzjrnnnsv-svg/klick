import type { Instrumentation } from "next";

// Läuft einmal beim Start eines Server-Prozesses: Env validieren (fail fast),
// Scheduler starten. KLICK_DISABLE_JOBS=true für CI/Tests.
export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	const { validateEnv } = await import("@/lib/env");
	const env = validateEnv();
	// Zustellweg einmal beim Start nennen: ohne ihn kommt in Produktion kein
	// Anmelde-Link an (der Inhalt wird bewusst nicht geloggt). Prüfen mit
	// `pnpm mail:check`, Notfall-Login mit `pnpm auth:link` (deploy/README.md).
	if (env.NODE_ENV === "production") {
		const { logger } = await import("@/lib/log");
		const { diagnoseMailConfig } = await import("@/lib/mail/send");
		const mail = await diagnoseMailConfig();
		if (mail.likelyPath === "console") {
			logger.error(
				"Kein Mailversand konfiguriert (BREVO_API_KEY oder SMTP_HOST) — Anmelde-Links und Einladungen werden nicht zugestellt",
			);
		} else {
			logger.info(
				{
					path: mail.likelyPath,
					smtp: mail.hasSmtpHost
						? `${mail.smtpHost}:${mail.smtpPort ?? 587}`
						: undefined,
					from: mail.mailFrom,
				},
				"Mailversand",
			);
		}
		// Impressum (§ 5 DDG) und Mail-Pflichtangaben kommen aus LEGAL_*
		// (docs/legal/impressum.md) — fehlt etwas, ist das abmahnbar.
		const { legalEntityFrom } = await import("@/lib/legal/entity");
		const legal = legalEntityFrom(env);
		if (legal.missing.length > 0)
			logger.warn(
				{ missing: legal.missing },
				"Impressum unvollständig — LEGAL_* setzen (docs/legal/impressum.md)",
			);
		// Unsichere Standardwerte (Härtung A6): Virenscanner, Admin-Netz,
		// Parser-Dienst, offene Registrierung, Bindung an localhost. Was nicht
		// ausdrücklich in PROD_ACCEPT_RISKS steht, verhindert den Start.
		const { productionConfigReport } = await import("@/lib/env-checks");
		const report = productionConfigReport(env, {
			listenHost: process.env.HOSTNAME,
		});
		for (const w of report.warnings) logger.warn(w);
		if (report.fatal.length > 0) {
			for (const f of report.fatal) logger.fatal(f);
			throw new Error(
				`Unsichere Produktions-Konfiguration (${report.fatal.length}): ${report.fatal.join(" | ")}`,
			);
		}
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
