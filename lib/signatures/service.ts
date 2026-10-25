import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { evidence, evidenceSignatures, roleAssignments } from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import type { SignedAssertion } from "@/lib/auth/passkey-sign";
import { effectiveAssignment } from "@/lib/compliance/appointments";
import type { OrgTx } from "@/lib/db/with-org";
import { encodeSignText, type SignFields, type SignPurpose } from "./canonical";
import { merkleLeaf, merkleProof, merkleRoot } from "./merkle";

// Unterschrift unter einem oder mehreren Nachweisen (Sammelunterschrift über
// die Merkle-Wurzel). Ziel und Prüfsumme rechnet der Server immer selbst aus
// den Nachweisen der Org — nie aus der Eingabe.

export const SIGN_VALID_MS = 10 * 60 * 1000;

type Item = { id: string; sha256: string; leaf: string };

export async function signTarget(
	tx: OrgTx,
	orgId: string,
	evidenceIds: readonly string[],
	batchId?: string,
): Promise<{ target: string; hash: string; items: Item[] } | null> {
	const ids = [...new Set(evidenceIds)].sort();
	if (ids.length === 0 || ids.length > 200) return null;
	const rows = await tx
		.select({ id: evidence.id, sha256: evidence.sha256 })
		.from(evidence)
		.where(and(eq(evidence.organizationId, orgId), inArray(evidence.id, ids)));
	if (rows.length !== ids.length || rows.some((r) => !r.sha256)) return null;
	const items = ids.map((id) => {
		const sha256 = rows.find((r) => r.id === id)?.sha256 ?? "";
		return { id, sha256, leaf: merkleLeaf(id, sha256) };
	});
	if (items.length === 1) {
		const [one] = items;
		if (!one) return null;
		return { target: `evidence:${one.id}`, hash: one.sha256, items };
	}
	if (!batchId) return null;
	return {
		target: `batch:${batchId}`,
		hash: merkleRoot(items.map((i) => i.leaf)),
		items,
	};
}

// Funktion, in der die Person unterschreibt — nur wenn sie sie innehat
export async function holdsFunction(
	tx: OrgTx,
	orgId: string,
	userId: string,
	fn: string,
): Promise<boolean> {
	if (fn === "-") return true;
	const [row] = await tx
		.select({ id: roleAssignments.id })
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.organizationId, orgId),
				effectiveAssignment(),
				eq(roleAssignments.userId, userId),
				eq(
					roleAssignments.function,
					fn as (typeof roleAssignments.function.enumValues)[number],
				),
			),
		)
		.limit(1);
	return Boolean(row);
}

export async function prepareSignText(
	tx: OrgTx,
	input: {
		orgId: string;
		userId: string;
		evidenceIds: readonly string[];
		function: string;
		purpose: SignPurpose;
		now?: Date;
	},
): Promise<{ text: string; fields: SignFields } | null> {
	const batchId =
		input.evidenceIds.length > 1 ? crypto.randomUUID() : undefined;
	const t = await signTarget(tx, input.orgId, input.evidenceIds, batchId);
	if (!t) return null;
	if (!(await holdsFunction(tx, input.orgId, input.userId, input.function)))
		return null;
	const now = input.now ?? new Date();
	const fields: SignFields = {
		org: input.orgId,
		target: t.target,
		hash: t.hash,
		signer: input.userId,
		function: input.function,
		purpose: input.purpose,
		nonce: randomBytes(16).toString("hex"),
		expires: new Date(now.getTime() + SIGN_VALID_MS)
			.toISOString()
			.replace(/\.\d{3}Z$/, "Z"),
	};
	return { text: encodeSignText(fields), fields };
}

export async function storeSignatures(
	tx: OrgTx,
	input: {
		orgId: string;
		fields: SignFields;
		signText: string;
		signerName: string;
		evidenceIds: readonly string[];
		assertion: SignedAssertion;
	},
): Promise<{ count: number; audit: AuditInput } | null> {
	const f = input.fields;
	const batchId = f.target.startsWith("batch:") ? f.target.slice(6) : undefined;
	const t = await signTarget(tx, input.orgId, input.evidenceIds, batchId);
	// Inhalt seit dem Ausstellen geändert oder andere Auswahl → ungültig
	if (!t || t.target !== f.target || t.hash !== f.hash) return null;
	const leaves = t.items.map((i) => i.leaf);
	const rows = t.items.map((item, idx) => ({
		organizationId: input.orgId,
		evidenceId: item.id,
		sha256: item.sha256,
		signerUserId: f.signer,
		signerName: input.signerName,
		function: f.function === "-" ? null : f.function,
		purpose: f.purpose,
		signText: input.signText,
		nonce: f.nonce,
		...input.assertion,
		batchId: batchId ?? null,
		merkleRoot: batchId ? t.hash : null,
		merkleProof: batchId ? merkleProof(leaves, idx) : null,
	}));
	const inserted = await tx
		.insert(evidenceSignatures)
		.values(rows)
		.onConflictDoNothing()
		.returning({ id: evidenceSignatures.id });
	// gleicher Einmalwert schon verwendet → Wiederholung
	if (inserted.length !== rows.length) return null;
	return {
		count: rows.length,
		audit: {
			action: "evidence.signed",
			target: f.target,
			after: {
				hash: f.hash,
				evidence: t.items.map((i) => i.id),
				function: f.function,
				purpose: f.purpose,
				nonce: f.nonce,
				credentialId: input.assertion.credentialId,
				userVerified: input.assertion.userVerified,
			},
		},
	};
}

export async function signaturesFor(
	tx: OrgTx,
	orgId: string,
	evidenceIds: readonly string[],
) {
	if (evidenceIds.length === 0) return [];
	return tx
		.select()
		.from(evidenceSignatures)
		.where(
			and(
				eq(evidenceSignatures.organizationId, orgId),
				inArray(evidenceSignatures.evidenceId, [...evidenceIds]),
			),
		)
		.orderBy(evidenceSignatures.signedAt);
}
