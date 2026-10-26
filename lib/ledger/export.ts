import { readFileSync } from "node:fs";
import { join } from "node:path";
import { asc, desc, eq } from "drizzle-orm";
import { auditLog, ledgerHeads } from "@/db/schema";
import type { LedgerAnchor, LedgerHead } from "@/db/schema/ledger";
import { anchorsByIds } from "@/lib/db/ledger";
import { type OrgCtx, readOrg } from "@/lib/db/with-org";
import type { ZipEntry } from "@/lib/export/zip";

// Verlauf einer Org zum Prüfen ohne Klick (Härtung V): die eigene Kette mit
// allen Feldern, die in den Hash eingehen (damit pruefen.mjs jeden Eintrag
// neu rechnen kann), je Anker Kopf, Merkle-Pfad, wurzel.bin und die
// OpenTimestamps-Datei. Köpfe anderer Orgs stehen nie darin, nur Hashes auf
// dem Pfad.

export type OrgLedger = {
	heads: (LedgerHead & { anchor: LedgerAnchor | null })[];
};

/** Köpfe der Org mit ihrem Anker, neueste zuerst. */
export async function orgLedger(ctx: OrgCtx, limit = 500): Promise<OrgLedger> {
	const heads = await readOrg(ctx, (tx) =>
		tx
			.select()
			.from(ledgerHeads)
			.where(eq(ledgerHeads.organizationId, ctx.orgId))
			.orderBy(desc(ledgerHeads.createdAt))
			.limit(limit),
	);
	const anchors = new Map(
		(await anchorsByIds([...new Set(heads.map((h) => h.anchorId))])).map(
			(a) => [a.id, a],
		),
	);
	return {
		heads: heads.map((h) => ({
			...h,
			anchor: anchors.get(h.anchorId) ?? null,
		})),
	};
}

const folder = (h: LedgerHead) =>
	`anker/${h.createdAt.toISOString().slice(0, 16).replace(":", "")}_${h.anchorId.slice(0, 8)}`;

export function verifyScript(): string {
	return readFileSync(
		join(
			/* turbopackIgnore: true */ process.cwd(),
			"scripts",
			"verify-ledger.mjs",
		),
		"utf8",
	);
}

export const LEDGER_README = `Verlauf mit Bitcoin-Anker

kette.jsonl       jeder Eintrag des Protokolls deiner Organisation mit allem,
                  was in seinen Hash eingeht (eine Zeile je Eintrag)
anker/<zeit>/     je Anker: kopf.json (verankerter Kopf, Merkle-Pfad, Wurzel),
                  wurzel.bin (die Wurzel als 32 Bytes) und wurzel.bin.ots
                  (OpenTimestamps-Beweis, sobald ein Kalender geantwortet hat)
pruefen.mjs       Prüfung ohne Klick: node pruefen.mjs

So prüfst du:
1. node pruefen.mjs  (Node 20 oder neuer, keine weiteren Pakete)
   rechnet jeden Eintrag neu, prüft die Verkettung, den Kopf je Anker, den
   Merkle-Pfad zur Wurzel und liest den Zeitstempel.
2. Bitcoin-Beglaubigung: Blockhöhe und Merkle-Wurzel aus Schritt 1 mit einem
   eigenen Knoten abgleichen
   (bitcoin-cli getblockheader $(bitcoin-cli getblockhash <höhe>))
   oder mit dem offiziellen Client: ots verify anker/<zeit>/wurzel.bin.ots
3. Ist ein Zeitstempel noch ausstehend, den Verlauf nach einigen Stunden
   erneut herunterladen.

Auf der Bitcoin-Kette steht nur ein Hash über die Wurzel (mit Zufallswert),
keine Inhalte. Die Wurzel fasst die Köpfe aller Organisationen zusammen; vom
Baum siehst du nur deinen Pfad.
`;

export async function ledgerExportEntries(
	ctx: OrgCtx,
	generatedAt: Date,
): Promise<{ entries: ZipEntry[]; rows: number; anchors: number }> {
	const rows = await readOrg(ctx, (tx) =>
		tx
			.select()
			.from(auditLog)
			.where(eq(auditLog.organizationId, ctx.orgId))
			.orderBy(asc(auditLog.seq)),
	);
	const chain = rows
		.map((r) =>
			JSON.stringify({
				seq: String(r.seq),
				id: r.id,
				organizationId: r.organizationId,
				actorUserId: r.actorUserId,
				action: r.action,
				target: r.target,
				before: r.before,
				after: r.after,
				ip: r.ip,
				userAgent: r.userAgent,
				outcome: r.outcome,
				at: r.at.toISOString(),
				prevHash: r.prevHash,
				hash: r.hash,
			}),
		)
		.join("\n");
	const { heads } = await orgLedger(ctx);
	const entries: ZipEntry[] = [
		{ name: "LIESMICH.txt", data: LEDGER_README, mtime: generatedAt },
		{ name: "pruefen.mjs", data: verifyScript(), mtime: generatedAt },
		{
			name: "kette.jsonl",
			data: chain ? `${chain}\n` : "",
			mtime: generatedAt,
		},
	];
	let anchors = 0;
	for (const h of [...heads].reverse()) {
		const a = h.anchor;
		if (!a) continue;
		anchors++;
		const dir = folder(h);
		entries.push(
			{
				name: `${dir}/kopf.json`,
				data: `${JSON.stringify(
					{
						anchorId: a.id,
						createdAt: a.createdAt.toISOString(),
						reason: a.reason,
						orgId: h.organizationId,
						seq: String(h.seq),
						count: h.count,
						head: h.head,
						leaf: h.leaf,
						path: h.path,
						root: a.root,
						status: a.status,
						bitcoin:
							a.bitcoinHeight !== null
								? { height: a.bitcoinHeight, merkleRoot: a.bitcoinMerkleRoot }
								: null,
					},
					null,
					2,
				)}\n`,
				mtime: h.createdAt,
			},
			{
				name: `${dir}/wurzel.bin`,
				data: Uint8Array.from(Buffer.from(a.root, "hex")),
				mtime: h.createdAt,
			},
		);
		if (a.ots)
			entries.push({
				name: `${dir}/wurzel.bin.ots`,
				data: Uint8Array.from(a.ots),
				mtime: a.lastUpgradeAt ?? h.createdAt,
			});
	}
	return { entries, rows: rows.length, anchors };
}
