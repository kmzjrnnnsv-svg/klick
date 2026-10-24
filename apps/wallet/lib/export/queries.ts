import {
	exportOutbox,
	klickLinks,
	type LinkRejection,
	walletAccounts,
} from "@wallet/db/schema";
import { type OrgCtx, readOrg } from "@wallet/lib/db/with-org";
import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	isNull,
	min,
	ne,
	or,
} from "drizzle-orm";

// Einstellungen → Compliance-Export: Verbindungen mit Stand und Verzug,
// Konten zur Auswahl. Das Token verlässt den Server nie (nur der Hinweis).

export type LinkView = {
	id: string;
	origin: string;
	status: "active" | "paused" | "revoked";
	klickOrgName: string | null;
	tokenHint: string;
	tokenExpiresAt: Date | null;
	accounts: { id: string; name: string }[] | null;
	backfillFrom: Date | null;
	backfilledAt: Date | null;
	lastSuccessAt: Date | null;
	lastAttemptAt: Date | null;
	nextAttemptAt: Date | null;
	attempts: number;
	lastError: string | null;
	pausedReason: string | null;
	rejected: LinkRejection[];
	pending: number;
	oldestPendingAt: Date | null;
	createdAt: Date;
};

export async function listLinks(ctx: OrgCtx): Promise<{
	links: LinkView[];
	revoked: Pick<LinkView, "id" | "origin" | "klickOrgName" | "createdAt">[];
	accounts: { id: string; name: string; network: string }[];
}> {
	return readOrg(ctx, async (tx) => {
		const accounts = await tx
			.select({
				id: walletAccounts.id,
				name: walletAccounts.name,
				network: walletAccounts.network,
			})
			.from(walletAccounts)
			.where(eq(walletAccounts.status, "active"))
			.orderBy(asc(walletAccounts.createdAt));
		const names = new Map(accounts.map((a) => [a.id, a.name]));
		const rows = await tx
			.select()
			.from(klickLinks)
			.orderBy(desc(klickLinks.createdAt));
		const links: LinkView[] = [];
		for (const l of rows.filter((r) => r.status !== "revoked")) {
			const [p] = await tx
				.select({ n: count(), oldest: min(exportOutbox.createdAt) })
				.from(exportOutbox)
				.where(
					and(
						gt(exportOutbox.seq, l.ackedSeq),
						or(isNull(exportOutbox.linkId), eq(exportOutbox.linkId, l.id)),
					),
				);
			links.push({
				id: l.id,
				origin: l.origin,
				status: l.status,
				klickOrgName: l.klickOrgName,
				tokenHint: l.tokenHint,
				tokenExpiresAt: l.tokenExpiresAt,
				accounts: l.accountIds
					? l.accountIds.map((id) => ({
							id,
							name: names.get(id) ?? "—",
						}))
					: null,
				backfillFrom: l.backfillFrom,
				backfilledAt: l.backfilledAt,
				lastSuccessAt: l.lastSuccessAt,
				lastAttemptAt: l.lastAttemptAt,
				nextAttemptAt: l.nextAttemptAt,
				attempts: l.attempts,
				lastError: l.lastError,
				pausedReason: l.pausedReason,
				rejected: l.rejected ?? [],
				pending: Number(p?.n ?? 0),
				oldestPendingAt: p?.oldest ?? null,
				createdAt: l.createdAt,
			});
		}
		const revoked = rows
			.filter((r) => r.status === "revoked")
			.slice(0, 10)
			.map((r) => ({
				id: r.id,
				origin: r.origin,
				klickOrgName: r.klickOrgName,
				createdAt: r.createdAt,
			}));
		return { links, revoked, accounts };
	});
}

// Für die Navigation: gibt es überhaupt eine Verbindung?
export async function linkCount(ctx: OrgCtx): Promise<number> {
	const [r] = await readOrg(ctx, (tx) =>
		tx
			.select({ n: count() })
			.from(klickLinks)
			.where(ne(klickLinks.status, "revoked")),
	);
	return Number(r?.n ?? 0);
}
