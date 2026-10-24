import type { Instrumentation } from "next";

// Start eines Server-Prozesses von both.money: Env validieren (fail fast) und
// Pflichtangaben melden. Eigene Datei, sonst übernimmt Turbopack mit der
// Repo-Wurzel als Root Klicks instrumentation.ts samt dessen Env und Jobs.
export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	const { validateWalletEnv } = await import("@wallet/lib/env");
	const env = validateWalletEnv();
	if (env.NODE_ENV !== "production") return;
	const { logger } = await import("@/lib/log");
	const { legalEntityFrom } = await import("@/lib/legal/entity");
	const legal = legalEntityFrom(env);
	if (legal.missing.length > 0)
		logger.warn(
			{ missing: legal.missing },
			"Impressum unvollständig — LEGAL_* setzen (docs/legal/impressum.md)",
		);
	if (!env.BREVO_API_KEY && !env.SMTP_HOST)
		logger.error(
			"Kein Mailversand konfiguriert (BREVO_API_KEY oder SMTP_HOST) — Einladungen werden nicht zugestellt",
		);
}

// Request-Fehler strukturiert loggen und, mit GLITCHTIP_DSN, gescrubbt melden
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
	if (e.name === "AuthError") return;
	const { captureException } = await import("@/lib/observability/glitchtip");
	await captureException(e, {
		path: request.path,
		method: request.method,
		routeType: context.routeType,
		routePath: context.routePath,
	});
};
