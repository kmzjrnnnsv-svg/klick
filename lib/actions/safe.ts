import { randomUUID } from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import { AuthError } from "@/lib/auth/session-rules";
import { logger } from "@/lib/log";
import { captureException } from "@/lib/observability/glitchtip";

// Sicherheitsnetz für Server-Actions: Eine Action, die wirft, landet im
// Client in der Error-Boundary („Da ist etwas schiefgelaufen“) — für die
// Nutzer:in ein Totalausfall der Seite. Hier wird jede unerwartete Ausnahme
// protokolliert (pino + GlitchTip, mit Referenz) und als ActionResult
// zurückgegeben, damit die Oberfläche einen Toast zeigen kann und bedienbar
// bleibt. Auth-Fehler werden auf ihren Code abgebildet (step_up_required,
// forbidden, …), redirect()/notFound() laufen unverändert weiter.
//
// Verwendung in "use server"-Dateien (nur async Funktionen dürfen
// exportiert werden — der Wrapper liefert eine):
//
//   async function upsertProcessImpl(input: unknown): Promise<ActionResult> {…}
//   export const upsertProcess = safeAction("upsertProcess", upsertProcessImpl);

export type ActionFailure = { ok: false; error: string; ref?: string };

export function safeAction<A extends unknown[], R>(
	name: string,
	fn: (...args: A) => Promise<R>,
	fallback?: (failure: ActionFailure) => R,
): (...args: A) => Promise<R> {
	return async (...args: A): Promise<R> => {
		try {
			return await fn(...args);
		} catch (e) {
			unstable_rethrow(e);
			const failure = toFailure(name, e);
			return fallback ? fallback(failure) : (failure as unknown as R);
		}
	};
}

export function toFailure(name: string, e: unknown): ActionFailure {
	if (e instanceof AuthError) return { ok: false, error: e.code };
	const ref = randomUUID().slice(0, 8);
	logger.error(
		{
			action: name,
			ref,
			err:
				e instanceof Error
					? { name: e.name, message: e.message, stack: e.stack }
					: { message: String(e) },
		},
		"server action failed",
	);
	void captureException(e, {
		routeType: "action",
		routePath: name,
		requestId: ref,
	});
	return { ok: false, error: "error", ref };
}
