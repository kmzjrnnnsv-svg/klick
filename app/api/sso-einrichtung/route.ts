import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { samlAcsUrl, samlSpEntityId } from "@/lib/auth/sso-saml";
import { SAML_PRESETS } from "@/lib/auth/sso-saml-vendors";
import { submitProposal } from "@/lib/auth/sso-setup-link";
import { env } from "@/lib/env";
import { clientIp, ingestJson, ingestRoute } from "@/lib/security/ingest";
import { isPublicHttpsUrl } from "@/lib/validation/sso";
import { cookieToken, perIp, sameOriginJson, setupFrom } from "./_shared";

export const dynamic = "force-dynamic";

// Einrichtungslink der IT (AP10d): GET liefert die Werte dieser Verbindung
// (nichts Geheimes), POST nimmt einmal den Vorschlag der IT an. Anlegen tut
// die Inhaberin in Klick (Step-up).

export const GET = ingestRoute("sso_setup.view", async (req: Request) => {
	if (!perIp.check(clientIp(req)).allowed)
		return ingestJson(429, { error: "rate_limited" });
	const r = await setupFrom(req, cookieToken(req));
	if (!r.ok) return ingestJson(r.status, { error: r.error });
	const v = r.setup.view;
	const origin = new URL(env().BETTER_AUTH_URL).origin;
	const t = await getTranslations("SsoSetup");
	const preset = SAML_PRESETS[v.vendor];
	return ingestJson(200, {
		...v,
		vendorLabel: t(`vendor_${v.vendor}`),
		steps: t.raw(`samlSteps_${v.vendor}`) as string[],
		entityId: samlSpEntityId(origin, v.providerId),
		acsUrl: samlAcsUrl(origin, v.providerId),
		metadata: preset.metadata,
		attributes: preset.attributes,
	});
});

const proposalSchema = z
	.object({
		contactName: z.string().trim().min(2).max(120),
		metadataUrl: z
			.string()
			.trim()
			.max(2000)
			.refine((u) => !u || isPublicHttpsUrl(u))
			.optional(),
		metadataXml: z.string().trim().max(200_000).optional(),
		attributes: z
			.object({
				email: z.string().trim().max(200).optional(),
				name: z.string().trim().max(200).optional(),
				groups: z.string().trim().max(200).optional(),
			})
			.default({}),
	})
	.refine((p) => Boolean(p.metadataUrl) || Boolean(p.metadataXml), {
		message: "saml_incomplete",
	});

export const POST = ingestRoute("sso_setup.propose", async (req: Request) => {
	const ip = clientIp(req);
	if (!perIp.check(ip).allowed)
		return ingestJson(429, { error: "rate_limited" });
	if (!sameOriginJson(req)) return ingestJson(403, { error: "forbidden" });
	const r = await setupFrom(req, cookieToken(req));
	if (!r.ok) return ingestJson(r.status, { error: r.error });
	const parsed = proposalSchema.safeParse(await req.json().catch(() => null));
	if (!parsed.success) return ingestJson(400, { error: "invalid" });
	const res = await submitProposal(
		r.setup,
		{
			contactName: parsed.data.contactName,
			metadataUrl: parsed.data.metadataUrl || undefined,
			metadataXml: parsed.data.metadataXml || undefined,
			attributes: parsed.data.attributes,
		},
		{ ip: null, userAgent: req.headers.get("user-agent") },
	);
	if (!res.ok) return ingestJson(409, { error: res.error });
	return ingestJson(200, { ok: true });
});
