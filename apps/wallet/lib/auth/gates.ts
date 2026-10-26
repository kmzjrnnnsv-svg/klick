import { notFound, redirect } from "next/navigation";
import { AuthError } from "@/lib/auth/session-rules";
import {
	type OrgContext,
	requireOrg,
	requirePlatformAdmin,
	requireSession,
	requireUnlocked,
	type SessionCtx,
} from "./guards";
import type { Permission } from "./permissions";

// Seiten-Varianten der Guards: AuthError → Weiterleitung statt Fehlerseite
// (Layout und Seite rendern parallel). Rückweg nur als relativer Pfad.

export function safeNext(path: string | null | undefined): string | null {
	if (!path?.startsWith("/") || path.startsWith("//")) return null;
	if (path.startsWith("/api/") || path.includes("\\")) return null;
	return path.slice(0, 300);
}

function redirectFor(e: unknown, back: string): never {
	if (!(e instanceof AuthError)) throw e;
	const next = encodeURIComponent(safeNext(back) ?? "/");
	if (e.code === "no_org") redirect("/orgs");
	// Zugangsregeln der Org (Härtung W): eigene Seite mit Grund und Ausweg
	if (e.code === "network_denied") redirect("/blocked?reason=network");
	if (e.code === "security_key_required")
		redirect("/blocked?reason=security-key");
	if (e.code === "ip_blocked") redirect("/blocked?reason=admin-network");
	if (e.code === "wallet_locked" || e.code === "step_up_required")
		redirect(`/unlock?next=${next}`);
	if (e.code === "forbidden") notFound();
	redirect(`/login?next=${next}`);
}

// Für Seiten, die abgemeldet etwas anderes zeigen (Startseite „/“): gültige
// Sitzung oder null — abgelaufene Sitzungen zählen als abgemeldet
export async function sessionOrNull(): Promise<SessionCtx | null> {
	try {
		return await requireSession();
	} catch (e) {
		if (e instanceof AuthError) return null;
		throw e;
	}
}

export async function requireSessionPage(back = "/"): Promise<SessionCtx> {
	try {
		return await requireSession();
	} catch (e) {
		redirectFor(e, back);
	}
}

export async function requireOrgPage(
	back = "/",
	perm?: Permission,
): Promise<OrgContext> {
	try {
		return await requireOrg(perm);
	} catch (e) {
		redirectFor(e, back);
	}
}

export async function requireUnlockedPage(
	back = "/",
	perm?: Permission,
): Promise<OrgContext> {
	try {
		return await requireUnlocked(perm);
	} catch (e) {
		redirectFor(e, back);
	}
}

export async function requirePlatformAdminPage(
	back = "/",
): Promise<SessionCtx> {
	try {
		return await requirePlatformAdmin();
	} catch (e) {
		redirectFor(e, back);
	}
}
