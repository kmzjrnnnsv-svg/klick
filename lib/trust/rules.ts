import type {
	Classification,
	TrustDocumentAccess,
	TrustRequestStatus,
} from "@/db/schema/enums";

// Trust Center — reine Regeln (getestet in tests/trust-rules.test.ts).

// Kleinbuchstaben, Ziffern, einzelne Bindestriche; 3–40 Zeichen. Reserviert
// sind Pfade neben /vertrauen/[slug] und Begriffe, die eine fremde Seite
// vortäuschen könnten.
const SLUG = /^[a-z0-9](?:-?[a-z0-9]){2,39}$/;
const RESERVED = new Set([
	"paket",
	"anfrage",
	"admin",
	"klick",
	"plattform",
	"unterlagen",
	"api",
]);

export function slugValid(slug: string): boolean {
	return SLUG.test(slug) && !RESERVED.has(slug);
}

// Vorschlag aus dem Kurznamen bzw. Namen der Org.
export function suggestSlug(name: string): string {
	const s = name
		.toLowerCase()
		.replace(/ä/g, "ae")
		.replace(/ö/g, "oe")
		.replace(/ü/g, "ue")
		.replace(/ß/g, "ss")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40)
		.replace(/-+$/g, "");
	return slugValid(s) ? s : `${s || "org"}-trust`.slice(0, 40);
}

// Welcher Zugriff ist für ein Dokument zulässig? Streng geheim nie,
// vertraulich nur nach NDA-Freigabe; intern und öffentlich beides (die Org
// entscheidet, was sie zeigt).
export function documentAccessAllowed(
	classification: Classification,
	access: TrustDocumentAccess,
): boolean {
	if (classification === "secret") return false;
	if (classification === "confidential") return access === "nda";
	return true;
}

export type TrustRequestState =
	| "pending"
	| "active"
	| "expired"
	| "rejected"
	| "revoked";

export function requestState(
	req: { status: TrustRequestStatus; expiresAt: Date | null },
	now = new Date(),
): TrustRequestState {
	if (req.status === "approved")
		return req.expiresAt && req.expiresAt.getTime() > now.getTime()
			? "active"
			: "expired";
	return req.status;
}

export const TRUST_ACCESS_DAYS = [7, 14, 30, 90] as const;
export type TrustAccessDays = (typeof TRUST_ACCESS_DAYS)[number];

export const DEFAULT_NDA_TEXT =
	"Ich behandle die bereitgestellten Unterlagen vertraulich, nutze sie nur zur Prüfung einer Geschäftsbeziehung mit dem Unternehmen und gebe sie nicht an Dritte weiter. Die Pflicht gilt auch nach Ende des Zugangs.";
