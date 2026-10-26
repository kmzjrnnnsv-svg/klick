import { db } from "@wallet/db";
import { session as sessionTable } from "@wallet/db/auth-schema";
import type { MemberRole } from "@wallet/db/schema/enums";
import { walletEnv } from "@wallet/lib/env";
import { orgAccessPolicy } from "@wallet/lib/orgs/access";
import { walletNetworkAllows } from "@wallet/lib/orgs/access-policy";
import { listMemberships } from "@wallet/lib/orgs/memberships";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";
import {
	AuthError,
	checkSessionRules,
	ipFromHeaders,
	isStepUpFresh,
	isWalletUnlocked,
} from "@/lib/auth/session-rules";
import { ipInRanges, parseRanges } from "@/lib/net/ip";
import { passkeyCount } from "./endpoint-guard";
import { type Permission, roleAllows } from "./permissions";
import { userOnlyDeviceBound } from "./security-keys";
import { type AuthSession, auth } from "./server";

// Guards von both.money: jede Action/Query ruft zuerst einen davon. Regeln
// wie Klick (lib/auth/session-rules.ts): absolut 12 h, Idle 30 min, Step-up
// 10 min, entsperrt 15 min ab Passkey (Aktivität verlängert nicht).

export { AuthError } from "@/lib/auth/session-rules";

const TOUCH_THROTTLE_MS = 60 * 1000;

type SessionRow = AuthSession["session"] & {
	activeOrgId?: string | null;
	mfaVerifiedAt?: Date | null;
	lastActiveAt?: Date | null;
	stepUpAt?: Date | null;
	unlockedAt?: Date | null;
	unlockOrgId?: string | null;
};
type UserRow = AuthSession["user"] & { role?: string | null };

export type SessionCtx = {
	session: SessionRow;
	user: UserRow & { hasPasskey: boolean };
	ip: string | null;
	userAgent: string | null;
};

export async function getSessionCtx(): Promise<SessionCtx | null> {
	const h = await headers();
	const res = await auth.api.getSession({ headers: h });
	if (!res) return null;
	const u = res.user as UserRow;
	return {
		session: res.session as SessionRow,
		user: { ...u, hasPasskey: (await passkeyCount(u.id)) > 0 },
		ip: ipFromHeaders(h),
		userAgent: h.get("user-agent"),
	};
}

function touchSession(ctx: SessionCtx): void {
	const last = ctx.session.lastActiveAt ?? ctx.session.createdAt;
	if (Date.now() - last.getTime() < TOUCH_THROTTLE_MS) return;
	const id = ctx.session.id;
	after(async () => {
		await db
			.update(sessionTable)
			.set({ lastActiveAt: new Date() })
			.where(eq(sessionTable.id, id));
	});
}

// Angemeldet und Sitzungsregeln erfüllt (ohne Org)
export async function requireSession(): Promise<SessionCtx> {
	const ctx = await getSessionCtx();
	if (!ctx) throw new AuthError("unauthenticated");
	checkSessionRules(ctx);
	return ctx;
}

export type OrgContext = {
	userId: string;
	email: string;
	name: string;
	orgId: string;
	orgName: string;
	role: MemberRole;
	memberId: string;
	isPlatformAdmin: boolean;
	sessionId: string;
	ip: string | null;
	userAgent: string | null;
	stepUpFresh: boolean;
	unlocked: boolean;
	unlockedAt: Date | null;
};

export async function requireOrg(perm?: Permission): Promise<OrgContext> {
	const ctx = await requireSession();
	const orgId = ctx.session.activeOrgId;
	if (!orgId) throw new AuthError("no_org");
	const m = (await listMemberships(ctx.user.id)).find((x) => x.orgId === orgId);
	if (!m) throw new AuthError("no_org");
	// Zugangsregeln der Org (Härtung W): IP-Liste, nur Sicherheitsschlüssel.
	// Netz zuerst — wer von außen kommt, erfährt nichts über die Konten.
	const policy = await orgAccessPolicy(orgId);
	if (!walletNetworkAllows(policy, ctx.ip))
		throw new AuthError("network_denied");
	if (policy.securityKeysOnly && !(await userOnlyDeviceBound(ctx.user.id)))
		throw new AuthError("security_key_required");
	if (perm && !roleAllows(m.role, perm)) throw new AuthError("forbidden");
	touchSession(ctx);
	return {
		userId: ctx.user.id,
		email: ctx.user.email,
		name: ctx.user.name,
		orgId,
		orgName: m.name,
		role: m.role,
		memberId: m.memberId,
		isPlatformAdmin: ctx.user.role === "admin",
		sessionId: ctx.session.id,
		ip: ctx.ip,
		userAgent: ctx.userAgent,
		stepUpFresh: isStepUpFresh(ctx.session),
		unlocked: isWalletUnlocked(
			{
				walletUnlockedAt: ctx.session.unlockedAt ?? null,
				walletUnlockOrgId: ctx.session.unlockOrgId ?? null,
			},
			orgId,
		),
		unlockedAt: ctx.session.unlockedAt ?? null,
	};
}

// Kontext für readOrg/mutateOrg aus dem Guard-Ergebnis
export function toOrgCtx(c: OrgContext): {
	orgId: string;
	userId: string;
	ip: string | null;
	userAgent: string | null;
} {
	return { orgId: c.orgId, userId: c.userId, ip: c.ip, userAgent: c.userAgent };
}

export async function requireStepUp(perm?: Permission): Promise<OrgContext> {
	const c = await requireOrg(perm);
	if (!c.stepUpFresh) throw new AuthError("step_up_required");
	return c;
}

// Wallet-Daten nur entsperrt (Passkey, 15 min, in dieser Org)
export async function requireUnlocked(
	perm: Permission = "wallet:read",
): Promise<OrgContext> {
	const c = await requireOrg(perm);
	if (!c.unlocked) throw new AuthError("wallet_locked");
	return c;
}

// Plattform-Verwaltung nur aus dem Admin-Netz (WALLET_ADMIN_NETWORKS,
// WireGuard wg-admin, Härtung A2/W). Leer = keine Einschränkung nur außerhalb
// von Produktion; in Produktion und bei einer Liste ohne gültiges Netz ist
// die Verwaltung im Browser gesperrt (fail closed, Selbstprüfung B6) — sie
// läuft ohnehin am Terminal (pnpm wallet:admin).
export function walletAdminNetworkAllows(ip: string | null): boolean {
	const env = walletEnv();
	const list = env.WALLET_ADMIN_NETWORKS;
	const ranges = parseRanges(list).ranges;
	if (list.length === 0) return env.NODE_ENV !== "production";
	return ipInRanges(ip, ranges);
}

export async function requirePlatformAdmin(): Promise<SessionCtx> {
	const ctx = await requireSession();
	if (ctx.user.role !== "admin") throw new AuthError("forbidden");
	if (!walletAdminNetworkAllows(ctx.ip)) throw new AuthError("ip_blocked");
	return ctx;
}
