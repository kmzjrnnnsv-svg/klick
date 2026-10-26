import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import { count, eq } from "drizzle-orm";
import { globalDb } from "@/db";
import { passkey } from "@/db/auth-schema";
import { auditPlatform } from "@/lib/audit";
import { adminNetworkAllows } from "./admin-network";
import {
	authEndpointDecision,
	IMPERSONATION_HTTP_ALLOWED,
	isGuardedAuthPath,
} from "./endpoint-policy";
import { REG_CONTEXT, REG_COOKIE } from "./registration-link";
import {
	effectiveMfaVerifiedAt,
	ipFromHeaders,
	isStepUpFresh,
} from "./session-rules";
import { SAML_SECURITY } from "./sso-policy";
import { decodeSamlResponse, samlAlgorithmsAllowed } from "./sso-saml";

export async function passkeyCount(userId: string): Promise<number> {
	const [row] = await globalDb
		.select({ n: count() })
		.from(passkey)
		.where(eq(passkey.userId, userId));
	return Number(row?.n ?? 0);
}

export async function userHasPasskey(userId: string): Promise<boolean> {
	return (await passkeyCount(userId)) > 0;
}

const asDate = (v: unknown): Date | null =>
	v instanceof Date ? v : typeof v === "string" ? new Date(v) : null;

// hooks.before: Faktor- und Admin-Endpunkte nur nach lib/auth/endpoint-policy.ts.
// Andere Pfade laufen ohne zusätzliche Abfrage durch.
export const authBeforeHook = createAuthMiddleware(async (ctx) => {
	// SAML-ACS (Härtung A7): Signatur-/Digest-Verfahren der POST-Antwort aus
	// der Allowlist — das Plugin prüft sie nur beim Redirect-Binding
	if (ctx.path.startsWith("/sso/saml2/sp/acs")) {
		const raw = (ctx.body as { SAMLResponse?: unknown } | undefined)
			?.SAMLResponse;
		// Größe zuerst (wie das Plugin): sonst dekodiert und durchsucht diese
		// Prüfung beliebig große Antworten (Selbstprüfung S7)
		if (typeof raw === "string" && raw.length > SAML_SECURITY.maxResponseSize)
			throw new APIError("BAD_REQUEST", {
				code: "SAML_RESPONSE_TOO_LARGE",
				message: "SAML-Antwort zu groß.",
			});
		if (
			typeof raw === "string" &&
			!samlAlgorithmsAllowed(decodeSamlResponse(raw))
		)
			throw new APIError("BAD_REQUEST", {
				code: "SAML_ALGORITHM_NOT_ALLOWED",
				message: "Signaturverfahren der SAML-Antwort nicht zugelassen.",
			});
		return;
	}
	// Übrige HTTP-Pfade nur mit Sitzungs-Cookie nachsehen: eine Impersonation-
	// Sitzung darf per HTTP nur lesen, abmelden und beenden
	if (
		!isGuardedAuthPath(ctx.path) &&
		!(
			ctx.request &&
			!IMPERSONATION_HTTP_ALLOWED.has(ctx.path) &&
			ctx.getCookie(ctx.context.authCookies.sessionToken.name)
		)
	)
		return;
	const current = await getSessionFromCtx(ctx).catch(() => null);
	const s = current?.session as
		| {
				mfaVerifiedAt?: unknown;
				mfaOrgId?: string | null;
				activeOrganizationId?: string | null;
				stepUpAt?: unknown;
				impersonatedBy?: unknown;
		  }
		| undefined;
	const mfaVerifiedAt = effectiveMfaVerifiedAt({
		mfaVerifiedAt: asDate(s?.mfaVerifiedAt),
		mfaOrgId: s?.mfaOrgId,
		activeOrganizationId: s?.activeOrganizationId,
	});
	const decision = authEndpointDecision(ctx.path, {
		hasSession: Boolean(current),
		mfaVerified: Boolean(mfaVerifiedAt),
		stepUpFresh: current
			? isStepUpFresh({ stepUpAt: asDate(s?.stepUpAt), mfaVerifiedAt })
			: false,
		hasTotp: Boolean(current?.user.twoFactorEnabled),
		passkeys: current ? await passkeyCount(current.user.id) : 0,
		// Link-Registrierung: Merker im Query, Token im httpOnly-Cookie
		// (geprüft in registration.resolveUser, lib/auth/passkey-link.ts)
		hasRegistrationToken:
			ctx.query?.context === REG_CONTEXT && Boolean(ctx.getCookie(REG_COOKIE)),
		// HTTP-Anfrage: Quelle prüfen; auth.api aus dem Server: schon über
		// requirePlatformAdmin geprüft
		adminNetwork:
			!ctx.request || adminNetworkAllows(ipFromHeaders(ctx.headers)),
		impersonated: Boolean(s?.impersonatedBy),
		httpRequest: Boolean(ctx.request),
	});
	if (decision.allow) return;
	await auditPlatform(
		{
			userId: current?.user.id ?? null,
			ip: ipFromHeaders(ctx.headers),
			userAgent: ctx.headers?.get("user-agent") ?? null,
		},
		{
			action: "auth.blocked_endpoint",
			outcome: "failure",
			after: { path: ctx.path, reason: decision.code },
		},
	).catch(() => undefined);
	throw new APIError("FORBIDDEN", {
		code: decision.code.toUpperCase(),
		message: decision.code,
	});
});
