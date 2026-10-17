import type { InquiryStatus } from "@/db/schema/enums";
import { PRICE_ITEMS } from "@/lib/pricing/items";

// Anfragen: Auswahl der Leistung und Bot-Abwehr (pure). Honeypot und
// Mindestzeit verwerfen still — der Absender sieht denselben Erfolg wie ein
// Mensch, damit ein Bot nichts daraus lernt.

export const INQUIRY_MIN_FILL_MS = 3_000;

export const INQUIRY_SERVICES = [
	...PRICE_ITEMS.map((i) => ({ key: i.key, label: i.label })),
	{ key: "general", label: "Allgemeine Frage" },
] as const;

export type InquiryServiceKey = (typeof INQUIRY_SERVICES)[number]["key"];

export const INQUIRY_SERVICE_KEYS = INQUIRY_SERVICES.map((s) => s.key) as [
	InquiryServiceKey,
	...InquiryServiceKey[],
];

export const INQUIRY_STATUS_LABEL: Record<InquiryStatus, string> = {
	new: "Neu",
	contacted: "Kontaktiert",
	closed: "Abgeschlossen",
	spam: "Spam",
};

export const inquiryServiceLabel = (key: string) =>
	INQUIRY_SERVICES.find((s) => s.key === key)?.label ?? key;

export function looksAutomated(
	input: { website?: string | null; renderedAt?: number | null },
	now = Date.now(),
): boolean {
	if (input.website?.trim()) return true;
	const at = input.renderedAt;
	if (typeof at !== "number" || !Number.isFinite(at)) return true;
	const elapsed = now - at;
	// zu schnell ausgefüllt oder Zeitstempel aus der Zukunft
	return elapsed < INQUIRY_MIN_FILL_MS;
}
