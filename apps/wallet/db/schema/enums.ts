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

// „Zugang anfragen“ (Startseite): wofür, und Stand der Bearbeitung
export const ACCESS_REQUEST_PURPOSES = [
	"own",
	"payments",
	"bot",
	"other",
] as const;
export type AccessRequestPurpose = (typeof ACCESS_REQUEST_PURPOSES)[number];

export const ACCESS_REQUEST_STATUS = [
	"new",
	"contacted",
	"closed",
	"spam",
] as const;
export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUS)[number];

export const NOTIFICATION_KINDS = [
	"security_alert",
	"payout",
	"approval_requested",
	"wallet_transfer",
	"address_book",
	"signer",
	"account",
	"member",
	"export",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
