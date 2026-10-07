"use server";

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { auth } from "@/lib/auth/server";
import { AuthError } from "@/lib/auth/session-rules";
import { mutateOrg } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";

// SSO je Organisation (OIDC über @better-auth/sso). Nur Owner mit Step-up;
// Client-Secret geht direkt an Better Auth (verschlüsselt gespeichert) und
// taucht in keinem Audit-Eintrag auf. Domain muss per DNS-TXT verifiziert
// werden, bevor Logins möglich sind.

async function stepUp(): Promise<
	| { ok: true; ctx: Awaited<ReturnType<typeof requireStepUp>> }
	| { ok: false; error: string }
> {
	try {
		const ctx = await requireStepUp({ settings: ["update"] });
		if (ctx.orgRole !== "owner") return { ok: false, error: "forbidden" };
		return { ok: true, ctx };
	} catch (e) {
		if (e instanceof AuthError && e.code === "step_up_required")
			return { ok: false, error: "step_up_required" };
		throw e;
	}
}

function mapError(e: unknown): { ok: false; error: string } {
	if (e instanceof APIError) return { ok: false, error: e.message || "error" };
	throw e;
}

const providerIdSchema = z
	.string()
	.trim()
	.regex(/^[a-z0-9][a-z0-9-]{2,39}$/, "Kleinbuchstaben, Ziffern, Bindestrich");

export const registerSsoSchema = z.object({
	providerId: providerIdSchema,
	domain: z
		.string()
		.trim()
		.toLowerCase()
		.regex(/^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/, "z. B. firma.de"),
	issuer: z.url(),
	clientId: z.string().trim().min(1).max(200),
	clientSecret: z.string().min(1).max(500),
	discoveryEndpoint: z
		.url()
		.optional()
		.or(z.literal("").transform(() => undefined)),
	scopes: z.string().trim().max(200).optional(),
});

export async function registerSsoProvider(
	input: unknown,
): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = registerSsoSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const issuer = d.issuer.replace(/\/+$/, "");
	const scopes = (d.scopes ?? "openid email profile")
		.split(/[\s,]+/)
		.filter(Boolean);
	try {
		await auth.api.registerSSOProvider({
			body: {
				providerId: d.providerId,
				issuer,
				domain: d.domain,
				organizationId: c.orgId,
				oidcConfig: {
					issuer,
					clientId: d.clientId,
					clientSecret: d.clientSecret,
					discoveryEndpoint:
						d.discoveryEndpoint ?? `${issuer}/.well-known/openid-configuration`,
					pkce: true,
					scopes,
				},
			},
			headers: await headers(),
		});
	} catch (e) {
		return mapError(e);
	}
	await mutateOrg(toOrgCtx(c), async () => ({
		result: null,
		audit: {
			action: "sso.provider_registered",
			target: `sso_provider:${d.providerId}`,
			after: { domain: d.domain, issuer, scopes },
		},
	}));
	revalidatePath("/einstellungen");
	return { ok: true, data: undefined };
}

export async function deleteSsoProvider(
	providerId: string,
): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = providerIdSchema.safeParse(providerId);
	if (!parsed.success) return fromZod(parsed.error);
	try {
		await auth.api.deleteSSOProvider({
			body: { providerId: parsed.data },
			headers: await headers(),
		});
	} catch (e) {
		return mapError(e);
	}
	await mutateOrg(toOrgCtx(c), async () => ({
		result: null,
		audit: {
			action: "sso.provider_deleted",
			target: `sso_provider:${parsed.data}`,
		},
	}));
	revalidatePath("/einstellungen");
	return { ok: true, data: undefined };
}

// DNS-TXT-Token anfordern (Wert für _klick-sso.<domain>).
export async function requestSsoDomainVerification(
	providerId: string,
): Promise<ActionResult<{ token: string }>> {
	const g = await stepUp();
	if (!g.ok) return g;
	const parsed = providerIdSchema.safeParse(providerId);
	if (!parsed.success) return fromZod(parsed.error);
	try {
		const res = (await auth.api.requestDomainVerification({
			body: { providerId: parsed.data },
			headers: await headers(),
		})) as { domainVerificationToken?: string } | null;
		const token = res?.domainVerificationToken;
		if (!token) return { ok: false, error: "noToken" };
		return { ok: true, data: { token } };
	} catch (e) {
		return mapError(e);
	}
}

export async function verifySsoDomain(
	providerId: string,
): Promise<ActionResult> {
	const g = await stepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = providerIdSchema.safeParse(providerId);
	if (!parsed.success) return fromZod(parsed.error);
	try {
		await auth.api.verifyDomain({
			body: { providerId: parsed.data },
			headers: await headers(),
		});
	} catch (e) {
		return mapError(e);
	}
	await mutateOrg(toOrgCtx(c), async () => ({
		result: null,
		audit: {
			action: "sso.domain_verified",
			target: `sso_provider:${parsed.data}`,
		},
	}));
	revalidatePath("/einstellungen");
	return { ok: true, data: undefined };
}
