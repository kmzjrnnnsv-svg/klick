import {
	klickLinks,
	orgSettings,
	orgs,
	walletAccounts,
} from "@wallet/db/schema";
import { targetOf } from "@wallet/lib/audit";
import { decryptJson, encryptJson, fieldAad } from "@wallet/lib/crypto/org-dek";
import {
	mutateOrg,
	type OrgCtx,
	type OrgTx,
	readOrg,
	withOrg,
} from "@wallet/lib/db/with-org";
import type { CreateLinkInput } from "@wallet/lib/validation/export";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
	CONTRACT,
	CONTRACT_VERSION,
	type HelloResponse,
	helloResponse,
} from "@/lib/wallet-link/contract";
import { backfillLink } from "./backfill";
import { berlinDayStart, classifyStatus } from "./send-rules";
import { allowedOrigin, type FetchLike, PATHS, postJson } from "./transport";

// Verbindungen nach Klick (Einstellungen → Compliance-Export): anlegen mit
// hello, Token nur verschlüsselt, Nachlieferung des heutigen Stands;
// pausieren, fortsetzen, Token erneuern, trennen. Jede Änderung auditiert,
// das Token nie im Audit (nur die letzten vier Zeichen als Hinweis).

export type LinkError =
	| "origin_not_allowed"
	| "accounts_invalid"
	| "token_invalid"
	| "klick_unreachable"
	| "klick_error"
	| "already_linked"
	| "not_found"
	| "not_paused";

export type LinkResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: LinkError };

type Opts = { origins: readonly string[]; fetchImpl?: FetchLike; now?: Date };

const tokenAad = (id: string) => fieldAad("klick_links", id, "token_enc");
export const tokenHint = (token: string) => `…${token.slice(-4)}`;

// hello: Klick bestätigt Token und Ziel-Org, bevor etwas gespeichert wird
export async function helloKlick(
	origin: string,
	token: string,
	body: { walletOrgId: string; walletOrgName: string; linkId: string },
	opts: { fetchImpl?: FetchLike; now?: Date } = {},
): Promise<LinkResult<HelloResponse>> {
	const res = await postJson(
		origin,
		PATHS.hello,
		token,
		{
			contract: CONTRACT,
			v: CONTRACT_VERSION,
			...body,
			sentAt: (opts.now ?? new Date()).toISOString(),
		},
		{ fetchImpl: opts.fetchImpl, timeoutMs: 10_000 },
	);
	if (!res.ok) return { ok: false, error: "klick_unreachable" };
	const outcome = classifyStatus(res.status);
	if (outcome.kind === "pause") return { ok: false, error: "token_invalid" };
	if (outcome.kind === "retry") return { ok: false, error: "klick_error" };
	const parsed = helloResponse.safeParse(res.json);
	if (!parsed.success) return { ok: false, error: "klick_error" };
	return { ok: true, data: parsed.data };
}

async function orgName(tx: OrgTx, orgId: string): Promise<string> {
	const [o] = await tx
		.select({ name: orgs.name })
		.from(orgs)
		.where(eq(orgs.id, orgId))
		.limit(1);
	return o?.name ?? "";
}

export async function createLink(
	ctx: OrgCtx,
	input: CreateLinkInput,
	opts: Opts,
): Promise<
	LinkResult<{ linkId: string; klickOrgName: string; events: number }>
> {
	const now = opts.now ?? new Date();
	if (!allowedOrigin(input.origin, opts.origins))
		return { ok: false, error: "origin_not_allowed" };
	const pre = await readOrg(ctx, async (tx) => {
		const name = await orgName(tx, ctx.orgId);
		if (!input.accountIds) return { name, accountsOk: true };
		const found = await tx
			.select({ id: walletAccounts.id })
			.from(walletAccounts)
			.where(inArray(walletAccounts.id, input.accountIds));
		return { name, accountsOk: found.length === input.accountIds.length };
	});
	if (!pre.accountsOk) return { ok: false, error: "accounts_invalid" };
	const linkId = crypto.randomUUID();
	const hello = await helloKlick(
		input.origin,
		input.token,
		{ walletOrgId: ctx.orgId, walletOrgName: pre.name, linkId },
		{ fetchImpl: opts.fetchImpl, now },
	);
	if (!hello.ok) return hello;
	const backfillFrom = input.backfillFrom
		? berlinDayStart(input.backfillFrom)
		: null;

	// 1. Verbindung anlegen; ab hier vermerken die Trigger jede Änderung.
	// Gesendet wird erst, was nach dem heutigen Stand (ackedSeq) entsteht.
	const created = await mutateOrg<LinkResult>(ctx, async (tx) => {
		const [dup] = await tx
			.select({ id: klickLinks.id })
			.from(klickLinks)
			.where(
				and(
					eq(klickLinks.origin, input.origin),
					eq(klickLinks.linkRef, hello.data.linkRef),
					ne(klickLinks.status, "revoked"),
				),
			)
			.limit(1);
		if (dup)
			return {
				result: { ok: false, error: "already_linked" },
				audit: {
					action: "export.link_created",
					outcome: "failure",
					after: { origin: input.origin, reason: "already_linked" },
				},
			};
		const [s] = await tx
			.select({ seq: orgSettings.exportSeq })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, ctx.orgId))
			.for("update");
		const tokenEnc = await encryptJson(
			tx,
			ctx.orgId,
			input.token,
			tokenAad(linkId),
		);
		const row = {
			id: linkId,
			organizationId: ctx.orgId,
			origin: input.origin,
			tokenEnc,
			tokenHint: tokenHint(input.token),
			accountIds: input.accountIds,
			backfillFrom,
			klickOrgName: hello.data.klickOrg.name,
			linkRef: hello.data.linkRef,
			tokenExpiresAt: hello.data.expiresAt
				? new Date(hello.data.expiresAt)
				: null,
			ackedSeq: s?.seq ?? 0,
			lastHelloAt: now,
			createdByUserId: ctx.userId,
		};
		await tx.insert(klickLinks).values(row);
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "export.link_created",
				target: targetOf("klick_link", linkId),
				after: {
					origin: input.origin,
					klickOrg: hello.data.klickOrg.name,
					linkRef: hello.data.linkRef,
					tokenHint: row.tokenHint,
					accounts: input.accountIds?.length ?? "all",
					backfillFrom: input.backfillFrom,
				},
			},
		};
	});
	if (!created.ok) return created;

	// 2. Nachlieferung (scheitert sie, holt der Export-Lauf sie nach)
	const events = await completeBackfill(ctx.orgId, linkId, now);
	return {
		ok: true,
		data: { linkId, klickOrgName: hello.data.klickOrg.name, events },
	};
}

// Schranke: wartet, bis alle Transaktionen fertig sind, die beim Anlegen
// der Verbindung schon geschrieben hatten (deren Trigger sahen die
// Verbindung noch nicht). Danach liest die Nachlieferung einen Stand, in dem
// nichts fehlt — spätere Änderungen vermerken die Trigger. Ohne Sperren:
// Snapshot der laufenden Transaktionen, dann pg_xact_status abfragen.
const BARRIER_MAX_MS = 30_000;

async function waitForEarlierWriters(orgId: string): Promise<void> {
	const ctx = { orgId, userId: null };
	const xids = await readOrg(ctx, async (tx) => {
		const rows = await tx.execute<{ x: string }>(
			sql`select x::text as x from pg_snapshot_xip(pg_current_snapshot()) as x`,
		);
		return [...rows].map((r) => r.x);
	});
	const until = Date.now() + BARRIER_MAX_MS;
	let open = xids;
	while (open.length > 0) {
		if (Date.now() > until)
			throw new Error("export backfill: earlier writers still running");
		await new Promise((r) => setTimeout(r, 50));
		open = await readOrg(ctx, async (tx) => {
			const rows = await tx.execute<{ x: string }>(
				sql`select x::text as x from unnest(${`{${open.join(",")}}`}::xid8[]) as x where pg_xact_status(x) = 'in progress'`,
			);
			return [...rows].map((r) => r.x);
		});
	}
}

// Nachlieferung für eine Verbindung ohne backfilledAt (genau einmal: die
// Zeile ist während der Nachlieferung gesperrt)
export async function completeBackfill(
	orgId: string,
	linkId: string,
	now = new Date(),
): Promise<number> {
	await waitForEarlierWriters(orgId);
	return withOrg({ orgId, userId: null }, async (tx) => {
		const [link] = await tx
			.select({
				id: klickLinks.id,
				accountIds: klickLinks.accountIds,
				backfillFrom: klickLinks.backfillFrom,
			})
			.from(klickLinks)
			.where(
				and(
					eq(klickLinks.id, linkId),
					isNull(klickLinks.backfilledAt),
					ne(klickLinks.status, "revoked"),
				),
			)
			.for("update");
		if (!link) return 0;
		const n = await backfillLink(tx, orgId, link, now);
		await tx
			.update(klickLinks)
			.set({ backfilledAt: now })
			.where(eq(klickLinks.id, linkId));
		return n;
	});
}

export async function linkToken(
	tx: OrgTx,
	orgId: string,
	link: { id: string; tokenEnc: string },
): Promise<string | null> {
	return decryptJson<string>(tx, orgId, link.tokenEnc, tokenAad(link.id));
}

type LinkAction = "pause" | "resume" | "revoke";

const NEXT: Record<LinkAction, { from: string[]; action: string }> = {
	pause: { from: ["active"], action: "export.link_paused" },
	resume: { from: ["paused"], action: "export.link_resumed" },
	revoke: { from: ["active", "paused"], action: "export.link_revoked" },
};

export async function setLinkState(
	ctx: OrgCtx,
	linkId: string,
	what: LinkAction,
	now = new Date(),
): Promise<LinkResult> {
	return mutateOrg<LinkResult>(ctx, async (tx) => {
		const [link] = await tx
			.select()
			.from(klickLinks)
			.where(eq(klickLinks.id, linkId))
			.for("update");
		if (!link || link.status === "revoked")
			return {
				result: { ok: false, error: "not_found" },
				audit: {
					action: NEXT[what].action,
					outcome: "failure",
					target: targetOf("klick_link", linkId),
				},
			};
		if (!NEXT[what].from.includes(link.status))
			return {
				result: { ok: false, error: "not_paused" },
				audit: {
					action: NEXT[what].action,
					outcome: "failure",
					target: targetOf("klick_link", linkId),
					before: { status: link.status },
				},
			};
		const set =
			what === "pause"
				? { status: "paused" as const, pausedReason: "manual" }
				: what === "resume"
					? {
							status: "active" as const,
							pausedReason: null,
							attempts: 0,
							nextAttemptAt: null,
							lastError: null,
						}
					: { status: "revoked" as const };
		await tx
			.update(klickLinks)
			.set({ ...set, updatedAt: now })
			.where(eq(klickLinks.id, linkId));
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: NEXT[what].action,
				target: targetOf("klick_link", linkId),
				before: { status: link.status },
				after: { status: set.status, origin: link.origin },
			},
		};
	});
}

// Neues Token aus Klick (abgelaufen, widerrufen, 401): hello mit derselben
// Verbindung, dann verschlüsselt ersetzen und fortsetzen
export async function renewLinkToken(
	ctx: OrgCtx,
	linkId: string,
	token: string,
	opts: Omit<Opts, "origins"> & { origins: readonly string[] },
): Promise<LinkResult> {
	const now = opts.now ?? new Date();
	const pre = await readOrg(ctx, async (tx) => {
		const [link] = await tx
			.select({
				origin: klickLinks.origin,
				status: klickLinks.status,
				linkRef: klickLinks.linkRef,
			})
			.from(klickLinks)
			.where(eq(klickLinks.id, linkId))
			.limit(1);
		return { link, name: await orgName(tx, ctx.orgId) };
	});
	if (!pre.link || pre.link.status === "revoked")
		return { ok: false, error: "not_found" };
	if (!allowedOrigin(pre.link.origin, opts.origins))
		return { ok: false, error: "origin_not_allowed" };
	const hello = await helloKlick(
		pre.link.origin,
		token,
		{ walletOrgId: ctx.orgId, walletOrgName: pre.name, linkId },
		{ fetchImpl: opts.fetchImpl, now },
	);
	if (!hello.ok) return hello;
	// Ein Token einer anderen Klick-Verbindung gehört nicht hierher
	if (pre.link.linkRef && hello.data.linkRef !== pre.link.linkRef)
		return { ok: false, error: "already_linked" };
	return mutateOrg<LinkResult>(ctx, async (tx) => {
		const tokenEnc = await encryptJson(tx, ctx.orgId, token, tokenAad(linkId));
		await tx
			.update(klickLinks)
			.set({
				tokenEnc,
				tokenHint: tokenHint(token),
				tokenExpiresAt: hello.data.expiresAt
					? new Date(hello.data.expiresAt)
					: null,
				klickOrgName: hello.data.klickOrg.name,
				status: "active",
				pausedReason: null,
				attempts: 0,
				nextAttemptAt: null,
				lastError: null,
				lastHelloAt: now,
				updatedAt: now,
			})
			.where(eq(klickLinks.id, linkId));
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "export.link_token_renewed",
				target: targetOf("klick_link", linkId),
				before: { status: pre.link?.status },
				after: { tokenHint: tokenHint(token) },
			},
		};
	});
}
