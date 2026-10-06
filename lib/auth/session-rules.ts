// Reine Sitzungsregeln (ohne Next-/DB-Importe, damit sie unit-testbar sind).
// Verwendet von lib/auth/guards.ts.

export type AuthErrorCode =
	| "unauthenticated"
	| "session_expired"
	| "mfa_enrol"
	| "mfa_required"
	| "step_up_required"
	| "no_org"
	| "access_expired"
	| "forbidden"
	| "ip_blocked";

export class AuthError extends Error {
	constructor(public readonly code: AuthErrorCode) {
		super(code);
		this.name = "AuthError";
	}
}

export const ABSOLUTE_SESSION_MS = 12 * 60 * 60 * 1000;
export const IDLE_SESSION_MS = 30 * 60 * 1000;
export const STEP_UP_MS = 10 * 60 * 1000;

export type SessionLike = {
	createdAt: Date;
	mfaVerifiedAt?: Date | null;
	lastActiveAt?: Date | null;
	stepUpAt?: Date | null;
};
export type UserLike = {
	twoFactorEnabled?: boolean | null;
	banned?: boolean | null;
};

// Wirft den passenden Code oder nichts.
export function checkSessionRules(
	ctx: { session: SessionLike; user: UserLike },
	now: number = Date.now(),
): void {
	const s = ctx.session;
	if (now - s.createdAt.getTime() > ABSOLUTE_SESSION_MS) {
		throw new AuthError("session_expired");
	}
	const lastActive = s.lastActiveAt ?? s.createdAt;
	if (now - lastActive.getTime() > IDLE_SESSION_MS) {
		throw new AuthError("session_expired");
	}
	if (ctx.user.banned) throw new AuthError("forbidden");
	if (!ctx.user.twoFactorEnabled) throw new AuthError("mfa_enrol");
	if (!s.mfaVerifiedAt) throw new AuthError("mfa_required");
}

export function isStepUpFresh(
	session: Pick<SessionLike, "stepUpAt" | "mfaVerifiedAt">,
	now: number = Date.now(),
): boolean {
	const at = session.stepUpAt ?? session.mfaVerifiedAt;
	return !!at && now - at.getTime() <= STEP_UP_MS;
}

export type OrgRole = "owner" | "editor" | "viewer" | "auditor";

const ROLE_RANK: Record<OrgRole, number> = {
	owner: 4,
	editor: 3,
	auditor: 2,
	viewer: 1,
};

// Better Auth kann mehrere Rollen kommasepariert speichern; wir nehmen die
// höchste bekannte.
export function normalizeRole(raw: string | null | undefined): OrgRole {
	const parts = (raw ?? "").split(",").map((p) => p.trim());
	let best: OrgRole = "viewer";
	for (const p of parts) {
		if (p === "admin") return "owner";
		if (p in ROLE_RANK && ROLE_RANK[p as OrgRole] > ROLE_RANK[best])
			best = p as OrgRole;
	}
	return best;
}

// Client-IP aus Proxy-Headern (nginx setzt X-Real-IP).
export function ipFromHeaders(h: Headers | undefined | null): string | null {
	if (!h) return null;
	const real = h.get("x-real-ip");
	if (real) return real.trim();
	const fwd = h.get("x-forwarded-for");
	if (fwd) return fwd.split(",")[0]?.trim() ?? null;
	return null;
}
