import { eq } from "drizzle-orm";
import { orgSettings } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { unwrapDek } from "./envelope";
import { decryptField, encryptField, isEncryptedField } from "./fields";

// Org-DEK für Feldverschlüsselung innerhalb einer Org-Transaktion laden.
// AAD bindet den Ciphertext an Tabelle/Zeile/Spalte (kein Umhängen möglich).

export async function loadOrgDek(
	tx: OrgTx,
	orgId: string,
): Promise<{ dek: Uint8Array; keyVersion: number }> {
	const [s] = await tx
		.select({
			encryptedDek: orgSettings.encryptedDek,
			keyVersion: orgSettings.keyVersion,
		})
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	if (!s) throw new Error("org settings missing");
	const dek = await unwrapDek({
		wrapped: s.encryptedDek,
		keyVersion: s.keyVersion,
	});
	return { dek, keyVersion: s.keyVersion };
}

export function fieldAad(table: string, rowId: string, column: string): string {
	return `${table}:${rowId}:${column}`;
}

export async function encryptJson(
	tx: OrgTx,
	orgId: string,
	value: unknown,
	aad: string,
): Promise<string> {
	const { dek, keyVersion } = await loadOrgDek(tx, orgId);
	return encryptField(value, dek, { keyVersion, aad });
}

// Liefert null bei leerem Feld; entschlüsselt mit dem Org-DEK. Unverschlüsselte
// Altwerte werden nicht toleriert (Fail closed).
export async function decryptJson<T>(
	tx: OrgTx,
	orgId: string,
	stored: string | null,
	aad: string,
): Promise<T | null> {
	if (!stored) return null;
	if (!isEncryptedField(stored)) return null;
	const { dek } = await loadOrgDek(tx, orgId);
	return decryptField<T>(stored, dek, aad);
}

// Mehrere Felder derselben Org mit einem DEK-Load entschlüsseln.
export async function decryptMany<T>(
	tx: OrgTx,
	orgId: string,
	items: readonly { stored: string | null; aad: string }[],
): Promise<(T | null)[]> {
	if (items.every((i) => !i.stored)) return items.map(() => null);
	const { dek } = await loadOrgDek(tx, orgId);
	return Promise.all(
		items.map((i) =>
			i.stored && isEncryptedField(i.stored)
				? decryptField<T>(i.stored, dek, i.aad)
				: Promise.resolve(null),
		),
	);
}
