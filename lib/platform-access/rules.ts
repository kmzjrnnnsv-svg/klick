// Lockbox (Härtung A3, ADR-027) — pure, getestet (tests/platform-access.test.ts).
//
// Der Plattform-Betrieb beantragt einen Zugriff je Org und Zweck; er gilt erst
// mit Freigabe einer Inhaber:in bzw. der Geschäftsleitung, immer befristet und
// jederzeit widerrufbar. Zwei Ausnahmen, beide sofort an alle Inhaber:innen
// gemeldet:
//   • Notfall (Sicherheitsvorfall, behördliche Anordnung): wirkt sofort für
//     höchstens 4 h, der Bericht ist binnen 24 h fällig.
//   • Wartezeit: Zugang zurücksetzen, wenn niemand freigeben kann (z. B. die
//     einzige Inhaber:in ist ausgesperrt) — wirkt nach 24 h, solange niemand
//     abbricht.

import type {
	PlatformAccessScope,
	PlatformAccessStatus,
	PlatformEmergencyCategory,
} from "@/db/schema/enums";
import {
	PLATFORM_ACCESS_SCOPES,
	PLATFORM_EMERGENCY_CATEGORIES,
} from "@/db/schema/enums";

const MIN = 60_000;
const HOUR = 60 * MIN;

export const MIN_DURATION_MIN = 15;
export const MAX_DURATION_MIN = 24 * 60;
export const EMERGENCY_MAX_MIN = 4 * 60;
export const WAIT_MS = 24 * HOUR;
export const REPORT_DUE_MS = 24 * HOUR;
// Unentschiedene Anträge verfallen
export const REQUEST_TTL_MS = 7 * 24 * HOUR;

/** Zwecke mit Person (impersonate, reset_access) brauchen eine Ziel-Person. */
export const SCOPE_NEEDS_TARGET: Record<PlatformAccessScope, boolean> = {
	view: false,
	impersonate: true,
	reset_access: true,
};

export type GrantLike = {
	scope: PlatformAccessScope;
	targetUserId: string | null;
	status: PlatformAccessStatus;
	requestedBy: string | null;
	requestedAt: Date;
	applyAfter: Date | null;
	expiresAt: Date | null;
	revokedAt: Date | null;
	emergencyCategory: PlatformEmergencyCategory | null;
	reportDueAt: Date | null;
	reportedAt: Date | null;
	usedAt?: Date | null;
};

/** Einmalig: eine Freigabe zum Zurücksetzen gilt für genau einen Vorgang. */
export const SCOPE_SINGLE_USE: Record<PlatformAccessScope, boolean> = {
	view: false,
	impersonate: false,
	reset_access: true,
};

export type GrantState =
	| "requested"
	| "waiting"
	| "active"
	| "expired"
	| "denied"
	| "cancelled"
	| "revoked";

export function grantState(g: GrantLike, now: Date): GrantState {
	if (g.revokedAt || g.status === "revoked") return "revoked";
	if (g.status === "denied") return "denied";
	if (g.status === "cancelled") return "cancelled";
	const t = now.getTime();
	if (g.status === "requested")
		return t - g.requestedAt.getTime() > REQUEST_TTL_MS
			? "expired"
			: "requested";
	if (g.status === "waiting" && g.applyAfter && t < g.applyAfter.getTime())
		return "waiting";
	if (!g.expiresAt || t >= g.expiresAt.getTime()) return "expired";
	return "active";
}

export const grantActive = (g: GrantLike, now: Date): boolean =>
	grantState(g, now) === "active";

/**
 * Erste gültige Freigabe für Zweck (und Person); sonst null. Mit
 * `requestedBy` nur Freigaben, die genau diese Person beantragt hat — die Org
 * gibt einer bestimmten Person frei, nicht dem ganzen Betrieb (K7).
 */
export function findActiveGrant<G extends GrantLike>(
	grants: readonly G[],
	want: {
		scope: PlatformAccessScope;
		targetUserId?: string | null;
		requestedBy?: string;
	},
	now: Date,
): G | null {
	for (const g of grants) {
		if (g.scope !== want.scope) continue;
		if (SCOPE_NEEDS_TARGET[want.scope] && g.targetUserId !== want.targetUserId)
			continue;
		if (want.requestedBy !== undefined && g.requestedBy !== want.requestedBy)
			continue;
		if (SCOPE_SINGLE_USE[want.scope] && g.usedAt) continue;
		if (grantActive(g, now)) return g;
	}
	return null;
}

export type RequestInput = {
	scope: PlatformAccessScope;
	targetUserId: string | null;
	reason: string;
	durationMinutes: number;
	emergency: PlatformEmergencyCategory | null;
	waiting: boolean;
};

export type RequestError =
	| "scope"
	| "target_required"
	| "target_forbidden"
	| "reason"
	| "duration"
	| "emergency_category"
	| "emergency_duration"
	| "emergency_scope"
	| "waiting_scope"
	| "waiting_and_emergency";

export function validateRequest(input: RequestInput): RequestError | null {
	if (!PLATFORM_ACCESS_SCOPES.includes(input.scope)) return "scope";
	const needs = SCOPE_NEEDS_TARGET[input.scope];
	if (needs && !input.targetUserId) return "target_required";
	if (!needs && input.targetUserId) return "target_forbidden";
	if (input.reason.trim().length < 10) return "reason";
	if (
		!Number.isInteger(input.durationMinutes) ||
		input.durationMinutes < MIN_DURATION_MIN ||
		input.durationMinutes > MAX_DURATION_MIN
	)
		return "duration";
	if (input.emergency && input.waiting) return "waiting_and_emergency";
	if (input.emergency) {
		if (!PLATFORM_EMERGENCY_CATEGORIES.includes(input.emergency))
			return "emergency_category";
		// Zurücksetzen übergibt das Konto (Einmal-Link an die Plattform) —
		// das wirkt über jede Notfall-Dauer hinaus, also nie ohne Freigabe
		if (input.scope === "reset_access") return "emergency_scope";
		if (input.durationMinutes > EMERGENCY_MAX_MIN) return "emergency_duration";
	}
	if (input.waiting && input.scope !== "reset_access") return "waiting_scope";
	return null;
}

/** Felder eines neuen Antrags (Status, Fristen). */
export function initialGrant(
	input: RequestInput,
	now: Date,
): Pick<
	GrantLike,
	"status" | "applyAfter" | "expiresAt" | "reportDueAt" | "emergencyCategory"
> {
	const t = now.getTime();
	const dur = input.durationMinutes * MIN;
	if (input.emergency)
		return {
			status: "emergency",
			emergencyCategory: input.emergency,
			applyAfter: null,
			expiresAt: new Date(t + Math.min(dur, EMERGENCY_MAX_MIN * MIN)),
			reportDueAt: new Date(t + REPORT_DUE_MS),
		};
	if (input.waiting)
		return {
			status: "waiting",
			emergencyCategory: null,
			applyAfter: new Date(t + WAIT_MS),
			expiresAt: new Date(t + WAIT_MS + dur),
			reportDueAt: null,
		};
	return {
		status: "requested",
		emergencyCategory: null,
		applyAfter: null,
		expiresAt: null,
		reportDueAt: null,
	};
}

export type Decider = {
	userId: string;
	/** Inhaber:in der Org oder bestellte Geschäftsleitung */
	mayDecide: boolean;
};

export type DecisionError = "not_open" | "forbidden" | "self";

/** Freigeben oder ablehnen: nur offene Anträge, nie die eigene Person. */
export function canDecide(
	g: GrantLike,
	d: Decider,
	now: Date,
): DecisionError | null {
	if (grantState(g, now) !== "requested") return "not_open";
	if (!d.mayDecide) return "forbidden";
	if (d.userId === g.requestedBy) return "self";
	// Wer selbst Ziel ist, entscheidet nicht über den Zugriff auf sich
	if (g.targetUserId && d.userId === g.targetUserId) return "self";
	return null;
}

/** Abbrechen bzw. widerrufen: offen, wartend oder aktiv; Ziel-Person darf. */
export function canRevoke(
	g: GrantLike,
	d: Decider & { isTarget?: boolean },
	now: Date,
): DecisionError | null {
	const s = grantState(g, now);
	if (s !== "requested" && s !== "waiting" && s !== "active") return "not_open";
	if (!d.mayDecide && !d.isTarget) return "forbidden";
	return null;
}

export function approvedExpiry(
	g: { durationMinutes: number },
	now: Date,
): Date {
	return new Date(now.getTime() + g.durationMinutes * MIN);
}

/** Notfall-Bericht überfällig? */
export function reportOverdue(g: GrantLike, now: Date): boolean {
	return Boolean(
		g.emergencyCategory &&
			!g.reportedAt &&
			g.reportDueAt &&
			now.getTime() > g.reportDueAt.getTime(),
	);
}

/** Restlaufzeit einer Impersonation: nie länger als die Freigabe. */
export function capSessionExpiry(
	sessionExpiresAt: Date,
	grantExpiresAt: Date,
): Date {
	return sessionExpiresAt.getTime() > grantExpiresAt.getTime()
		? grantExpiresAt
		: sessionExpiresAt;
}
