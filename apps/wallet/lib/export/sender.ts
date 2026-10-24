import {
	exportOutbox,
	klickLinks,
	type LinkRejection,
} from "@wallet/db/schema";
import { audit, targetOf } from "@wallet/lib/audit";
import { withOrg } from "@wallet/lib/db/with-org";
import { notify } from "@wallet/lib/notifications/notify";
import { and, asc, eq, gt, isNull, or } from "drizzle-orm";
import {
	batchResponse,
	CONTRACT,
	CONTRACT_VERSION,
	MAX_BATCH,
	MAX_BODY_BYTES,
} from "@/lib/wallet-link/contract";
import { linkToken } from "./link-service";
import {
	applyResults,
	backoffMs,
	classifyStatus,
	mergeRejected,
	NOTIFY_AFTER_ATTEMPTS,
	type SentEvent,
	scopeEvent,
} from "./send-rules";
import { allowedOrigin, type FetchLike, PATHS, postJson } from "./transport";

// Ausgang an Klick: je Verbindung Stapel von bis zu 200 Ereignissen in
// seq-Reihenfolge. Der Job läuft als singleton — es sendet nie zweimal
// gleichzeitig. Angenommen/doppelt/ignoriert = erledigt; abgelehnt = in die
// Fehlerliste (und erledigt, sonst hinge die Verbindung); 401/403/410 =
// pausiert; sonst Wiederholung mit wachsendem Abstand.

export type SendSummary = {
	sent: number;
	rejected: number;
	state: "idle" | "done" | "more" | "paused" | "retry" | "skipped";
};

const LINK_PAGE = "/settings/export";

type Row = typeof exportOutbox.$inferSelect;

// Stapel bauen: außerhalb der gewählten Konten wird übersprungen (zählt
// aber für den Stand), zu große Stapel werden halbiert
export function buildBatch(
	rows: readonly Row[],
	accountIds: readonly string[] | null,
	head: { walletOrgId: string; linkId: string; batchId: string; sentAt: Date },
): {
	body: Record<string, unknown> | null;
	sent: SentEvent[];
	lastSeq: number;
} {
	let take = rows.length;
	while (take > 0) {
		const slice = rows.slice(0, take);
		const events: Record<string, unknown>[] = [];
		const sent: SentEvent[] = [];
		for (const r of slice) {
			const data = scopeEvent(r.type, r.data, accountIds);
			if (data === null) continue;
			events.push({
				id: r.id,
				seq: r.seq,
				type: r.type,
				occurredAt: r.occurredAt.toISOString(),
				data,
			});
			sent.push({ id: r.id, seq: r.seq, type: r.type });
		}
		const lastSeq = slice.at(-1)?.seq ?? 0;
		if (events.length === 0) return { body: null, sent, lastSeq };
		const body = {
			contract: CONTRACT,
			v: CONTRACT_VERSION,
			walletOrgId: head.walletOrgId,
			linkId: head.linkId,
			batchId: head.batchId,
			sentAt: head.sentAt.toISOString(),
			events,
		};
		if (Buffer.byteLength(JSON.stringify(body)) <= MAX_BODY_BYTES || take === 1)
			return { body, sent, lastSeq };
		take = Math.ceil(take / 2);
	}
	return { body: null, sent: [], lastSeq: 0 };
}

const owners = ["owner"] as const;

export async function sendLink(
	orgId: string,
	linkId: string,
	opts: {
		origins: readonly string[];
		fetchImpl?: FetchLike;
		now?: Date;
		maxBatches?: number;
	},
): Promise<SendSummary> {
	const now = opts.now ?? new Date();
	const ctx = { orgId, userId: null };
	const summary: SendSummary = { sent: 0, rejected: 0, state: "idle" };
	for (let i = 0; i < (opts.maxBatches ?? 10); i += 1) {
		const job = await withOrg(ctx, async (tx) => {
			const [link] = await tx
				.select()
				.from(klickLinks)
				.where(eq(klickLinks.id, linkId))
				.limit(1);
			if (
				!link ||
				link.status !== "active" ||
				!link.backfilledAt ||
				(link.nextAttemptAt && link.nextAttemptAt > now)
			)
				return null;
			const rows = await tx
				.select()
				.from(exportOutbox)
				.where(
					and(
						gt(exportOutbox.seq, link.ackedSeq),
						or(isNull(exportOutbox.linkId), eq(exportOutbox.linkId, linkId)),
					),
				)
				.orderBy(asc(exportOutbox.seq))
				.limit(MAX_BATCH);
			if (rows.length === 0) return { link, rows, token: null };
			return { link, rows, token: await linkToken(tx, orgId, link) };
		});
		if (!job) {
			if (i === 0) summary.state = "skipped";
			return summary;
		}
		if (job.rows.length === 0) {
			summary.state = i === 0 ? "idle" : "done";
			return summary;
		}
		const { link, rows } = job;
		const batchId = crypto.randomUUID();
		const built = buildBatch(rows, link.accountIds, {
			walletOrgId: orgId,
			linkId,
			batchId,
			sentAt: now,
		});
		// Nur Ereignisse anderer Konten: Stand vorrücken, weiter
		if (!built.body) {
			await withOrg(ctx, (tx) =>
				tx
					.update(klickLinks)
					.set({ ackedSeq: built.lastSeq })
					.where(eq(klickLinks.id, linkId)),
			);
			continue;
		}
		const fail = async (
			kind: "retry" | "pause",
			error: string,
			reason?: string,
		) => {
			await withOrg(ctx, async (tx) => {
				const attempts = link.attempts + 1;
				if (kind === "pause") {
					await tx
						.update(klickLinks)
						.set({
							status: "paused",
							pausedReason: reason ?? error,
							lastError: error,
							lastAttemptAt: now,
							attempts,
						})
						.where(eq(klickLinks.id, linkId));
					await notify(tx, {
						orgId,
						actorUserId: null,
						kind: "export",
						title: "Compliance-Export pausiert",
						body: `Klick hat das Token abgelehnt (${error}). Hol in Klick ein neues Token und trag es hier ein.`,
						link: LINK_PAGE,
						roles: owners,
					});
					await audit(
						tx,
						{ userId: null },
						{
							organizationId: orgId,
							action: "export.link_paused",
							target: targetOf("klick_link", linkId),
							before: { status: "active" },
							after: { status: "paused", reason: reason ?? error },
						},
					);
					return;
				}
				await tx
					.update(klickLinks)
					.set({
						lastError: error,
						lastAttemptAt: now,
						attempts,
						nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)),
					})
					.where(eq(klickLinks.id, linkId));
				if (attempts === NOTIFY_AFTER_ATTEMPTS)
					await notify(tx, {
						orgId,
						actorUserId: null,
						kind: "export",
						title: "Compliance-Export hängt",
						body: `Klick ist seit ${attempts} Versuchen nicht erreichbar (${error}). Der Export versucht es weiter.`,
						link: LINK_PAGE,
						roles: owners,
					});
			});
			summary.state = kind === "pause" ? "paused" : "retry";
			return summary;
		};
		if (!job.token || !allowedOrigin(link.origin, opts.origins))
			return fail(
				"pause",
				job.token ? "origin_not_allowed" : "token_unreadable",
			);
		const res = await postJson(
			link.origin,
			PATHS.batch,
			job.token,
			built.body,
			{
				fetchImpl: opts.fetchImpl,
			},
		);
		if (!res.ok) return fail("retry", res.error);
		const outcome = classifyStatus(res.status);
		if (outcome.kind === "pause")
			return fail("pause", `HTTP ${res.status}`, outcome.reason);
		if (outcome.kind === "retry") return fail("retry", outcome.error);
		const parsed = batchResponse.safeParse(res.json);
		if (!parsed.success) return fail("retry", "invalid_response");
		const applied = applyResults(built.sent, parsed.data, batchId);
		if (!applied.ok) return fail("retry", applied.error);
		await withOrg(ctx, async (tx) => {
			const rejected: LinkRejection[] = applied.rejected.map((r) => ({
				id: r.id,
				seq: r.seq,
				type: r.type,
				code: r.code,
				at: now.toISOString(),
			}));
			await tx
				.update(klickLinks)
				.set({
					ackedSeq: built.lastSeq,
					lastSuccessAt: now,
					lastAttemptAt: now,
					attempts: 0,
					nextAttemptAt: null,
					lastError: null,
					...(rejected.length > 0
						? { rejected: mergeRejected(link.rejected, rejected) }
						: {}),
				})
				.where(eq(klickLinks.id, linkId));
			if (rejected.length > 0) {
				await notify(tx, {
					orgId,
					actorUserId: null,
					kind: "export",
					title: `Klick hat ${rejected.length} Ereignis${rejected.length === 1 ? "" : "se"} abgelehnt`,
					body: "Die Liste steht unter Einstellungen → Compliance-Export.",
					link: LINK_PAGE,
					roles: owners,
				});
				await audit(
					tx,
					{ userId: null },
					{
						organizationId: orgId,
						action: "export.events_rejected",
						target: targetOf("klick_link", linkId),
						after: {
							count: rejected.length,
							codes: [...new Set(rejected.map((r) => r.code))].slice(0, 10),
						},
					},
				);
			}
		});
		summary.sent += built.sent.length;
		summary.rejected += applied.rejected.length;
		summary.state = "more";
	}
	return summary;
}
