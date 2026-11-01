import { and, eq, sql } from "drizzle-orm";
import {
	accessTokens,
	type WalletLink,
	walletLinkEvents,
	walletLinks,
} from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import type { OrgCtx, OrgTx } from "@/lib/db/with-org";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import type { ResolvedToken } from "@/lib/db/with-token";
import { notify } from "@/lib/notifications/notify";
import { orgOwnerIds } from "@/lib/org/queries";
import { newToken } from "@/lib/security/tokens";
import {
	type Batch,
	type BatchResponse,
	CONTRACT,
	CONTRACT_VERSION,
	type EventResult,
	eventHash,
	type HelloRequest,
	type HelloResponse,
	parseEventData,
} from "@/lib/wallet-link/contract";
import { applyEvent, type IngestCtx } from "./apply";
import { eventOutcome } from "./rules";

// Empfang aus both.money (Plan both.money, K3): Verbindung anlegen und
// trennen (Token klk_wallet_…, 365 Tage), hello bindet die both.money-Org,
// Stapel je Ereignis in eigener Transaktion. Gleiche ID mit gleicher
// Prüfsumme = doppelt, mit anderer = abgelehnt + Meldung; Audit nur für
// Wirkungen.

export const WALLET_TOKEN_DAYS = 365;

export async function createWalletLink(
	tx: OrgTx,
	ctx: { orgId: string; userId: string | null },
	input: { name: string },
	now = new Date(),
): Promise<{
	linkId: string;
	token: string;
	prefix: string;
	expiresAt: Date;
	audit: AuditInput;
}> {
	const t = newToken("wallet");
	const expiresAt = new Date(now.getTime() + WALLET_TOKEN_DAYS * 86_400_000);
	const linkId = crypto.randomUUID();
	const [tok] = await tx
		.insert(accessTokens)
		.values({
			organizationId: ctx.orgId,
			kind: "wallet",
			name: input.name,
			prefix: t.prefix,
			tokenHash: t.hash,
			scopes: ["wallet:push"],
			subjectType: "wallet_link",
			subjectId: linkId,
			createdByUserId: ctx.userId,
			expiresAt,
		})
		.returning({ id: accessTokens.id });
	if (!tok) throw new Error("insert failed");
	await tx.insert(walletLinks).values({
		id: linkId,
		organizationId: ctx.orgId,
		name: input.name,
		tokenId: tok.id,
		createdByUserId: ctx.userId,
	});
	return {
		linkId,
		token: t.token,
		prefix: t.prefix,
		expiresAt,
		audit: {
			action: "wallet_link.created",
			target: `wallet_link:${linkId}`,
			after: { name: input.name, prefix: t.prefix, expiresAt },
		},
	};
}

// Neues Token für dieselbe Verbindung (abgelaufen, verloren): altes Token
// widerrufen, Bindung an die both.money-Org bleibt
export async function renewWalletLinkToken(
	tx: OrgTx,
	ctx: { orgId: string; userId: string | null },
	linkId: string,
	now = new Date(),
): Promise<
	| { ok: true; token: string; expiresAt: Date; audit: AuditInput }
	| { ok: false }
> {
	const [link] = await tx
		.select()
		.from(walletLinks)
		.where(and(eq(walletLinks.id, linkId), eq(walletLinks.status, "active")))
		.limit(1);
	if (!link) return { ok: false };
	if (link.tokenId)
		await tx
			.update(accessTokens)
			.set({ revokedAt: now, revokedByUserId: ctx.userId })
			.where(eq(accessTokens.id, link.tokenId));
	const t = newToken("wallet");
	const expiresAt = new Date(now.getTime() + WALLET_TOKEN_DAYS * 86_400_000);
	const [tok] = await tx
		.insert(accessTokens)
		.values({
			organizationId: ctx.orgId,
			kind: "wallet",
			name: link.name,
			prefix: t.prefix,
			tokenHash: t.hash,
			scopes: ["wallet:push"],
			subjectType: "wallet_link",
			subjectId: link.id,
			createdByUserId: ctx.userId,
			expiresAt,
		})
		.returning({ id: accessTokens.id });
	await tx
		.update(walletLinks)
		.set({ tokenId: tok?.id ?? null })
		.where(eq(walletLinks.id, link.id));
	return {
		ok: true,
		token: t.token,
		expiresAt,
		audit: {
			action: "wallet_link.token_renewed",
			target: `wallet_link:${link.id}`,
			after: { prefix: t.prefix, expiresAt },
		},
	};
}

export async function revokeWalletLink(
	tx: OrgTx,
	ctx: { orgId: string; userId: string | null },
	linkId: string,
	now = new Date(),
): Promise<AuditInput | null> {
	const [link] = await tx
		.select()
		.from(walletLinks)
		.where(and(eq(walletLinks.id, linkId), eq(walletLinks.status, "active")))
		.limit(1);
	if (!link) return null;
	await tx
		.update(walletLinks)
		.set({ status: "revoked", revokedAt: now, revokedByUserId: ctx.userId })
		.where(eq(walletLinks.id, link.id));
	if (link.tokenId)
		await tx
			.update(accessTokens)
			.set({ revokedAt: now, revokedByUserId: ctx.userId })
			.where(eq(accessTokens.id, link.tokenId));
	return {
		action: "wallet_link.revoked",
		target: `wallet_link:${link.id}`,
		before: { status: "active", walletOrg: link.walletOrgName },
		after: { status: "revoked" },
	};
}

// Verbindung des Tokens (Subjekt), nur aktiv
export async function linkForToken(
	ctx: OrgCtx,
	token: ResolvedToken,
): Promise<WalletLink | null> {
	if (token.subjectType !== "wallet_link" || !token.subjectId) return null;
	const id = token.subjectId;
	const [link] = await readOrg(ctx, (tx) =>
		tx
			.select()
			.from(walletLinks)
			.where(and(eq(walletLinks.id, id), eq(walletLinks.status, "active")))
			.limit(1),
	);
	return link ?? null;
}

const head = { contract: CONTRACT, v: CONTRACT_VERSION } as const;

export async function receiveHello(
	ctx: IngestCtx,
	token: ResolvedToken,
	link: WalletLink,
	req: HelloRequest,
	klickOrgName: string,
	now = new Date(),
): Promise<
	| { ok: true; body: HelloResponse }
	| { ok: false; error: "wallet_org_mismatch" }
> {
	if (link.walletOrgId && link.walletOrgId !== req.walletOrgId)
		return { ok: false, error: "wallet_org_mismatch" };
	const bound = !link.walletOrgId || link.walletLinkId !== req.linkId;
	await mutateOrg(ctx, async (tx) => {
		await tx
			.update(walletLinks)
			.set({
				walletOrgId: req.walletOrgId,
				walletOrgName: req.walletOrgName,
				walletLinkId: req.linkId,
				lastHelloAt: now,
			})
			.where(eq(walletLinks.id, link.id));
		await tx
			.update(accessTokens)
			.set({ lastUsedAt: now, lastUsedIp: ctx.ip ?? null })
			.where(eq(accessTokens.id, token.id));
		return {
			result: undefined,
			audit: bound
				? {
						action: "wallet_link.bound",
						target: `wallet_link:${link.id}`,
						before: { walletLinkId: link.walletLinkId },
						after: {
							walletOrgId: req.walletOrgId,
							walletOrgName: req.walletOrgName,
							walletLinkId: req.linkId,
						},
					}
				: [],
		};
	});
	return {
		ok: true,
		body: {
			...head,
			klickOrg: { name: klickOrgName },
			linkRef: link.id,
			lastSeq: link.lastSeq > 0 ? link.lastSeq : null,
			expiresAt: token.expiresAt.toISOString(),
		},
	};
}

type Result = { id: string; result: EventResult; code?: string };

// Ein Ereignis in eigener Transaktion: Protokollzeile + Wirkung + Audit
async function receiveEvent(
	ctx: IngestCtx,
	linkId: string,
	e: Batch["events"][number],
): Promise<Result> {
	const hash = eventHash(e);
	return mutateOrg<Result>(ctx, async (tx) => {
		// Zeile sperren: Stapel derselben Verbindung laufen nacheinander
		const [link] = await tx
			.select()
			.from(walletLinks)
			.where(eq(walletLinks.id, linkId))
			.for("update");
		if (!link || link.status !== "active")
			return {
				result: { id: e.id, result: "rejected", code: "link_revoked" },
				audit: [],
			};
		const [stored] = await tx
			.select({
				hash: walletLinkEvents.hash,
				result: walletLinkEvents.result,
				code: walletLinkEvents.code,
			})
			.from(walletLinkEvents)
			.where(
				and(
					eq(walletLinkEvents.organizationId, ctx.orgId),
					eq(walletLinkEvents.eventId, e.id),
				),
			)
			.limit(1);
		const outcome = eventOutcome(stored ?? null, hash);
		if (outcome.kind === "known")
			return {
				result: {
					id: e.id,
					result: outcome.result,
					...(outcome.code ? { code: outcome.code } : {}),
				},
				audit: [],
			};
		if (outcome.kind === "conflict") {
			await notify(tx, {
				orgId: ctx.orgId,
				recipients: await orgOwnerIds(tx, ctx.orgId),
				actorUserId: null,
				kind: "security_alert",
				title: "both.money: Ereignis mit gleicher ID, aber anderem Inhalt",
				body: `Ereignis ${e.id} (${e.type}, Nr. ${e.seq}) wurde abgelehnt. Die Verbindung prüfen.`,
				link: "/einstellungen?tab=integrationen",
			});
			return {
				result: { id: e.id, result: "rejected", code: "hash_mismatch" },
				audit: {
					action: "wallet_link.event_conflict",
					target: `wallet_link:${linkId}`,
					after: { eventId: e.id, type: e.type, seq: e.seq },
					outcome: "denied",
				},
			};
		}
		const parsed = parseEventData(e);
		const row = {
			organizationId: ctx.orgId,
			linkId,
			eventId: e.id,
			seq: e.seq,
			type: e.type,
			occurredAt: new Date(e.occurredAt),
			hash,
			data: e.data,
		};
		if (!parsed.ok) {
			const result = parsed.reason === "unknown_type" ? "ignored" : "rejected";
			const code = parsed.reason === "invalid" ? "invalid" : null;
			await tx.insert(walletLinkEvents).values({ ...row, result, code });
			return {
				result: { id: e.id, result, ...(code ? { code } : {}) },
				audit: [],
			};
		}
		const audits = await applyEvent(tx, ctx, link, parsed.event);
		await tx
			.insert(walletLinkEvents)
			.values({ ...row, result: "accepted", code: null });
		await tx
			.update(walletLinks)
			.set({
				lastSeq: sql`greatest(${walletLinks.lastSeq}, ${e.seq})`,
				lastEventAt: new Date(),
			})
			.where(eq(walletLinks.id, linkId));
		return { result: { id: e.id, result: "accepted" }, audit: audits };
	});
}

export async function receiveBatch(
	ctx: IngestCtx,
	token: ResolvedToken,
	link: WalletLink,
	b: Batch,
	now = new Date(),
): Promise<
	| { ok: true; body: BatchResponse }
	| { ok: false; error: "not_bound" | "wallet_org_mismatch" | "link_mismatch" }
> {
	if (!link.walletOrgId) return { ok: false, error: "not_bound" };
	if (link.walletOrgId !== b.walletOrgId)
		return { ok: false, error: "wallet_org_mismatch" };
	if (link.walletLinkId !== b.linkId)
		return { ok: false, error: "link_mismatch" };
	const results: Result[] = [];
	for (const e of b.events) results.push(await receiveEvent(ctx, link.id, e));
	await mutateOrg(ctx, async (tx) => {
		await tx
			.update(accessTokens)
			.set({ lastUsedAt: now, lastUsedIp: ctx.ip ?? null })
			.where(eq(accessTokens.id, token.id));
		return { result: undefined, audit: [] };
	});
	return { ok: true, body: { ...head, batchId: b.batchId, results } };
}
