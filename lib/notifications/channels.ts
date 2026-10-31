import type { NotificationKind } from "@/db/schema/enums";
import type { NotificationChannel } from "@/db/schema/teams";

// Kanal je Benachrichtigung (T5), rein und getestet. Ohne Einstellung gilt
// Mail. Teams zählt nur, solange die Org Teams freigegeben und eingeschaltet
// hat; sonst und nach TEAMS_MAX_ATTEMPTS Fehlversuchen geht die Nachricht
// per Mail, damit nichts verloren geht.

export const TEAMS_MAX_ATTEMPTS = 3;

// Arten, die eine Person für sich einstellen kann (ohne Plattform- und
// Systemmeldungen)
export const PERSONAL_NOTIFICATION_KINDS = [
	"approval_requested",
	"approval_decided",
	"approval_overdue",
	"task_assigned",
	"mentioned",
	"acknowledgement_due",
	"review_due",
	"evidence_expiring",
	"incident_deadline",
	"management_info",
	"security_alert",
	"security_change",
	"platform_access",
	"risk_above_appetite",
	"audit_request",
	"milestone_due",
	"entity_changed",
] as const satisfies readonly NotificationKind[];

export type ChannelPrefs = {
	channels: Partial<Record<NotificationKind, NotificationChannel>>;
	digestEnabled: boolean;
};

export const DEFAULT_PREFS: ChannelPrefs = {
	channels: {},
	digestEnabled: true,
};

export function channelFor(
	prefs: ChannelPrefs | undefined,
	kind: NotificationKind,
): NotificationChannel {
	return prefs?.channels[kind] ?? "mail";
}

export type DeliveryState = {
	teamsActive: boolean;
	teamsSentAt: Date | null;
	teamsAttempts: number;
};

// Soll die Benachrichtigung in Teams zugestellt werden (noch offen)?
export function teamsWanted(
	channel: NotificationChannel,
	s: DeliveryState,
): boolean {
	return (
		s.teamsActive &&
		(channel === "teams" || channel === "both") &&
		s.teamsSentAt === null &&
		s.teamsAttempts < TEAMS_MAX_ATTEMPTS
	);
}

// Soll sie per Mail gehen? Bei „nur Teams“ erst, wenn Teams nicht geht.
export function mailWanted(
	channel: NotificationChannel,
	s: DeliveryState,
): boolean {
	if (channel !== "teams") return true;
	if (!s.teamsActive) return true;
	if (s.teamsSentAt) return false;
	return s.teamsAttempts >= TEAMS_MAX_ATTEMPTS;
}

// Tages-Mail: nur, wenn die Person sie nicht abgeschaltet hat. Sofort-Arten
// kommen immer (bzw. nach Kanal), unabhängig von der Tages-Mail.
export function digestWanted(prefs: ChannelPrefs | undefined): boolean {
	return prefs?.digestEnabled ?? true;
}

// Entscheidung der Mail-Jobs je Benachrichtigung: senden, als erledigt
// vermerken (Teams hat zugestellt bzw. Tages-Mail aus) oder warten (Teams
// versucht es noch)
export function mailDecision(
	channel: NotificationChannel,
	s: DeliveryState,
	opts: { digest: boolean; digestEnabled: boolean },
): "send" | "skip" | "wait" {
	if (!mailWanted(channel, s)) return s.teamsSentAt ? "skip" : "wait";
	if (opts.digest && !opts.digestEnabled) return "skip";
	return "send";
}
