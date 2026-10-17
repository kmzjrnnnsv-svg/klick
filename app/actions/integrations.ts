"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { accessTokens, products } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { AuthError, requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { mutateOrg } from "@/lib/db/with-org";
import { newToken } from "@/lib/security/tokens";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	accessTokenIdSchema,
	createAccessTokenSchema,
} from "@/lib/validation/security";

// Zugangstoken für CI/API (ADR-017): Anlegen und Widerrufen nur mit
// frischem Step-up. Der Klartext wird genau einmal zurückgegeben, in der DB
// steht nur der SHA-256; das Audit kennt Name, Präfix, Scopes und Ablauf.

const PATH = "/einstellungen";

async function stepUp(perm: { integration: ("create" | "revoke")[] }) {
	try {
		return { ok: true as const, ctx: await requireStepUp(perm) };
	} catch (e) {
		if (e instanceof AuthError && e.code === "step_up_required")
			return { ok: false as const, error: "step_up_required" };
		throw e;
	}
}

async function createAccessTokenImpl(
	input: unknown,
): Promise<ActionResult<{ token: string; prefix: string }>> {
	const s = await stepUp({ integration: ["create"] });
	if (!s.ok) return s;
	const c = s.ctx;
	const parsed = createAccessTokenSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const t = newToken("ingest");
	const expiresAt = new Date(Date.now() + d.expiresInDays * 86_400_000);
	const res = await mutateOrg<ActionResult<{ token: string; prefix: string }>>(
		toOrgCtx(c),
		async (tx) => {
			if (d.productId) {
				const [p] = await tx
					.select({ id: products.id })
					.from(products)
					.where(
						and(
							eq(products.id, d.productId),
							eq(products.organizationId, c.orgId),
						),
					)
					.limit(1);
				if (!p) return { result: { ok: false, error: "notFound" }, audit: [] };
			}
			const [row] = await tx
				.insert(accessTokens)
				.values({
					organizationId: c.orgId,
					kind: "ingest",
					name: d.name,
					prefix: t.prefix,
					tokenHash: t.hash,
					scopes: d.scopes,
					subjectType: d.productId ? "product" : null,
					subjectId: d.productId ?? null,
					createdByUserId: c.userId,
					expiresAt,
				})
				.returning({ id: accessTokens.id });
			if (!row) throw new Error("insert failed");
			return {
				result: { ok: true, data: { token: t.token, prefix: t.prefix } },
				audit: {
					action: "integration.token_created",
					target: `access_token:${row.id}`,
					after: {
						name: d.name,
						prefix: t.prefix,
						scopes: d.scopes,
						productId: d.productId ?? null,
						expiresAt,
					},
				},
			};
		},
	);
	revalidatePath(PATH);
	return res;
}

async function revokeAccessTokenImpl(input: unknown): Promise<ActionResult> {
	const s = await stepUp({ integration: ["revoke"] });
	if (!s.ok) return s;
	const c = s.ctx;
	const parsed = accessTokenIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.update(accessTokens)
			.set({ revokedAt: new Date(), revokedByUserId: c.userId })
			.where(
				and(
					eq(accessTokens.id, parsed.data.tokenId),
					eq(accessTokens.organizationId, c.orgId),
					isNull(accessTokens.revokedAt),
				),
			)
			.returning({ id: accessTokens.id, prefix: accessTokens.prefix });
		if (!row) return { result: { ok: false, error: "notFound" }, audit: [] };
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "integration.token_revoked",
				target: `access_token:${row.id}`,
				after: { prefix: row.prefix },
			},
		};
	});
	revalidatePath(PATH);
	return res;
}

export const createAccessToken = safeAction(
	"createAccessToken",
	createAccessTokenImpl,
);
export const revokeAccessToken = safeAction(
	"revokeAccessToken",
	revokeAccessTokenImpl,
);
