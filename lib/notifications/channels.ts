import type { NotificationKind } from "@/db/schema/enums";
import type { DeliveryChannel, StoredChannels } from "@/db/schema/teams";

// Kanäle je Benachrichtigung, rein und getestet. Jede Person wählt je Art
// Mail, Push und/oder Teams; ohne Einstellung gilt Mail. Push zählt nur mit
// mindestens einem Gerät und konfiguriertem Web Push, Teams nur, solange die
// Org Teams freigegeben und eingeschaltet hat. Geht nichts davon (nicht
// verfügbar oder TEAMS_MAX_ATTEMPTS Fehlversuche), kommt die Nachricht per
// Mail, damit nichts verloren geht.

export const TEAMS_MAX_ATTEMPTS = 3;
export const PUSH_MAX_ATTEMPTS = 3;

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
	channels: Partial<Record<NotificationKind, StoredChannels>>;
	digestEnabled: boolean;
};

export const DEFAULT_PREFS: ChannelPrefs = {
	channels: {},
	digestEnabled: true,
};

export type ChannelSet = Record<DeliveryChannel, boolean>;

const MAIL_ONLY: ChannelSet = { mail: true, push: false, teams: false };

// Gespeicherten Wert lesen; ältere Einträge „mail“ | „teams“ | „both“
export function channelSet(stored: StoredChannels | undefined): ChannelSet {
	if (stored === undefined) return MAIL_ONLY;
	if (stored === "mail") return MAIL_ONLY;
	if (stored === "teams") return { mail: false, push: false, teams: true };
	if (stored === "both") return { mail: true, push: false, teams: true };
	if (!Array.isArray(stored)) return MAIL_ONLY;
	return {
		mail: stored.includes("mail"),
		push: stored.includes("push"),
		teams: stored.includes("teams"),
	};
}

export function channelsFor(
	prefs: ChannelPrefs | undefined,
	kind: NotificationKind,
): ChannelSet {
	return channelSet(prefs?.channels[kind]);
}

// Für Formulare: gewählte Kanäle als Liste in fester Reihenfolge
export function channelList(set: ChannelSet): DeliveryChannel[] {
	return (["mail", "push", "teams"] as const).filter((c) => set[c]);
}

// Will die Person irgendwo Push bzw. Teams?
export function wantsChannel(
	prefs: ChannelPrefs | undefined,
	channel: DeliveryChannel,
): boolean {
	if (!prefs) return channel === "mail";
	return Object.values(prefs.channels).some((v) => channelSet(v)[channel]);
}

export type DeliveryState = {
	teamsActive: boolean;
	teamsSentAt: Date | null;
	teamsAttempts: number;
	// Web Push konfiguriert und mindestens ein Gerät der Person
	pushActive: boolean;
	pushSentAt: Date | null;
	pushAttempts: number;
};

export const NO_REMOTE: Omit<
	DeliveryState,
	"teamsSentAt" | "teamsAttempts" | "pushSentAt" | "pushAttempts"
> = { teamsActive: false, pushActive: false };

// Soll die Benachrichtigung in Teams zugestellt werden (noch offen)?
export function teamsWanted(set: ChannelSet, s: DeliveryState): boolean {
	return (
		s.teamsActive &&
		set.teams &&
		s.teamsSentAt === null &&
		s.teamsAttempts < TEAMS_MAX_ATTEMPTS
	);
}

// Soll sie als Push zugestellt werden (noch offen)?
export function pushWanted(set: ChannelSet, s: DeliveryState): boolean {
	return (
		s.pushActive &&
		set.push &&
		s.pushSentAt === null &&
		s.pushAttempts < PUSH_MAX_ATTEMPTS
	);
}

type RemoteState = "sent" | "pending" | "failed";

function remoteStates(set: ChannelSet, s: DeliveryState): RemoteState[] {
	const out: RemoteState[] = [];
	if (set.teams)
		out.push(
			!s.teamsActive
				? "failed"
				: s.teamsSentAt
					? "sent"
					: s.teamsAttempts >= TEAMS_MAX_ATTEMPTS
						? "failed"
						: "pending",
		);
	if (set.push)
		out.push(
			!s.pushActive
				? "failed"
				: s.pushSentAt
					? "sent"
					: s.pushAttempts >= PUSH_MAX_ATTEMPTS
						? "failed"
						: "pending",
		);
	return out;
}

// Tages-Mail: nur, wenn die Person sie nicht abgeschaltet hat. Sofort-Arten
// kommen immer (bzw. nach Kanal), unabhängig von der Tages-Mail.
export function digestWanted(prefs: ChannelPrefs | undefined): boolean {
	return prefs?.digestEnabled ?? true;
}

// Entscheidung der Mail-Jobs je Benachrichtigung: senden, als erledigt
// vermerken (anderer Kanal hat zugestellt bzw. Tages-Mail aus) oder warten
// (Push oder Teams versucht es noch). Mail gewählt = immer Mail; sonst Mail
// nur als Rückfall, wenn kein gewählter Kanal zustellen konnte.
export function mailDecision(
	set: ChannelSet,
	s: DeliveryState,
	opts: { digest: boolean; digestEnabled: boolean },
): "send" | "skip" | "wait" {
	if (!set.mail) {
		const remote = remoteStates(set, s);
		if (remote.includes("sent")) return "skip";
		if (remote.includes("pending")) return "wait";
	}
	if (opts.digest && !opts.digestEnabled) return "skip";
	return "send";
}
