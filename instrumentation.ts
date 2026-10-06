import type { Instrumentation } from "next";

// Läuft einmal beim Start eines Server-Prozesses: Env validieren (fail fast),
// Scheduler starten. KLICK_DISABLE_JOBS=true für CI/Tests.
export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	const { validateEnv } = await import("@/lib/env");
	validateEnv();
	if (process.env.KLICK_DISABLE_JOBS === "true") return;
	const { startScheduler } = await import("@/lib/jobs/boss");
	await startScheduler();
}

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
};
