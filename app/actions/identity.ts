"use server";

import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { AuthError } from "@/lib/auth/session-rules";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { identityMsConfig } from "@/lib/identity/config";
import {
	disconnectSource,
	identitySourcesOf,
	prepareEntraConsent,
} from "@/lib/identity/service";
import { syncIdentitySource } from "@/lib/identity/sync";
import { enqueue } from "@/lib/jobs/boss";
import { IDENTITY_SYNC_SOURCE_JOB } from "@/lib/jobs/identity-sync";
import { adminConsentUrl, newNonce, sealState } from "@/lib/microsoft/consent";
import { getOrgLimiter } from "@/lib/rate-limit";
import { requirePermit } from "@/lib/security-changes/service";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	entraTenantSchema,
	identitySourceIdSchema,
} from "@/lib/validation/identity";

// Identität anbinden (Teil D): Verbinden und Trennen nur Inhaber:innen mit
// Step-up (Trennen zusätzlich Vier-Augen), Abruf mit identity:update. In
// Impersonation-Sitzungen nur lesen (Step-up ist dort nie frisch, identity
// steht in IMPERSONATION_READ_ONLY).

const PATH = "/einstellungen";

async function ownerStepUp(): Promise<
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

// Freigabe-Link für „Klick Identität“ im Tenant der Kundin (1 h gültig)
async function startEntraConsentImpl(
	input: unknown,
): Promise<ActionResult<{ url: string }>> {
	const g = await ownerStepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const config = identityMsConfig();
	if (!config) return { ok: false, error: "identity_not_configured" };
	const parsed = entraTenantSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const e = env();
	const nonce = newNonce();
	const now = new Date();
	const r = await mutateOrg(toOrgCtx(c), async (tx) => {
		const p = await prepareEntraConsent(
			tx,
			{ orgId: c.orgId, userId: c.userId },
			{ tenant: parsed.data.tenant, nonce, now },
		);
		return { result: p.expiresAt, audit: p.audit };
	});
	const state = sealState(
		"identity-consent",
		c.orgId,
		nonce,
		r.getTime(),
		e.BETTER_AUTH_SECRET,
	);
	revalidatePath(PATH);
	return {
		ok: true,
		data: {
			url: adminConsentUrl(
				parsed.data.tenant,
				config.clientId,
				`${e.BETTER_AUTH_URL.replace(/\/$/, "")}/api/identitaet/consent`,
				state,
			),
		},
	};
}

// „Jetzt abrufen“: in die Warteschlange (höchstens zwei gleichzeitig), ohne
// Jobs direkt; je Org gedrosselt wie Exporte
async function syncIdentityNowImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ identity: ["update"] });
	const parsed = identitySourceIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	if (!getOrgLimiter().check(c.orgId).allowed)
		return { ok: false, error: "rate_limited" };
	const sources = await readOrg(toOrgCtx(c), (tx) =>
		identitySourcesOf(tx, c.orgId),
	);
	const source = sources.find((s) => s.id === parsed.data.sourceId);
	if (!source || source.status === "pending_consent")
		return { ok: false, error: "notFound" };
	const job = { orgId: c.orgId, sourceId: source.id };
	if (!(await enqueue(IDENTITY_SYNC_SOURCE_JOB, job)))
		await syncIdentitySource(c.orgId, source.id);
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

// Trennen: Konten, Ausnahmen und Prüfungsstand der Quelle gehen mit
// (Vier-Augen, Erlaubnis identity_source_remove)
async function disconnectIdentitySourceImpl(
	input: unknown,
): Promise<ActionResult> {
	const g = await ownerStepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = identitySourceIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const permit = await requirePermit(c, {
		kind: "identity_source_remove",
		targetKey: parsed.data.sourceId,
		summary: "Konten und Anmeldungen: Verbindung trennen",
	});
	if (!permit.ok) return permit;
	const done = await mutateOrg(toOrgCtx(c), async (tx) => {
		const audit = await disconnectSource(tx, c, parsed.data.sourceId);
		return { result: Boolean(audit), audit: audit ?? [] };
	});
	if (!done) return { ok: false, error: "notFound" };
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

export const startEntraConsent = safeAction(
	"startEntraConsent",
	startEntraConsentImpl,
);
export const syncIdentityNow = safeAction(
	"syncIdentityNow",
	syncIdentityNowImpl,
);
export const disconnectIdentitySource = safeAction(
	"disconnectIdentitySource",
	disconnectIdentitySourceImpl,
);
