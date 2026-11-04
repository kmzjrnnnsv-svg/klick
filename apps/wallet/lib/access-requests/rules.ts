import type {
	AccessRequestPurpose,
	AccessRequestStatus,
} from "@wallet/db/schema/enums";

// „Zugang anfragen“ (rein, auch im Browser): Auswahl, Grenzen und
// Bot-Abwehr wie Klicks Anfrageformular. Honeypot und Mindestzeit verwerfen
// still: der Absender sieht denselben Erfolg wie ein Mensch, damit ein Bot
// nichts daraus lernt.

export const ACCESS_REQUEST_MIN_FILL_MS = 3_000;

export const ACCESS_REQUEST_LIMITS = {
	name: 120,
	company: 160,
	email: 254,
	message: 2_000,
} as const;

export const PURPOSE_LABEL: Record<AccessRequestPurpose, string> = {
	own: "Eigene Kryptowerte verwalten und überweisen",
	payments: "Zahlungen zwischen Unternehmen (Ziel, braucht Erlaubnis)",
	bot: "Automatisch handeln mit dem Bot (geplant)",
	other: "Etwas anderes",
};

export const ACCESS_REQUEST_STATUS_LABEL: Record<AccessRequestStatus, string> =
	{
		new: "Neu",
		contacted: "Kontaktiert",
		closed: "Abgeschlossen",
		spam: "Spam",
	};

export function looksAutomated(
	input: { website?: string | null; renderedAt?: number | null },
	now = Date.now(),
): boolean {
	if (input.website?.trim()) return true;
	const at = input.renderedAt;
	if (typeof at !== "number" || !Number.isFinite(at)) return true;
	// zu schnell ausgefüllt oder Zeitstempel aus der Zukunft
	return now - at < ACCESS_REQUEST_MIN_FILL_MS;
}
