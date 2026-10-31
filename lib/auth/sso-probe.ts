import { APIError } from "better-auth/api";
import { and, eq, gt, isNull } from "drizzle-orm";
import { globalDb } from "@/db";
import { member, ssoProvider, user } from "@/db/auth-schema";
import { ssoProbes } from "@/db/schema";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { type SamlProbeView, samlProbeView } from "./saml-metadata";
import {
	roleFromGroups,
	SAML_MFA_VALUES,
	samlMfa,
	ssoEmailAllowed,
} from "./sso-policy";
import { orgSsoPolicy } from "./sso-provisioning";
import { decodeSamlResponse } from "./sso-saml";
import { upsertProviderState } from "./sso-setup-service";

// Probe-Anmeldung (AP10b): Die Inhaberin meldet sich einmal mit ihrem
// Firmenkonto beim Anbieter an. Die Antwort prüft das Plugin wie jede
// Anmeldung (Signatur, Audience, Zeitfenster, InResponseTo, Wiederholung);
// danach hält Klick fest, was ankam, und bricht ab, bevor ein Konto, eine
// Verknüpfung oder eine Sitzung entsteht (Hooks user/account/session.create
// in lib/auth/server.ts). Erkannt wird die Probe an der ID der eigenen
// AuthnRequest (sso_probes.request_id), nicht an Angaben des Browsers.

export const PROBE_TTL_MS = 10 * 60_000;
export const PROBE_DONE = "SSO_PROBE_DONE";

export function probePath(probeId: string): string {
	return `/einstellungen/sso/probe/${probeId}`;
}

type ProbeHit = {
	orgId: string;
	providerId: string;
	probeId: string;
	requestedBy: string | null;
	view: SamlProbeView;
	provider: {
		domain: string;
		domainVerified: boolean;
		groupsAttribute: string | null;
		emailAttribute: string | null;
		nameAttribute: string | null;
	};
};

type HookCtx =
	| {
			path?: string;
			params?: Record<string, unknown>;
			body?: unknown;
	  }
	| null
	| undefined;

/** Gehört die SAML-Antwort dieser Anfrage zu einer offenen Probe? */
export async function samlProbeFor(ctx: HookCtx): Promise<ProbeHit | null> {
	if (!ctx?.path?.startsWith("/sso/saml2/sp/acs")) return null;
	const raw = (ctx.body as { SAMLResponse?: unknown } | undefined)
		?.SAMLResponse;
	const providerId = ctx.params?.providerId;
	if (typeof raw !== "string" || typeof providerId !== "string") return null;
	const view = samlProbeView(decodeSamlResponse(raw));
	if (!view.inResponseTo) return null;
	const [p] = await globalDb
		.select({
			organizationId: ssoProvider.organizationId,
			domain: ssoProvider.domain,
			domainVerified: ssoProvider.domainVerified,
			samlConfig: ssoProvider.samlConfig,
		})
		.from(ssoProvider)
		.where(eq(ssoProvider.providerId, providerId))
		.limit(1);
	if (!p?.organizationId) return null;
	const orgId = p.organizationId;
	const requestId = view.inResponseTo;
	const [probe] = await readOrg({ orgId, userId: null }, (tx) =>
		tx
			.select({ id: ssoProbes.id, requestedBy: ssoProbes.requestedBy })
			.from(ssoProbes)
			.where(
				and(
					eq(ssoProbes.organizationId, orgId),
					eq(ssoProbes.providerId, providerId),
					eq(ssoProbes.requestId, requestId),
					isNull(ssoProbes.finishedAt),
					gt(ssoProbes.expiresAt, new Date()),
				),
			)
			.limit(1),
	);
	if (!probe) return null;
	let mapping: Record<string, unknown> = {};
	try {
		const cfg = JSON.parse(p.samlConfig ?? "{}") as {
			mapping?: Record<string, unknown>;
		};
		mapping = cfg.mapping ?? {};
	} catch {
		mapping = {};
	}
	const extra = (mapping.extraFields ?? {}) as Record<string, unknown>;
	const str = (v: unknown) => (typeof v === "string" && v ? v : null);
	return {
		orgId,
		providerId,
		probeId: probe.id,
		requestedBy: probe.requestedBy,
		view,
		provider: {
			domain: p.domain,
			domainVerified: Boolean(p.domainVerified),
			groupsAttribute: str(extra.groups),
			emailAttribute: str(mapping.email),
			nameAttribute: str(mapping.name),
		},
	};
}

export type ProbeAccount =
	| "new"
	| "member"
	| "member_elsewhere"
	| "existing_no_org";

export type ProbeResult = {
	ok: boolean;
	error: string | null;
	email: string | null;
	name: string | null;
	nameId: string | null;
	groups: string[];
	mfa: boolean;
	role: string | null;
	domainOk: boolean;
	account: ProbeAccount | null;
	memberRole: string | null;
	attributeNames: string[];
	issuer: string | null;
	at: string;
};

const first = (v: string[] | undefined) => v?.[0] ?? null;

/** Ergebnis der Probe zusammenstellen (rein bis auf die Kontosuche). */
export async function probeResult(
	hit: ProbeHit,
	email: string | null,
): Promise<ProbeResult> {
	const a = hit.view.attributes;
	const policy = await orgSsoPolicy(hit.orgId);
	const groups =
		a[hit.provider.groupsAttribute ?? ""] ?? a[policy.groupClaim] ?? [];
	const mail = (
		email ??
		first(a[hit.provider.emailAttribute ?? "email"]) ??
		hit.view.nameId ??
		""
	).toLowerCase();
	const domainOk = ssoEmailAllowed(mail, hit.provider);
	let account: ProbeAccount | null = null;
	let memberRole: string | null = null;
	if (mail) {
		const [u] = await globalDb
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, mail))
			.limit(1);
		if (!u) account = "new";
		else {
			const rows = await globalDb
				.select({ orgId: member.organizationId, role: member.role })
				.from(member)
				.where(eq(member.userId, u.id));
			const here = rows.find((r) => r.orgId === hit.orgId);
			memberRole = here?.role ?? null;
			account = here
				? "member"
				: rows.length > 0
					? "member_elsewhere"
					: "existing_no_org";
		}
	}
	const mfa =
		samlMfa(a) ||
		Boolean(
			hit.view.authnContext && SAML_MFA_VALUES.includes(hit.view.authnContext),
		);
	return {
		ok: domainOk,
		error: domainOk ? null : "domain",
		email: mail || null,
		name:
			first(a[hit.provider.nameAttribute ?? "name"]) ??
			first(a.displayName) ??
			null,
		nameId: hit.view.nameId,
		groups: groups.slice(0, 50),
		mfa,
		role: roleFromGroups(groups, policy),
		domainOk,
		account,
		memberRole,
		attributeNames: Object.keys(a).slice(0, 50),
		issuer: hit.view.issuer,
		at: new Date().toISOString(),
	};
}

/** Ergebnis speichern (Probe beendet; bei Erfolg Stand des Anbieters). */
export async function recordProbe(
	hit: ProbeHit,
	result: ProbeResult | { ok: false; error: string; at: string },
): Promise<void> {
	await mutateOrg({ orgId: hit.orgId, userId: hit.requestedBy }, async (tx) => {
		await tx
			.update(ssoProbes)
			.set({
				finishedAt: new Date(),
				result: result as Record<string, unknown>,
			})
			.where(
				and(
					eq(ssoProbes.organizationId, hit.orgId),
					eq(ssoProbes.id, hit.probeId),
				),
			);
		if (result.ok)
			await upsertProviderState(tx, hit.orgId, hit.providerId, {
				probeOkAt: new Date(),
				probeOkBy: hit.requestedBy,
			});
		return {
			result: null,
			audit: {
				action: "sso.probe_finished",
				target: `sso_provider:${hit.providerId}`,
				after: {
					probeId: hit.probeId,
					ok: result.ok,
					error: result.error,
					...("groups" in result
						? {
								groups: result.groups.length,
								mfa: result.mfa,
								role: result.role,
							}
						: {}),
				},
			},
		};
	});
}

/**
 * Für die Hooks: ist das eine Probe, Ergebnis festhalten und abbrechen.
 * Das Plugin leitet den Fehlercode an die Probe-Seite weiter (errorCallbackURL
 * der Anfrage), die Transaktion der Anmeldung rollt zurück.
 */
export async function interceptProbe(
	ctx: HookCtx,
	email: string | null,
): Promise<void> {
	const hit = await samlProbeFor(ctx);
	if (!hit) return;
	await recordProbe(hit, await probeResult(hit, email));
	throw new APIError("FORBIDDEN", {
		code: PROBE_DONE,
		message: "Probe-Anmeldung beendet, nichts angelegt.",
	});
}

/** Für den Algorithmus-Check vor der ACS: Probe mit Fehler beenden. */
export async function failProbe(
	ctx: HookCtx,
	error: string,
): Promise<string | null> {
	const hit = await samlProbeFor(ctx);
	if (!hit) return null;
	await recordProbe(hit, { ok: false, error, at: new Date().toISOString() });
	return probePath(hit.probeId);
}
