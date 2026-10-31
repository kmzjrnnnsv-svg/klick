// Admin > Sicherheit (Admin-Portal, Teil 4), rein und getestet in
// tests/admin-security.test.ts: aus Ereignissen des Plattform-Protokolls,
// Lockbox-Freigaben, Kettenprüfung, Anker und Start-Prüfung die Abschnitte
// mit Ampel. Lädt nichts selbst — Lader in lib/db/admin-security.ts.
// Nur Plattform-Metadaten: Ereignisse in der Kette einer Org bleiben hinter
// der Lockbox.
import type { Level } from "@/lib/admin/overview";
import { ANCHOR_STALE_MS } from "@/lib/admin/overview";
import {
	type GrantLike,
	grantState,
	reportOverdue,
} from "@/lib/platform-access/rules";

export const SECURITY_WINDOW_DAYS = 7;

/** Gruppen von Ereignissen, je mit den Aktionen im Plattform-Protokoll. */
export const SECURITY_EVENT_GROUPS = {
	failed_signin: ["auth.signin_failed", "auth.2fa_failed"],
	ip_blocked: ["admin.ip_blocked"],
	access_reset: [
		"auth.access_reset",
		"auth.recover_link_cli",
		"auth.login_link_cli",
	],
	impersonation: ["admin.impersonate_user"],
	sso_bypass: ["auth.sso_bypass"],
	bans: ["admin.ban_user"],
	sessions_revoked: ["admin.sessions_revoked"],
} as const satisfies Record<string, readonly string[]>;

export type SecurityEventGroup = keyof typeof SECURITY_EVENT_GROUPS;
export const SECURITY_EVENT_GROUP_KEYS = Object.keys(
	SECURITY_EVENT_GROUPS,
) as SecurityEventGroup[];
export const SECURITY_EVENT_ACTIONS: string[] = Object.values(
	SECURITY_EVENT_GROUPS,
).flat();

/** Ab so vielen Fehlversuchen in 7 Tagen gelb, ab dem Vierfachen rot. */
export const FAILED_SIGNIN_WARN = 20;

export function groupOf(action: string): SecurityEventGroup | null {
	for (const key of SECURITY_EVENT_GROUP_KEYS)
		if ((SECURITY_EVENT_GROUPS[key] as readonly string[]).includes(action))
			return key;
	return null;
}

export type SecurityEvent = {
	action: string;
	outcome: string;
	at: Date;
};

export type EventCount = {
	key: SecurityEventGroup;
	n: number;
	level: Level;
};

export function countEvents(
	events: readonly SecurityEvent[],
	now: Date,
): EventCount[] {
	const since = now.getTime() - SECURITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
	const n = new Map<SecurityEventGroup, number>();
	for (const e of events) {
		if (e.at.getTime() < since) continue;
		const g = groupOf(e.action);
		if (!g) continue;
		// Fehlversuche zählen nur als Fehlschlag; erfolgreiche 2FA ist kein Ereignis
		if (g === "failed_signin" && e.outcome === "success") continue;
		n.set(g, (n.get(g) ?? 0) + 1);
	}
	return SECURITY_EVENT_GROUP_KEYS.map((key) => {
		const count = n.get(key) ?? 0;
		let level: Level = "ok";
		if (key === "failed_signin")
			level =
				count >= FAILED_SIGNIN_WARN * 4
					? "bad"
					: count >= FAILED_SIGNIN_WARN
						? "warn"
						: "ok";
		else if (key === "ip_blocked" || key === "sso_bypass")
			level = count > 0 ? "warn" : "ok";
		return { key, n: count, level };
	});
}

export type LockboxSummary = {
	active: number;
	emergencies: number;
	reportsOverdue: number;
	requested: number;
	level: Level;
};

export function lockboxSummary(
	grants: readonly GrantLike[],
	now: Date,
): LockboxSummary {
	let active = 0;
	let emergencies = 0;
	let requested = 0;
	let reportsOverdue = 0;
	for (const g of grants) {
		const s = grantState(g, now);
		if (s === "active") {
			active++;
			if (g.emergencyCategory) emergencies++;
		}
		if (s === "requested") requested++;
		if (reportOverdue(g, now)) reportsOverdue++;
	}
	return {
		active,
		emergencies,
		reportsOverdue,
		requested,
		level: reportsOverdue > 0 ? "bad" : emergencies > 0 ? "warn" : "ok",
	};
}

export type ChainCheck = {
	at: Date;
	checked: number;
	/** „platform“ oder Org-IDs */
	broken: string[];
};

/** Ohne Prüfung länger als das gilt die Kettenprüfung als überfällig. */
export const CHAIN_CHECK_STALE_MS = 36 * 60 * 60 * 1000;

export function chainLevel(
	check: ChainCheck | null,
	now: Date,
): { level: Level; state: "none" | "ok" | "broken" | "stale" } {
	if (!check) return { level: "unknown", state: "none" };
	if (check.broken.length > 0) return { level: "bad", state: "broken" };
	if (now.getTime() - check.at.getTime() > CHAIN_CHECK_STALE_MS)
		return { level: "warn", state: "stale" };
	return { level: "ok", state: "ok" };
}

export function anchorLevel(
	anchor: { createdAt: Date; status: string } | null,
	now: Date,
): { level: Level; state: "none" | "confirmed" | "pending" | "stale" } {
	if (!anchor) return { level: "warn", state: "none" };
	if (now.getTime() - anchor.createdAt.getTime() > ANCHOR_STALE_MS)
		return { level: "bad", state: "stale" };
	return anchor.status === "confirmed"
		? { level: "ok", state: "confirmed" }
		: { level: "ok", state: "pending" };
}

/** Kurzform des Build-Stands für die Anzeige, ohne Geheimnisse. */
export function releaseLabel(build: {
	commit: string | null;
	tag: string | null;
}): string | null {
	if (build.tag && build.commit)
		return `${build.tag} (${build.commit.slice(0, 12)})`;
	if (build.tag) return build.tag;
	if (build.commit) return build.commit.slice(0, 12);
	return null;
}
