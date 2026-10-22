"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	accessTokens,
	documents,
	type TrustCenterSettings,
	trustAccessRequests,
	trustCenters,
} from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import { mutateOrg } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { logger } from "@/lib/log";
import { sendTransactionalMail } from "@/lib/mail/send";
import { trustAccessEmail } from "@/lib/mail/templates";
import { newToken } from "@/lib/security/tokens";
import { documentAccessAllowed } from "@/lib/trust/rules";
import {
	isUniqueViolation,
	loadSnapshotInput,
	loadTrustCenter,
	orgName,
} from "@/lib/trust/service";
import { buildTrustSnapshot, type SnapshotWarning } from "@/lib/trust/snapshot";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	trustApproveSchema,
	trustDecisionSchema,
	trustSettingsSchema,
} from "@/lib/validation/trust";

// Trust Center: Entwurf speichern (settings:update), Veröffentlichen,
// Zurückziehen und Freigeben mit frischem Step-up. Öffentlich ist nur der
// beim Veröffentlichen gebaute Snapshot. Freigabe stellt ein Zugangstoken
// (klk_trust_, ADR-017) aus — der Klartext steht nur in der Antwort (und
// ggf. der Mail an die anfragende Person).

const PATH = "/trust-center";

async function saveTrustSettingsImpl(
	input: unknown,
): Promise<ActionResult<{ slug: string }>> {
	const c = await requireOrg({ settings: ["update"] });
	const parsed = trustSettingsSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { slug, ...rest } = parsed.data;
	if (rest.frameworks.some((f) => !FRAMEWORK_BY_SLUG.has(f.slug)))
		return { ok: false, error: "invalid" };
	const settings: TrustCenterSettings = rest;
	try {
		return await mutateOrg<ActionResult<{ slug: string }>>(
			toOrgCtx(c),
			async (tx) => {
				const ids = settings.documents.map((d) => d.documentId);
				const docs =
					ids.length > 0
						? await tx
								.select({
									id: documents.id,
									docNumber: documents.docNumber,
									classification: documents.classification,
								})
								.from(documents)
								.where(
									and(
										eq(documents.organizationId, c.orgId),
										inArray(documents.id, ids),
									),
								)
						: [];
				const byId = new Map(docs.map((d) => [d.id, d]));
				for (const entry of settings.documents) {
					const d = byId.get(entry.documentId);
					if (!d)
						return { result: { ok: false, error: "notFound" }, audit: [] };
					if (!documentAccessAllowed(d.classification, entry.access))
						return {
							result: {
								ok: false,
								error: "document_access",
								fieldErrors: { documents: [d.docNumber] },
							},
							audit: [],
						};
				}
				const before = await loadTrustCenter(tx, c.orgId);
				if (before)
					await tx
						.update(trustCenters)
						.set({ slug, settings })
						.where(eq(trustCenters.id, before.id));
				else
					await tx
						.insert(trustCenters)
						.values({ organizationId: c.orgId, slug, settings });
				return {
					result: { ok: true, data: { slug } },
					audit: {
						action: "trust.settings_updated",
						target: `trust_center:${c.orgId}`,
						before: before
							? { slug: before.slug, settings: before.settings }
							: null,
						after: { slug, settings },
					},
				};
			},
		);
	} catch (e) {
		if (isUniqueViolation(e)) return { ok: false, error: "slug_taken" };
		throw e;
	}
}

async function publishTrustCenterImpl(): Promise<
	ActionResult<{ slug: string; warnings: SnapshotWarning[] }>
> {
	const c = await requireStepUp({ settings: ["update"] });
	const res = await mutateOrg<
		ActionResult<{ slug: string; warnings: SnapshotWarning[] }>
	>(toOrgCtx(c), async (tx) => {
		const row = await loadTrustCenter(tx, c.orgId);
		if (!row) return { result: { ok: false, error: "notFound" }, audit: [] };
		const { snapshot, warnings } = buildTrustSnapshot(
			await loadSnapshotInput(tx, c.orgId, row.settings),
		);
		await tx
			.update(trustCenters)
			.set({
				published: true,
				snapshot,
				publishedAt: new Date(),
				publishedByUserId: c.userId,
			})
			.where(eq(trustCenters.id, row.id));
		return {
			result: { ok: true, data: { slug: row.slug, warnings } },
			audit: {
				action: "trust.published",
				target: `trust_center:${c.orgId}`,
				before: { published: row.published },
				after: {
					slug: row.slug,
					frameworks: snapshot.frameworks.map((f) => f.slug),
					documents: snapshot.documents.map(
						(d) => `${d.docNumber} v${d.version} (${d.access})`,
					),
					subprocessors: snapshot.subprocessors?.length ?? null,
					warnings,
				},
			},
		};
	});
	revalidatePath(PATH);
	if (res.ok) revalidatePath(`/vertrauen/${res.data.slug}`);
	return res;
}

async function unpublishTrustCenterImpl(): Promise<ActionResult> {
	const c = await requireStepUp({ settings: ["update"] });
	const res = await mutateOrg<ActionResult<{ slug: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const row = await loadTrustCenter(tx, c.orgId);
			if (!row?.published)
				return { result: { ok: false, error: "notFound" }, audit: [] };
			await tx
				.update(trustCenters)
				.set({ published: false })
				.where(eq(trustCenters.id, row.id));
			return {
				result: { ok: true, data: { slug: row.slug } },
				audit: {
					action: "trust.unpublished",
					target: `trust_center:${c.orgId}`,
					before: { published: true },
					after: { published: false, slug: row.slug },
				},
			};
		},
	);
	revalidatePath(PATH);
	if (res.ok) revalidatePath(`/vertrauen/${res.data.slug}`);
	return res.ok ? { ok: true, data: undefined } : res;
}

async function approveTrustRequestImpl(
	input: unknown,
): Promise<ActionResult<{ url: string; expiresAt: Date; mailed: boolean }>> {
	const c = await requireStepUp({ settings: ["update"] });
	const parsed = trustApproveSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const t = newToken("trust_center");
	const expiresAt = new Date(Date.now() + d.days * 86_400_000);
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const center = await loadTrustCenter(tx, c.orgId);
		const [req] = await tx
			.select()
			.from(trustAccessRequests)
			.where(
				and(
					eq(trustAccessRequests.id, d.id),
					eq(trustAccessRequests.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!center || !req || req.status !== "pending")
			return { result: null, audit: [] };
		const [token] = await tx
			.insert(accessTokens)
			.values({
				organizationId: c.orgId,
				kind: "trust_center",
				name: `Trust Center: ${req.company}`.slice(0, 200),
				prefix: t.prefix,
				tokenHash: t.hash,
				scopes: ["trust:read"],
				subjectType: "trust_request",
				subjectId: req.id,
				createdByUserId: c.userId,
				expiresAt,
			})
			.returning({ id: accessTokens.id });
		if (!token) throw new Error("insert failed");
		await tx
			.update(trustAccessRequests)
			.set({
				status: "approved",
				decidedByUserId: c.userId,
				decidedAt: new Date(),
				tokenId: token.id,
				expiresAt,
			})
			.where(eq(trustAccessRequests.id, req.id));
		return {
			result: {
				slug: center.slug,
				name: req.name,
				email: req.email,
				organization: await orgName(tx, c.orgId),
			},
			audit: {
				action: "trust.access_approved",
				target: `trust_request:${req.id}`,
				before: { status: req.status },
				after: {
					status: "approved",
					company: req.company,
					tokenId: token.id,
					prefix: t.prefix,
					expiresAt,
					mailTo: d.sendMail ? req.email : null,
				},
			},
		};
	});
	if (!out) return { ok: false, error: "notFound" };
	const url = `${env().BETTER_AUTH_URL.replace(/\/$/, "")}/vertrauen/${out.slug}/unterlagen#${t.token}`;
	let mailed = false;
	if (d.sendMail) {
		const mail = trustAccessEmail({
			url,
			organization: out.organization || "Klick",
			name: out.name,
			expiresAt,
		});
		const res = await sendTransactionalMail({ to: out.email, ...mail });
		mailed = res.ok && res.path !== "console";
		if (!res.ok)
			logger.warn({ requestId: d.id, path: res.path }, "trust mail failed");
	}
	revalidatePath(PATH);
	return { ok: true, data: { url, expiresAt, mailed } };
}

async function rejectTrustRequestImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ settings: ["update"] });
	const parsed = trustDecisionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [req] = await tx
			.update(trustAccessRequests)
			.set({
				status: "rejected",
				decidedByUserId: c.userId,
				decidedAt: new Date(),
				note: d.note,
			})
			.where(
				and(
					eq(trustAccessRequests.id, d.id),
					eq(trustAccessRequests.organizationId, c.orgId),
					eq(trustAccessRequests.status, "pending"),
				),
			)
			.returning({ id: trustAccessRequests.id });
		if (!req) return { result: false, audit: [] };
		return {
			result: true,
			audit: {
				action: "trust.access_rejected",
				target: `trust_request:${req.id}`,
				before: { status: "pending" },
				after: { status: "rejected", note: d.note },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

// Zugang entziehen: Token widerrufen, Anfrage auf „widerrufen“. Weniger
// Zugriff braucht keinen Step-up.
async function revokeTrustAccessImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ settings: ["update"] });
	const parsed = trustDecisionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [req] = await tx
			.update(trustAccessRequests)
			.set({ status: "revoked", note: d.note })
			.where(
				and(
					eq(trustAccessRequests.id, d.id),
					eq(trustAccessRequests.organizationId, c.orgId),
					eq(trustAccessRequests.status, "approved"),
				),
			)
			.returning({
				id: trustAccessRequests.id,
				tokenId: trustAccessRequests.tokenId,
			});
		if (!req) return { result: false, audit: [] };
		if (req.tokenId)
			await tx
				.update(accessTokens)
				.set({ revokedAt: new Date(), revokedByUserId: c.userId })
				.where(
					and(eq(accessTokens.id, req.tokenId), isNull(accessTokens.revokedAt)),
				);
		return {
			result: true,
			audit: {
				action: "trust.access_revoked",
				target: `trust_request:${req.id}`,
				before: { status: "approved" },
				after: { status: "revoked", tokenId: req.tokenId, note: d.note },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

export const saveTrustSettings = safeAction(
	"saveTrustSettings",
	saveTrustSettingsImpl,
);
export const publishTrustCenter = safeAction(
	"publishTrustCenter",
	publishTrustCenterImpl,
);
export const unpublishTrustCenter = safeAction(
	"unpublishTrustCenter",
	unpublishTrustCenterImpl,
);
export const approveTrustRequest = safeAction(
	"approveTrustRequest",
	approveTrustRequestImpl,
);
export const rejectTrustRequest = safeAction(
	"rejectTrustRequest",
	rejectTrustRequestImpl,
);
export const revokeTrustAccess = safeAction(
	"revokeTrustAccess",
	revokeTrustAccessImpl,
);
