import { createHash } from "node:crypto";

// Sammelunterschrift (N4): eine Bestätigung über viele Nachweise. Blätter =
// SHA-256(0x00 ‖ "<evidenceId>|<sha256>"), Knoten = SHA-256(0x01 ‖ L ‖ R),
// ungerade Anzahl: der letzte Knoten steigt unverändert auf. Jede einzelne
// Unterschrift trägt ihren Pfad zur Wurzel.

export type MerkleStep = { side: "L" | "R"; hash: string };

const sha = (...parts: Buffer[]) =>
	createHash("sha256").update(Buffer.concat(parts)).digest();

export const merkleLeaf = (evidenceId: string, sha256: string): string =>
	sha(
		Buffer.from([0]),
		Buffer.from(`${evidenceId}|${sha256}`, "utf8"),
	).toString("hex");

const node = (l: string, r: string) =>
	sha(Buffer.from([1]), Buffer.from(l, "hex"), Buffer.from(r, "hex")).toString(
		"hex",
	);

function levels(leaves: readonly string[]): string[][] {
	if (leaves.length === 0) throw new Error("merkle: keine Blätter");
	const out: string[][] = [[...leaves]];
	while ((out.at(-1)?.length ?? 0) > 1) {
		const cur = out.at(-1) ?? [];
		const next: string[] = [];
		for (let i = 0; i < cur.length; i += 2)
			next.push(
				i + 1 < cur.length
					? node(cur[i] ?? "", cur[i + 1] ?? "")
					: (cur[i] ?? ""),
			);
		out.push(next);
	}
	return out;
}

export const merkleRoot = (leaves: readonly string[]): string =>
	levels(leaves).at(-1)?.[0] ?? "";

export function merkleProof(
	leaves: readonly string[],
	index: number,
): MerkleStep[] {
	const proof: MerkleStep[] = [];
	let i = index;
	for (const level of levels(leaves).slice(0, -1)) {
		const sibling = i % 2 === 0 ? i + 1 : i - 1;
		if (sibling < level.length)
			proof.push({ side: i % 2 === 0 ? "R" : "L", hash: level[sibling] ?? "" });
		i = Math.floor(i / 2);
	}
	return proof;
}

export function verifyMerkleProof(
	leaf: string,
	proof: readonly MerkleStep[],
	root: string,
): boolean {
	let h = leaf;
	for (const s of proof) h = s.side === "R" ? node(h, s.hash) : node(s.hash, h);
	return h === root;
}
