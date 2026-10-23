import { redirect } from "next/navigation";
import { walletAreaEnabled } from "@/lib/wallet/area";
import {
	AuthError,
	type AuthErrorCode,
	getSessionCtx,
	type OrgContext,
	type PlatformAdminContext,
	requireOrg,
	requirePlatformAdmin,
	requireWallet,
} from "./guards";
import { listUserMemberships } from "./org";

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
		case "wallet_locked":
			return "/wallet/entsperren";
		case "wallet_disabled":
			return "/heute";
		default:
			return "/login";
	}
}

// Abgelaufener Zugang (ADR-018): gibt es andere gültige Mitgliedschaften,
// geht es zur Auswahl statt zum Login.
async function expiredTarget(): Promise<string> {
	const ctx = await getSessionCtx();
	if (ctx) {
		const list = await listUserMemberships(ctx.user.id);
		if (list.some((m) => !m.expired))
			return "/organisationen?grund=zugang-abgelaufen";
	}
	return redirectFor("access_expired");
}

// Seiten-Guards: Layout und Seite rendern in Next parallel. Wirft die Seite
// einen AuthError, bevor der Layout-Redirect greift, landet der Nutzer auf
// der Fehlerseite (z. B. direkt nach der MFA-Einrichtung ohne Organisation).
// Deshalb leiten Seiten bei Auth-Fehlern selbst um; Actions und Route-Handler
// nutzen weiterhin requireOrg()/requireStepUp() und geben Fehlercodes zurück.
export async function requireOrgPage(
	perm?: Parameters<typeof requireOrg>[0],
): Promise<OrgContext> {
	try {
		return await requireOrg(perm);
	} catch (e) {
		if (e instanceof AuthError)
			redirect(
				e.code === "access_expired"
					? await expiredTarget()
					: redirectFor(e.code),
			);
		throw e;
	}
}

// Wallet-Bereich (Layouts, Entsperr-Seite): wallet:read und für die Org
// eingeschaltet (org_settings.wallet_enabled), sonst zurück nach /heute.
export async function requireWalletAreaPage(): Promise<OrgContext> {
	const ctx = await requireOrgPage({ wallet: ["read"] });
	if (!(await walletAreaEnabled(ctx.orgId)))
		redirect(redirectFor("wallet_disabled"));
	return ctx;
}

// Wallet-Seiten: gesperrt → Entsperr-Seite mit Rückweg.
export async function requireWalletPage(
	returnTo: string,
	perm?: Parameters<typeof requireWallet>[0],
): Promise<OrgContext> {
	try {
		return await requireWallet(perm);
	} catch (e) {
		if (e instanceof AuthError && e.code === "wallet_locked")
			redirect(`/wallet/entsperren?zurueck=${encodeURIComponent(returnTo)}`);
		if (e instanceof AuthError)
			redirect(
				e.code === "access_expired"
					? await expiredTarget()
					: redirectFor(e.code),
			);
		throw e;
	}
}

export async function requirePlatformAdminPage(): Promise<PlatformAdminContext> {
	try {
		return await requirePlatformAdmin();
	} catch (e) {
		if (e instanceof AuthError) redirect(redirectFor(e.code));
		throw e;
	}
}

// (app): eingeloggt + MFA + Org, sonst Redirect.
export const gateApp = (): Promise<OrgContext> => requireOrgPage();

// (admin): Plattform-Admin.
export const gateAdmin = (): Promise<PlatformAdminContext> =>
	requirePlatformAdminPage();

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
		const target =
			e.code === "access_expired" ? await expiredTarget() : redirectFor(e.code);
		if (target.split("?")[0] !== currentPath) redirect(target);
	}
}
