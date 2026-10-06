import { redirect } from "next/navigation";
import {
	AuthError,
	type AuthErrorCode,
	getSessionCtx,
	type OrgContext,
	type PlatformAdminContext,
	requireOrg,
	requirePlatformAdmin,
} from "./guards";

// Layout-Gates: reine UX (Redirects auf den richtigen nächsten Schritt).
// Autorisierung passiert in jeder Action/Query erneut über die Guards.

export function redirectFor(code: AuthErrorCode): string {
	switch (code) {
		case "mfa_enrol":
			return "/einrichtung/2fa";
		case "mfa_required":
			return "/login/2fa";
		case "no_org":
			return "/onboarding";
		case "access_expired":
			return "/login?grund=zugang-abgelaufen";
		case "session_expired":
			return "/login?grund=sitzung-abgelaufen";
		case "forbidden":
			return "/heute";
		case "step_up_required":
			return "/login/2fa?stepup=1";
		default:
			return "/login";
	}
}

// (app): eingeloggt + MFA + Org, sonst Redirect.
export async function gateApp(): Promise<OrgContext> {
	try {
		return await requireOrg();
	} catch (e) {
		if (e instanceof AuthError) redirect(redirectFor(e.code));
		throw e;
	}
}

// (admin): Plattform-Admin.
export async function gateAdmin(): Promise<PlatformAdminContext> {
	try {
		return await requirePlatformAdmin();
	} catch (e) {
		if (e instanceof AuthError) redirect(redirectFor(e.code));
		throw e;
	}
}

// (auth): wer schon vollständig angemeldet ist, landet auf /heute; wer in
// einem Zwischenschritt steckt (MFA, Onboarding), wird dorthin geführt —
// außer er ist bereits auf dieser Seite.
export async function gateAuth(currentPath: string): Promise<void> {
	const ctx = await getSessionCtx();
	if (!ctx) return;
	try {
		await requireOrg();
		redirect("/heute");
	} catch (e) {
		if (!(e instanceof AuthError)) throw e;
		if (e.code === "unauthenticated" || e.code === "session_expired") return;
		const target = redirectFor(e.code);
		if (target.split("?")[0] !== currentPath) redirect(target);
	}
}
