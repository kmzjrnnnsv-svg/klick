import type { InquiryStatus } from "@/db/schema/enums";
import { PRICE_ITEMS } from "@/lib/pricing/items";

// Anfragen: Auswahl der Leistung und Bot-Abwehr (pure). Honeypot und
// Mindestzeit verwerfen still — der Absender sieht denselben Erfolg wie ein
// Mensch, damit ein Bot nichts daraus lernt.

export const INQUIRY_MIN_FILL_MS = 3_000;

export const INQUIRY_SERVICES = [
	...PRICE_ITEMS.map((i) => ({ key: i.key, label: i.label })),
	{ key: "general", label: "Allgemeine Frage" },
	// Meldeweg für öffentliche Inhalte (Trust Center), Art. 16 DSA
	{ key: "notice:content", label: "Inhalt melden (rechtswidriger Inhalt)" },
] as const;

export const NOTICE_SERVICE = "notice:content" satisfies InquiryServiceKey;

// Vorbelegung der Meldung aus ?meldung=<pfad> — nur eigene, schlichte Pfade
// (kein Fremd-Link, keine Steuerzeichen). Art. 16 Abs. 2 DSA: genaue Stelle,
// Begründung, Name/E-Mail, Erklärung nach bestem Wissen.
export function noticeMessage(path: string | undefined, origin: string) {
	if (!path || !/^\/[A-Za-z0-9/_-]{1,200}$/.test(path)) return undefined;
	return [
		`Seite: ${origin.replace(/\/+$/, "")}${path}`,
		"Welcher Inhalt genau: ",
		"Warum er rechtswidrig ist: ",
		"",
		"Ich bin in gutem Glauben davon überzeugt, dass die Angaben in dieser Meldung richtig und vollständig sind.",
	].join("\n");
}

// Meldungen zuerst (Bearbeitung „zeitnah, sorgfältig“, Art. 16 Abs. 6 DSA)
export const inquiryPriority = (service: string) =>
	service === NOTICE_SERVICE ? 0 : 1;

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
