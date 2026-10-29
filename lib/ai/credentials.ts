import { and, desc, eq, ne } from "drizzle-orm";
import { aiCredentials } from "@/db/schema/ai";
import type { AiProvider } from "@/db/schema/enums";
import { decryptJson, encryptJson, fieldAad } from "@/lib/crypto/org-dek";
import type { OrgTx } from "@/lib/db/with-org";

// API-Schlüssel für den KI-Anbieter der Org (ADR-032). Nur hier geschrieben
// und gelesen; gespeichert verschlüsselt mit dem Org-DEK, sichtbar ist nur
// der Hinweis „…abcd“. Ein Schlüssel wirkt erst, wenn die KI-Regel der Org
// (ai_policy.credentialId) auf ihn zeigt — das geht über Vier-Augen.

export const aiKeyAad = (id: string) =>
	fieldAad("ai_credentials", id, "key_enc");

export const keyHint = (key: string) => `…${key.slice(-4)}`;

export type CredentialInfo = {
	id: string;
	provider: AiProvider;
	keyHint: string;
	createdAt: Date;
	lastTestAt: Date | null;
	lastTestOk: "ok" | "failed" | null;
};

export async function storeCredential(
	tx: OrgTx,
	orgId: string,
	input: { provider: AiProvider; key: string; userId: string | null },
): Promise<CredentialInfo> {
	const id = crypto.randomUUID();
	const keyEnc = await encryptJson(tx, orgId, input.key, aiKeyAad(id));
	const [row] = await tx
		.insert(aiCredentials)
		.values({
			id,
			organizationId: orgId,
			provider: input.provider,
			keyEnc,
			keyHint: keyHint(input.key),
			createdBy: input.userId,
		})
		.returning();
	if (!row) throw new Error("ai_credentials insert failed");
	return infoOf(row);
}

function infoOf(row: typeof aiCredentials.$inferSelect): CredentialInfo {
	return {
		id: row.id,
		provider: row.provider,
		keyHint: row.keyHint,
		createdAt: row.createdAt,
		lastTestAt: row.lastTestAt,
		lastTestOk: row.lastTestOk,
	};
}

export async function credentialInfo(
	tx: OrgTx,
	orgId: string,
	id: string | null,
): Promise<CredentialInfo | null> {
	if (!id) return null;
	const [row] = await tx
		.select()
		.from(aiCredentials)
		.where(
			and(eq(aiCredentials.organizationId, orgId), eq(aiCredentials.id, id)),
		)
		.limit(1);
	return row ? infoOf(row) : null;
}

// Klartext nur für den Aufruf beim Anbieter; nie in Logs oder Antworten
export async function credentialKey(
	tx: OrgTx,
	orgId: string,
	id: string,
): Promise<{ provider: AiProvider; key: string } | null> {
	const [row] = await tx
		.select()
		.from(aiCredentials)
		.where(
			and(eq(aiCredentials.organizationId, orgId), eq(aiCredentials.id, id)),
		)
		.limit(1);
	if (!row) return null;
	const key = await decryptJson<string>(tx, orgId, row.keyEnc, aiKeyAad(id));
	return typeof key === "string" ? { provider: row.provider, key } : null;
}

export async function markTested(
	tx: OrgTx,
	orgId: string,
	id: string,
	ok: boolean,
): Promise<void> {
	await tx
		.update(aiCredentials)
		.set({ lastTestAt: new Date(), lastTestOk: ok ? "ok" : "failed" })
		.where(
			and(eq(aiCredentials.organizationId, orgId), eq(aiCredentials.id, id)),
		);
}

// Alle Schlüssel außer dem wirksamen löschen (nach Wirkung einer neuen Regel
// bzw. „Schlüssel entfernen“); keep = null löscht alle
export async function pruneCredentials(
	tx: OrgTx,
	orgId: string,
	keep: string | null,
): Promise<number> {
	const rows = await tx
		.delete(aiCredentials)
		.where(
			keep
				? and(
						eq(aiCredentials.organizationId, orgId),
						ne(aiCredentials.id, keep),
					)
				: eq(aiCredentials.organizationId, orgId),
		)
		.returning({ id: aiCredentials.id });
	return rows.length;
}

// Neuester gespeicherter Schlüssel, der noch nicht wirkt (für das Formular)
export async function latestCredential(
	tx: OrgTx,
	orgId: string,
): Promise<CredentialInfo | null> {
	const [row] = await tx
		.select()
		.from(aiCredentials)
		.where(eq(aiCredentials.organizationId, orgId))
		.orderBy(desc(aiCredentials.createdAt))
		.limit(1);
	return row ? infoOf(row) : null;
}
