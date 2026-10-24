import { exportOutbox, klickLinks, orgSettings } from "@wallet/db/schema";
import type { OrgTx } from "@wallet/lib/db/with-org";
import { and, eq, ne, sql } from "drizzle-orm";
import { eventHash } from "@/lib/wallet-link/contract";
import type { EventData, EventType } from "@/lib/wallet-link/events";

// Ereignis in den Ausgang (export_outbox) schreiben — in der Transaktion des
// Aufrufers. Die seq kommt aus org_settings.export_seq unter Zeilensperre:
// Schreiber derselben Org laufen nacheinander, die seq steigt also in
// Commit-Reihenfolge und ohne Lücken, die ein Leser überspringen könnte.

// Gibt es eine Verbindung (aktiv oder pausiert)? Ohne Verbindung entsteht
// nichts — die Nachlieferung holt den Stand beim Verbinden.
export async function hasLinks(tx: OrgTx, orgId: string): Promise<boolean> {
	const [l] = await tx
		.select({ id: klickLinks.id })
		.from(klickLinks)
		.where(
			and(
				eq(klickLinks.organizationId, orgId),
				ne(klickLinks.status, "revoked"),
			),
		)
		.limit(1);
	return Boolean(l);
}

async function nextSeq(tx: OrgTx, orgId: string): Promise<number> {
	const [s] = await tx
		.update(orgSettings)
		.set({ exportSeq: sql`${orgSettings.exportSeq} + 1` })
		.where(eq(orgSettings.organizationId, orgId))
		.returning({ seq: orgSettings.exportSeq });
	if (!s) throw new Error("org_settings fehlt");
	return s.seq;
}

// Zustands-Ereignisse tragen rev = seq (die neuere Fassung gewinnt)
export async function emitEvent<T extends EventType>(
	tx: OrgTx,
	orgId: string,
	type: T,
	data: (rev: number) => EventData<T>,
	opts: { linkId?: string | null; occurredAt?: Date } = {},
): Promise<{ id: string; seq: number }> {
	const seq = await nextSeq(tx, orgId);
	const id = crypto.randomUUID();
	const occurredAt = opts.occurredAt ?? new Date();
	const payload = data(seq);
	const hash = eventHash({
		id,
		seq,
		type,
		occurredAt: occurredAt.toISOString(),
		data: payload,
	});
	await tx.insert(exportOutbox).values({
		id,
		organizationId: orgId,
		linkId: opts.linkId ?? null,
		seq,
		type,
		occurredAt,
		data: payload,
		hash,
	});
	return { id, seq };
}
