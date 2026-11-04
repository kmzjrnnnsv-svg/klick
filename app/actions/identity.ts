"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { orgSettings } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { AuthError } from "@/lib/auth/session-rules";
import { mutateOrg, type OrgTx, readOrg } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { identityMsConfig } from "@/lib/identity/config";
import {
	addIdentityException,
	type ManageResult,
	revokeIdentityException,
	setIdentityAccountLeft,
	setIdentityAccountMatch,
	writeIdentityPolicy,
} from "@/lib/identity/manage";
import { identityPolicyOf, identityPolicyRelaxed } from "@/lib/identity/policy";
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
import {
	requestApplyChange,
	requirePermit,
} from "@/lib/security-changes/service";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	entraConsentSchema,
	identityExceptionIdSchema,
	identityExceptionSchema,
	identityLeftSchema,
	identityMatchSchema,
	identityPolicySchema,
	identitySourceIdSchema,
} from "@/lib/validation/identity";

// Identität anbinden (Teil D): Verbinden und Trennen nur Inhaber:innen mit
// Step-up (Trennen zusätzlich Vier-Augen), Abruf mit identity:update. In
// Impersonation-Sitzungen nur lesen (Step-up ist dort nie frisch, identity
// steht in IMPERSONATION_READ_ONLY).

const PATH = "/einstellungen";
const ACCOUNTS = "/team/konten";

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
	// Hinweis zu Datenschutz und Betriebsrat muss bestätigt sein
	const parsed = entraConsentSchema.safeParse(input);
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

// ── /team/konten: Ausnahmen, Zuordnung, ausgeschieden ──────────────────

// Guard zuerst (Step-up nur, wo es lockert), dann Eingabe prüfen, dann
// Dienst in einer Transaktion mit Audit
async function manage<T>(
	opts: { stepUp: boolean; schema: z.ZodType<T>; input: unknown },
	run: (
		tx: OrgTx,
		ctx: { orgId: string; userId: string },
		data: T,
	) => Promise<ManageResult>,
	accountOf?: (data: T) => string,
): Promise<ActionResult> {
	let c: Awaited<ReturnType<typeof requireOrg>>;
	try {
		c = opts.stepUp
			? await requireStepUp({ identity: ["update"] })
			: await requireOrg({ identity: ["update"] });
	} catch (e) {
		if (e instanceof AuthError && e.code === "step_up_required")
			return { ok: false, error: "step_up_required" };
		throw e;
	}
	const parsed = opts.schema.safeParse(opts.input);
	if (!parsed.success) return fromZod(parsed.error);
	const data = parsed.data;
	const r = await mutateOrg(toOrgCtx(c), async (tx) => {
		const res = await run(tx, { orgId: c.orgId, userId: c.userId }, data);
		return { result: res, audit: res.ok ? res.audit : [] };
	});
	if (!r.ok) return r;
	revalidatePath(ACCOUNTS);
	if (accountOf) revalidatePath(`${ACCOUNTS}/${accountOf(data)}`);
	return { ok: true, data: undefined };
}

const now = () => new Date();

// Ausnahme: Step-up, nie für das eigene Konto (exceptionError)
async function addIdentityExceptionImpl(input: unknown): Promise<ActionResult> {
	return manage(
		{ stepUp: true, schema: identityExceptionSchema, input },
		(tx, ctx, d) => addIdentityException(tx, ctx, { ...d, now: now() }),
		(d) => d.accountId,
	);
}

// Zurücknehmen macht die Prüfung strenger: ohne Step-up
async function revokeIdentityExceptionImpl(
	input: unknown,
): Promise<ActionResult> {
	return manage(
		{ stepUp: false, schema: identityExceptionIdSchema, input },
		(tx, ctx, d) =>
			revokeIdentityException(tx, ctx, {
				exceptionId: d.exceptionId,
				now: now(),
			}),
	);
}

async function setIdentityMatchImpl(input: unknown): Promise<ActionResult> {
	return manage(
		{ stepUp: false, schema: identityMatchSchema, input },
		(tx, ctx, d) => setIdentityAccountMatch(tx, ctx, { ...d, now: now() }),
		(d) => d.accountId,
	);
}

async function markIdentityAccountLeftImpl(
	input: unknown,
): Promise<ActionResult> {
	return manage(
		{ stepUp: false, schema: identityLeftSchema, input },
		(tx, ctx, d) => setIdentityAccountLeft(tx, ctx, { ...d, now: now() }),
		(d) => d.accountId,
	);
}

// Schwellen: Inhaber:in mit Step-up; strenger wirkt sofort, Lockern über
// Vier-Augen bzw. 24 h Wartezeit (Art identity_policy, ADR-028)
async function saveIdentityPolicyImpl(
	input: unknown,
): Promise<ActionResult<{ status: "saved" }>> {
	const g = await ownerStepUp();
	if (!g.ok) return g;
	const c = g.ctx;
	const parsed = identityPolicySchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const raw = await readOrg(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select({ policy: orgSettings.identityPolicy })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1);
		return row?.policy ?? {};
	});
	const current = identityPolicyOf(raw);
	const next = identityPolicyOf(parsed.data);
	if (JSON.stringify(next) === JSON.stringify(current))
		return { ok: true, data: { status: "saved" } };
	// Antwort ist ein Hinweis-Code four_eyes_* (UI: isFourEyesNotice)
	if (identityPolicyRelaxed(current, next)) {
		const { staleHours: _fixed, ...value } = next;
		return requestApplyChange(c, {
			kind: "identity_policy",
			targetKey: null,
			summary: "Konten und Anmeldungen: Schwellen der Prüfungen lockern",
			payload: { value },
			before: raw,
		});
	}
	await mutateOrg(toOrgCtx(c), async (tx) => ({
		result: null,
		audit: await writeIdentityPolicy(tx, c, {
			before: raw,
			next,
			now: new Date(),
		}),
	}));
	revalidatePath(PATH);
	return { ok: true, data: { status: "saved" } };
}

export const addIdentityExceptionAction = safeAction(
	"addIdentityException",
	addIdentityExceptionImpl,
);
export const revokeIdentityExceptionAction = safeAction(
	"revokeIdentityException",
	revokeIdentityExceptionImpl,
);
export const setIdentityMatch = safeAction(
	"setIdentityMatch",
	setIdentityMatchImpl,
);
export const markIdentityAccountLeft = safeAction(
	"markIdentityAccountLeft",
	markIdentityAccountLeftImpl,
);
export const saveIdentityPolicy = safeAction(
	"saveIdentityPolicy",
	saveIdentityPolicyImpl,
);
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
