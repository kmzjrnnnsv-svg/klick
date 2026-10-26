import { createHash } from "node:crypto";

// Merkle-Baum über die Köpfe der Org-Ketten (Verlauf mit Bitcoin-Anker,
// Härtung V) — rein, nur node:crypto, wie RFC 6962 (Certificate
// Transparency): Blatt = SHA-256(0x00 ‖ Daten), Knoten = SHA-256(0x01 ‖ l ‖ r),
// geteilt an der größten Zweierpotenz < n. So lässt sich kein Knoten als
// Blatt ausgeben. Jede Org bekommt nur ihren Pfad zur Wurzel — die Köpfe
// anderer Orgs sieht sie nicht.

export type LedgerLeaf = {
	orgId: string;
	// seq des letzten Eintrags der Kette und Anzahl Einträge
	seq: string;
	count: number;
	// hash des letzten Eintrags (audit_log.hash)
	head: string;
};

export type PathStep = { side: "left" | "right"; hash: string };

const h = (...parts: (Uint8Array | string)[]) => {
	const x = createHash("sha256");
	for (const p of parts) x.update(p);
	return x.digest();
};

/** Bytes eines Blatts (kanonischer Text, Version im Präfix). */
export function leafText(l: LedgerLeaf): string {
	return `klick-ledger/v1|${l.orgId}|${l.seq}|${l.count}|${l.head}`;
}

export function leafHash(l: LedgerLeaf): string {
	return h(Uint8Array.of(0), leafText(l)).toString("hex");
}

function node(left: string, right: string): string {
	return h(
		Uint8Array.of(1),
		Buffer.from(left, "hex"),
		Buffer.from(right, "hex"),
	).toString("hex");
}

const split = (n: number) => {
	let k = 1;
	while (k * 2 < n) k *= 2;
	return k;
};

/** Wurzel über Blatt-Hashes (Reihenfolge = Eingabe). */
export function merkleRoot(leaves: readonly string[]): string {
	if (leaves.length === 0) return h("").toString("hex");
	if (leaves.length === 1) return leaves[0] as string;
	const k = split(leaves.length);
	return node(merkleRoot(leaves.slice(0, k)), merkleRoot(leaves.slice(k)));
}

/** Pfad vom Blatt `index` zur Wurzel (unten zuerst). */
export function merklePath(
	leaves: readonly string[],
	index: number,
): PathStep[] {
	if (index < 0 || index >= leaves.length) throw new Error("merkle_index");
	if (leaves.length === 1) return [];
	const k = split(leaves.length);
	return index < k
		? [
				...merklePath(leaves.slice(0, k), index),
				{ side: "right", hash: merkleRoot(leaves.slice(k)) },
			]
		: [
				...merklePath(leaves.slice(k), index - k),
				{ side: "left", hash: merkleRoot(leaves.slice(0, k)) },
			];
}

export function rootFromPath(leaf: string, path: readonly PathStep[]): string {
	return path.reduce(
		(acc, step) =>
			step.side === "right" ? node(acc, step.hash) : node(step.hash, acc),
		leaf,
	);
}

/** Blätter in fester Reihenfolge (nach Org-ID), damit die Wurzel reproduzierbar ist. */
export function sortLeaves(leaves: readonly LedgerLeaf[]): LedgerLeaf[] {
	return [...leaves].sort((a, b) =>
		a.orgId < b.orgId ? -1 : a.orgId > b.orgId ? 1 : 0,
	);
}
