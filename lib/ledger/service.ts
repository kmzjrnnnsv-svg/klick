import { randomBytes } from "node:crypto";
import { auditPlatform } from "@/lib/audit";
import {
	type ChainHead,
	chainHeads,
	criticalSince,
	insertAnchor,
	latestAnchor,
	type NewHead,
	pendingAnchors,
	updateAnchor,
} from "@/lib/db/ledger";
import { logger } from "@/lib/log";
import { anchorDue, confirmedBy, stampTree } from "./anchor";
import {
	calendarAllowed,
	configuredCalendars,
	type FetchLike,
	submitToCalendar,
	upgradeFromCalendar,
} from "./calendar";
import {
	type LedgerLeaf,
	leafHash,
	merklePath,
	merkleRoot,
	sortLeaves,
} from "./merkle";
import {
	bitcoinAttestation,
	findByMsg,
	mergeTimestamp,
	parseOtsFile,
	pendingCommitments,
	serializeOtsFile,
} from "./ots";

// Verlauf mit Bitcoin-Anker (Härtung V, ADR-030): Köpfe aller Ketten →
// Merkle-Wurzel → OpenTimestamps-Kalender; später holt der Upgrade-Lauf die
// Bitcoin-Beglaubigung. Kein eigenes Bitcoin-Guthaben, keine Inhalte nach
// außen (der Kalender sieht nur einen Hash über Wurzel + Zufallswert).

export type LedgerOptions = {
	now?: Date;
	fetchImpl?: FetchLike;
	calendars?: string[];
	nonce?: Uint8Array;
};

const PLATFORM = "platform";
const RETRY_AFTER_FAILURE_MS = 60 * 60_000;

const leafOf = (h: ChainHead): LedgerLeaf => ({
	orgId: h.orgId ?? PLATFORM,
	seq: h.seq,
	count: h.count,
	head: h.head,
});

const settings = (o: LedgerOptions) => ({
	calendars: o.calendars ?? configuredCalendars(process.env.LEDGER_CALENDARS),
	fetchImpl: o.fetchImpl ?? (fetch as FetchLike),
	production: process.env.NODE_ENV === "production",
});

export type AnchorResult =
	| { kind: "anchored"; id: string; status: "pending" | "failed"; root: string }
	| { kind: "skipped"; reason: "empty" | "unchanged" | "backoff" };

export async function anchorNow(
	reason: "daily" | "event" | "manual",
	o: LedgerOptions = {},
): Promise<AnchorResult> {
	const now = o.now ?? new Date();
	const { calendars, fetchImpl, production } = settings(o);
	const heads = await chainHeads();
	if (heads.length === 0) return { kind: "skipped", reason: "empty" };
	const leaves = sortLeaves(heads.map(leafOf));
	const hashes = leaves.map(leafHash);
	const root = merkleRoot(hashes);

	const last = await latestAnchor({});
	if (
		reason !== "manual" &&
		last?.status === "failed" &&
		now.getTime() - last.createdAt.getTime() < RETRY_AFTER_FAILURE_MS
	)
		return { kind: "skipped", reason: "backoff" };
	const lastOk = await latestAnchor({ successful: true });
	if (reason !== "manual" && lastOk?.root === root)
		return { kind: "skipped", reason: "unchanged" };

	const { file, commitment } = stampTree(root, o.nonce ?? randomBytes(16));
	const answered: string[] = [];
	const errors: string[] = [];
	await Promise.all(
		calendars.map(async (c) => {
			if (!calendarAllowed(c, calendars, production)) {
				errors.push(`${c}: not_allowed`);
				return;
			}
			try {
				mergeTimestamp(
					commitment,
					await submitToCalendar(c, commitment.msg, fetchImpl),
				);
				answered.push(c);
			} catch (err) {
				errors.push(`${c}: ${err instanceof Error ? err.message : "error"}`);
			}
		}),
	);
	const status = answered.length > 0 ? "pending" : "failed";

	const rows: NewHead[] = [];
	let platform: NewHead | null = null;
	leaves.forEach((l, i) => {
		const h: NewHead = {
			orgId: l.orgId,
			seq: l.seq,
			count: l.count,
			head: l.head,
			leaf: hashes[i] as string,
			path: merklePath(hashes, i),
		};
		if (l.orgId === PLATFORM) platform = h;
		else rows.push(h);
	});
	const p = platform as NewHead | null;
	const id = await insertAnchor(
		{
			reason,
			root,
			leafCount: leaves.length,
			platform: p && {
				seq: p.seq,
				count: p.count,
				head: p.head,
				leaf: p.leaf,
				path: p.path,
			},
			ots: status === "pending" ? Buffer.from(serializeOtsFile(file)) : null,
			status,
			calendars: answered.sort(),
			error: errors.length > 0 ? errors.join("; ").slice(0, 2000) : null,
		},
		rows,
	);
	await auditPlatform(
		{ userId: null },
		{
			action: "ledger.anchored",
			target: `ledger_anchor:${id}`,
			after: {
				reason,
				root,
				leaves: leaves.length,
				status,
				calendars: answered,
			},
			outcome: status === "pending" ? "success" : "failure",
		},
	);
	if (status === "failed")
		logger.warn({ id, errors }, "ledger anchor: no calendar answered");
	return { kind: "anchored", id, status, root };
}

/** Bitcoin-Beglaubigung für offene Anker holen (stündlich). */
export async function upgradePendingAnchors(
	o: LedgerOptions = {},
): Promise<{ checked: number; confirmed: number }> {
	const now = o.now ?? new Date();
	const { calendars, fetchImpl, production } = settings(o);
	let confirmed = 0;
	const pending = await pendingAnchors();
	for (const a of pending) {
		if (!a.ots) continue;
		const file = parseOtsFile(Uint8Array.from(a.ots));
		// je Kalender die Beglaubigung aus seiner eigenen Antwort: ein
		// einzelner Kalender kann sonst „bestätigt“ vortäuschen (S2)
		const byCalendar = new Map<
			string,
			{ height: number; merkleRoot: string }
		>();
		for (const { uri, commitment } of pendingCommitments(file)) {
			if (!calendarAllowed(uri, calendars, production)) continue;
			try {
				const upgraded = await upgradeFromCalendar(uri, commitment, fetchImpl);
				const node = upgraded && findByMsg(file, commitment);
				if (upgraded && node) {
					mergeTimestamp(node, upgraded);
					const b = bitcoinAttestation(upgraded);
					const prev = byCalendar.get(uri);
					if (b && (!prev || b.height < prev.height)) byCalendar.set(uri, b);
				}
			} catch (err) {
				logger.warn({ err, uri, anchor: a.id }, "ledger upgrade failed");
			}
		}
		const btc = confirmedBy(byCalendar, a.calendars.length);
		await updateAnchor(a.id, {
			ots: Buffer.from(serializeOtsFile(file)),
			lastUpgradeAt: now,
			...(btc
				? {
						status: "confirmed",
						bitcoinHeight: btc.height,
						bitcoinMerkleRoot: btc.merkleRoot,
						confirmedAt: now,
					}
				: {}),
		});
		if (btc) confirmed++;
	}
	return { checked: pending.length, confirmed };
}

/** Job ledger-anchor (alle 10 min): täglich und nach kritischen Ereignissen. */
export async function runLedgerAnchor(
	o: LedgerOptions = {},
): Promise<AnchorResult | null> {
	if (process.env.LEDGER_ANCHOR === "off") return null;
	const now = o.now ?? new Date();
	const lastDaily = await latestAnchor({ successful: true, reason: "daily" });
	const lastOk = await latestAnchor({ successful: true });
	const due = anchorDue({
		now,
		lastDailyAt: lastDaily?.createdAt ?? null,
		criticalSinceLast: await criticalSince(lastOk?.createdAt ?? null),
	});
	return due ? anchorNow(due, o) : null;
}
