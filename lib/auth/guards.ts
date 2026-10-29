import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { globalDb } from "@/db";
import { member, session as sessionTable } from "@/db/auth-schema";
import { auditPlatform } from "@/lib/audit";
import {
	endImpersonations,
	impersonationAllowed,
} from "@/lib/db/platform-access";
import type { OrgCtx } from "@/lib/db/with-org";
import { type ResolvedToken, resolveToken } from "@/lib/db/with-token";
import { orgNetworkAllows } from "@/lib/net/org-network";
import { orgSuspended } from "@/lib/org/suspension";
import { adminNetworkAllows } from "./admin-network";
import { userHasPasskey } from "./endpoint-guard";
import {
	primaryMembershipCount as countPrimary,
	isExternal,
} from "./memberships";
import { memberContextFor } from "./org";
import { effectivePermissions } from "./permission-catalog";
import {
	type OrgRole,
	permissionsAllow,
	type Resource,
	type RolePermissions,
} from "./permissions";
import { type AuthSession, auth } from "./server";
import {
	AuthError as AuthErr,
	checkSessionRules as checkRules,
	effectiveMfaVerifiedAt,
	ipFromHeaders,
	normalizeRole as normRole,
	isStepUpFresh as stepUpFresh,
} from "./session-rules";

// Guards sind die EINZIGE Autorisierungsstelle. Jede exportierte Funktion in
// "use server"-Dateien und jede Server-Component-Query ruft zuerst einen Guard;
// Layout-Gates (lib/auth/gates.ts) sind nur UX (Redirects), weil Layouts bei
// Client-Navigation nicht erneut laufen.
//
// Sitzungsregeln, die Better Auth nicht selbst erzwingt:
//   • MFA-Pflicht für alle Rollen (Magic-Link/Passkey werden vom Plugin nicht gated)
//   • absolute Sitzungsdauer 12 h (Better Auth verlängert über updateAge gleitend)
//   • Idle-Timeout 30 min
//   • Step-up (erneute MFA ≤ 10 min) für sensible Aktionen
//   • Prüfer-Zugänge laufen über member_access.accessUntil ab

export {
	ABSOLUTE_SESSION_MS,
	AuthError,
	type AuthErrorCode,
	checkSessionRules,
	IDLE_SESSION_MS,
	isStepUpFresh,
	normalizeRole,
	STEP_UP_MS,
} from "./session-rules";

const TOUCH_THROTTLE_MS = 60 * 1000;

type SessionRow = AuthSession["session"] & {
	mfaVerifiedAt?: Date | null;
	mfaOrgId?: string | null;
	lastActiveAt?: Date | null;
	stepUpAt?: Date | null;
	activeOrganizationId?: string | null;
	impersonatedBy?: string | null;
};
type UserRow = AuthSession["user"] & {
	twoFactorEnabled?: boolean | null;
	hasPasskey?: boolean;
	role?: string | null;
	banned?: boolean | null;
};

export type SessionCtx = {
	session: SessionRow;
	user: UserRow;
	ip: string | null;
	userAgent: string | null;
};

export async function getSessionCtx(): Promise<SessionCtx | null> {
	const h = await headers();
	const res = await auth.api.getSession({ headers: h });
	if (!res) return null;
	const u = res.user as UserRow;
	// Ein indexierter count je Request: MFA-Regel (TOTP oder Passkey) und
	// Bestätigungsdialog (Passkey zuerst).
	const hasPasskey = await userHasPasskey(u.id);
	const session = res.session as SessionRow;
	return {
		// Firmen-MFA nur in der Org des Anbieters (effectiveMfaVerifiedAt)
		session: { ...session, mfaVerifiedAt: effectiveMfaVerifiedAt(session) },
		user: { ...u, hasPasskey },
		ip: ipFromHeaders(h),
		userAgent: h.get("user-agent"),
	};
}

function touchSession(ctx: SessionCtx): void {
	const last = ctx.session.lastActiveAt ?? ctx.session.createdAt;
	if (Date.now() - last.getTime() < TOUCH_THROTTLE_MS) return;
	const id = ctx.session.id;
	after(async () => {
		await globalDb
			.update(sessionTable)
			.set({ lastActiveAt: new Date() })
			.where(eq(sessionTable.id, id));
	});
}

export type OrgContext = {
	userId: string;
	email: string;
	name: string;
	orgId: string;
	orgRole: OrgRole;
	memberId: string;
	grants: string[];
	isPlatformAdmin: boolean;
	sessionId: string;
	ip: string | null;
	userAgent: string | null;
	stepUpFresh: boolean;
	// eingerichtete Faktoren (Step-up-Dialog bietet Passkey zuerst an)
	hasTotp: boolean;
	hasPasskey: boolean;
	// effektive Rechte: Grundrolle ∪ eigene Rollen (ADR-020) — prüfen mit
	// allows(ctx, …) aus lib/auth/permissions.ts
	permissions: RolePermissions;
	customRoles: { id: string; name: string }[];
};

export type Permission = Partial<Record<Resource, readonly string[]>>;

// Mitarbeitende (Grundrolle „employee“) sehen nur, was ein Recht ausdrücklich
// erlaubt (Richtlinien, Kenntnisnahme, freigegebene Nachweise). Stellen ohne
// Recht öffnen sich ihnen nur mit { employees: true } (Rahmen, Konto, Glocke)
// — eine neue Seite oder Action ohne Recht bleibt ihnen so verschlossen.
export type OrgGuardOptions = { employees?: boolean };

const IMPERSONATION_READ_ONLY = ["member", "invitation", "integration"];

/** Verlangt das Recht in einer Impersonation-Sitzung mehr als Lesen? */
export function impersonationDenies(perm: Permission): boolean {
	return Object.entries(perm).some(
		([resource, actions]) =>
			IMPERSONATION_READ_ONLY.includes(resource) &&
			(actions ?? []).some((a) => a !== "read"),
	);
}

export async function requireOrg(
	perm?: Permission,
	opts?: OrgGuardOptions,
): Promise<OrgContext> {
	const ctx = await getSessionCtx();
	if (!ctx) throw new AuthErr("unauthenticated");
	checkRules(ctx);

	const orgId = ctx.session.activeOrganizationId;
	if (!orgId) throw new AuthErr("no_org");
	// Als Person angemeldet (Lockbox, Härtung A3): nur solange die Org die
	// Freigabe nicht widerrufen hat und sie nicht abgelaufen ist — die
	// Sitzung selbst würde Better Auth sonst bis zu 12 h verlängern
	if (
		ctx.session.impersonatedBy &&
		!(await impersonationAllowed(
			ctx.user.id,
			orgId,
			ctx.session.impersonatedBy,
		))
	) {
		await endImpersonations(ctx.user.id);
		throw new AuthErr("unauthenticated");
	}

	const [row] = await globalDb
		.select({ id: member.id, role: member.role })
		.from(member)
		.where(
			and(eq(member.organizationId, orgId), eq(member.userId, ctx.user.id)),
		)
		.limit(1);
	if (!row) throw new AuthErr("no_org");
	// Ablauf, Grants und eigene Rollen im Org-Kontext lesen (member_access,
	// member_roles und org_roles sind FORCE RLS).
	const { access, roles } = await memberContextFor(orgId, row.id);
	const m = { ...row, grants: access?.grants ?? null };
	if (access?.accessUntil && access.accessUntil.getTime() < Date.now()) {
		throw new AuthErr("access_expired");
	}

	const orgRole = normRole(m.role);
	// IP-Liste der Organisation (Härtung A5); Externe ggf. mit eigener Liste.
	// Als Person angemeldet aus dem Admin-Netz: die Freigabe der Org gilt.
	if (
		!(ctx.session.impersonatedBy && adminNetworkAllows(ctx.ip)) &&
		!(await orgNetworkAllows(orgId, "app", ctx.ip, {
			external: isExternal(orgRole),
		}))
	)
		throw new AuthErr("network_denied");
	// Gesperrt durch den Plattform-Betrieb (Vertrag, Missbrauch): jede Fläche
	if (await orgSuspended(orgId)) throw new AuthErr("org_suspended");
	const permissions = effectivePermissions(
		orgRole,
		roles.map((r) => r.permissions),
	);
	if (perm && !permissionsAllow(permissions, perm))
		throw new AuthErr("forbidden");
	// Als Person angemeldet: Team und Integrationen nur lesen — ein
	// Einladungs-Link oder Token wirkte über das Ende der Freigabe hinaus
	// (Selbstprüfung K3)
	if (perm && ctx.session.impersonatedBy && impersonationDenies(perm))
		throw new AuthErr("forbidden");
	if (!perm && orgRole === "employee" && !opts?.employees)
		throw new AuthErr("forbidden");

	touchSession(ctx);
	return {
		userId: ctx.user.id,
		email: ctx.user.email,
		name: ctx.user.name,
		orgId,
		orgRole,
		memberId: m.id,
		grants: m.grants ?? [],
		isPlatformAdmin: ctx.user.role === "admin",
		sessionId: ctx.session.id,
		ip: ctx.ip,
		userAgent: ctx.userAgent,
		stepUpFresh: stepUpFresh(ctx.session),
		hasTotp: Boolean(ctx.user.twoFactorEnabled),
		hasPasskey: Boolean(ctx.user.hasPasskey),
		permissions,
		customRoles: roles.map((r) => ({ id: r.id, name: r.name })),
	};
}

// Sensible Aktionen (Freigaben, Exporte, Mitglieder, Einstellungen,
// vertrauliche Nachweise): zusätzlich frische MFA-Bestätigung.
export async function requireStepUp(
	perm?: Permission,
	opts?: OrgGuardOptions,
): Promise<OrgContext> {
	const c = await requireOrg(perm, opts);
	if (!c.stepUpFresh) throw new AuthErr("step_up_required");
	return c;
}

export type PlatformAdminContext = {
	userId: string;
	email: string;
	name: string;
	ip: string | null;
	userAgent: string | null;
	sessionId: string;
	stepUpFresh: boolean;
};

export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
	const ctx = await getSessionCtx();
	if (!ctx) throw new AuthErr("unauthenticated");
	checkRules(ctx);
	if (ctx.user.role !== "admin") throw new AuthErr("forbidden");

	// Nur aus dem Admin-Netz (WireGuard, ADMIN_NETWORKS; Härtung A2)
	if (!adminNetworkAllows(ctx.ip)) {
		await auditPlatform(
			{ userId: ctx.user.id, ip: ctx.ip, userAgent: ctx.userAgent },
			{ action: "admin.ip_blocked", outcome: "denied" },
		);
		throw new AuthErr("ip_blocked");
	}
	touchSession(ctx);
	return {
		userId: ctx.user.id,
		email: ctx.user.email,
		name: ctx.user.name,
		ip: ctx.ip,
		userAgent: ctx.userAgent,
		sessionId: ctx.session.id,
		stepUpFresh: stepUpFresh(ctx.session),
	};
}

// Plattform-Eingriffe in fremde Konten (Zugang zurücksetzen): zusätzlich
// frische MFA-Bestätigung.
export async function requirePlatformStepUp(): Promise<PlatformAdminContext> {
	const c = await requirePlatformAdmin();
	if (!c.stepUpFresh) throw new AuthErr("step_up_required");
	return c;
}

export function toOrgCtx(c: OrgContext): OrgCtx {
	return { orgId: c.orgId, userId: c.userId, ip: c.ip, userAgent: c.userAgent };
}

// Eigene Mitgliedschaften (ohne Berater-Zugänge, ADR-018): höchstens eine.
export async function primaryMembershipCount(userId: string): Promise<number> {
	const rows = await globalDb
		.select({ role: member.role })
		.from(member)
		.where(eq(member.userId, userId));
	return countPrimary(rows.map((r) => r.role));
}

// ── Lieferantenportal (ADR-017) ────────────────────────────────────────────
// Zugang ohne Konto: das httpOnly-Cookie trägt den Portal-Token (gesetzt von
// /api/lieferant/sitzung). Der Token gilt für genau einen Fragebogen; jede
// Portal-Action ruft zuerst diesen Guard und arbeitet danach im Org-Kontext
// des Tokens (Audit mit via: supplier_portal, Akteur ohne User).

export const PORTAL_COOKIE = "klick_portal";

export type PortalContext = {
	token: ResolvedToken;
	assessmentId: string;
	ctx: OrgCtx;
};

export async function requirePortal(): Promise<PortalContext> {
	const jar = await cookies();
	const raw = jar.get(PORTAL_COOKIE)?.value;
	if (!raw) throw new AuthErr("unauthenticated");
	const r = await resolveToken(raw, "supplier_portal");
	if (!r.ok)
		throw new AuthErr(
			r.error === "invalid" ? "unauthenticated" : "access_expired",
		);
	if (r.token.subjectType !== "assessment" || !r.token.subjectId)
		throw new AuthErr("forbidden");
	const h = await headers();
	// IP-Liste der Organisation (Härtung A5), außer das Portal ist ausgenommen
	if (
		!(await orgNetworkAllows(
			r.token.organizationId,
			"supplierPortal",
			ipFromHeaders(h),
		))
	)
		throw new AuthErr("network_denied");
	if (await orgSuspended(r.token.organizationId))
		throw new AuthErr("org_suspended");
	return {
		token: r.token,
		assessmentId: r.token.subjectId,
		ctx: {
			orgId: r.token.organizationId,
			userId: null,
			ip: ipFromHeaders(h),
			userAgent: h.get("user-agent"),
		},
	};
}
