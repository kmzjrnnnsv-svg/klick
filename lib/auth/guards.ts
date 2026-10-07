import { and, count, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";
import { globalDb } from "@/db";
import { member, session as sessionTable } from "@/db/auth-schema";
import { memberAccess } from "@/db/schema";
import { auditPlatform } from "@/lib/audit";
import type { OrgCtx } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { type OrgRole, type Resource, roleAllows } from "./permissions";
import { type AuthSession, auth } from "./server";
import {
	AuthError as AuthErr,
	checkSessionRules as checkRules,
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
	lastActiveAt?: Date | null;
	stepUpAt?: Date | null;
	activeOrganizationId?: string | null;
};
type UserRow = AuthSession["user"] & {
	twoFactorEnabled?: boolean | null;
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
	return {
		session: res.session as SessionRow,
		user: res.user as UserRow,
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
};

export type Permission = Partial<Record<Resource, readonly string[]>>;

export async function requireOrg(perm?: Permission): Promise<OrgContext> {
	const ctx = await getSessionCtx();
	if (!ctx) throw new AuthErr("unauthenticated");
	checkRules(ctx);

	const orgId = ctx.session.activeOrganizationId;
	if (!orgId) throw new AuthErr("no_org");

	const [m] = await globalDb
		.select({
			id: member.id,
			role: member.role,
			accessUntil: memberAccess.accessUntil,
			grants: memberAccess.grants,
		})
		.from(member)
		.leftJoin(memberAccess, eq(memberAccess.memberId, member.id))
		.where(
			and(eq(member.organizationId, orgId), eq(member.userId, ctx.user.id)),
		)
		.limit(1);
	if (!m) throw new AuthErr("no_org");
	if (m.accessUntil && m.accessUntil.getTime() < Date.now()) {
		throw new AuthErr("access_expired");
	}

	const orgRole = normRole(m.role);
	if (perm && !roleAllows(orgRole, perm)) throw new AuthErr("forbidden");

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
	};
}

// Sensible Aktionen (Freigaben, Exporte, Mitglieder, Einstellungen,
// vertrauliche Nachweise): zusätzlich frische MFA-Bestätigung.
export async function requireStepUp(perm?: Permission): Promise<OrgContext> {
	const c = await requireOrg(perm);
	if (!c.stepUpFresh) throw new AuthErr("step_up_required");
	return c;
}

export type PlatformAdminContext = {
	userId: string;
	email: string;
	ip: string | null;
	userAgent: string | null;
	sessionId: string;
};

export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
	const ctx = await getSessionCtx();
	if (!ctx) throw new AuthErr("unauthenticated");
	checkRules(ctx);
	if (ctx.user.role !== "admin") throw new AuthErr("forbidden");

	const allow = env().ADMIN_IP_ALLOWLIST;
	if (allow.length > 0 && (!ctx.ip || !allow.includes(ctx.ip))) {
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
		ip: ctx.ip,
		userAgent: ctx.userAgent,
		sessionId: ctx.session.id,
	};
}

export function toOrgCtx(c: OrgContext): OrgCtx {
	return { orgId: c.orgId, userId: c.userId, ip: c.ip, userAgent: c.userAgent };
}

// Ein User gehört in v1 zu genau einer Organisation.
export async function membershipCount(userId: string): Promise<number> {
	const [row] = await globalDb
		.select({ n: count() })
		.from(member)
		.where(eq(member.userId, userId));
	return Number(row?.n ?? 0);
}
