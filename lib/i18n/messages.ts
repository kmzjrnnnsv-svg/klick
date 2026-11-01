// Texte im Browser nur, soweit die Seite sie braucht (Leistung bei
// wachsender App): der Root-Layout reicht nur die Namespaces der Rahmen
// (Seitenleiste, Kopf, Fehlerseiten) an den Browser, jede Seite mit
// Client-Bausteinen fordert ihre eigenen über `withMessages` an
// (components/i18n/with-messages.tsx). Welche das sind, rechnet der Test
// `client-messages` aus den Importen nach.
import type de from "@/messages/de.json";

export type MessageNamespace = keyof typeof de;

/** Namespaces, die Layouts und Fehlerseiten im Browser brauchen */
export const SHELL_NAMESPACES = [
	"Announcements",
	"Auth",
	"Common",
	"Entity",
	"Errors",
	"Functions",
	"Help",
	"Nav",
	"Organisations",
] as const satisfies readonly MessageNamespace[];

export function pickMessages<M extends Record<string, unknown>>(
	messages: M,
	namespaces: readonly string[],
): Partial<M> {
	const out: Record<string, unknown> = {};
	for (const ns of namespaces) if (ns in messages) out[ns] = messages[ns];
	return out as Partial<M>;
}
