// Begriffe von both.money als Text-Spalten mit TS-Unions (wie Klick).

// Rollen je Org: Inhaber:in, Bedienung, Lesend. Geld bewegt keine Rolle —
// Freigaben zählt der Signer über Sicherheitsschlüssel (ADR-022).
export const MEMBER_ROLES = ["owner", "operator", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const INVITATION_STATUS = [
	"pending",
	"accepted",
	"revoked",
	"expired",
] as const;
export type InvitationStatus = (typeof INVITATION_STATUS)[number];

// Verwahrung: none = keine Hot-Konten, own = eigene Bestände (Betreiber-Org),
// licensed = Kundengelder mit CASP-Erlaubnis (setzt nur der Plattform-Admin)
export const CUSTODY_MODES = ["none", "own", "licensed"] as const;
export type CustodyMode = (typeof CUSTODY_MODES)[number];

export const NOTIFICATION_KINDS = [
	"security_alert",
	"payout",
	"address_book",
	"signer",
	"account",
	"member",
	"export",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
