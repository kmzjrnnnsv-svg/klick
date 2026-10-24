import { orgSettings } from "@wallet/db/schema";
import type { OrgTx } from "@wallet/lib/db/with-org";
import { eq } from "drizzle-orm";
import { generateDek, unwrapDek, wrapDek } from "@/lib/crypto/envelope";
import {
	decryptField,
	encryptField,
	isEncryptedField,
} from "@/lib/crypto/fields";
import { type Kms, LocalKms } from "@/lib/crypto/kms";

// Org-DEK von both.money, umschlossen mit dem eigenen KEK
// (WALLET_VAULT_KEK_BASE64[_V<n>], nie Klicks VAULT_KEK).

let cached: Kms | null = null;

export function walletKms(): Kms {
	if (!cached) cached = LocalKms.fromEnv(process.env, "WALLET_VAULT_KEK");
	return cached;
}

// Nur für Tests
export function setWalletKmsForTests(kms: Kms | null): void {
	cached = kms;
}

export async function newWrappedDek(): Promise<{
	encryptedDek: string;
	keyVersion: number;
}> {
	const w = await wrapDek(await generateDek(), walletKms());
	return { encryptedDek: w.wrapped, keyVersion: w.keyVersion };
}

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
	const dek = await unwrapDek(
		{ wrapped: s.encryptedDek, keyVersion: s.keyVersion },
		walletKms(),
	);
	return { dek, keyVersion: s.keyVersion };
}

export const fieldAad = (table: string, rowId: string, column: string) =>
	`${table}:${rowId}:${column}`;

export async function encryptJson(
	tx: OrgTx,
	orgId: string,
	value: unknown,
	aad: string,
): Promise<string> {
	const { dek, keyVersion } = await loadOrgDek(tx, orgId);
	return encryptField(value, dek, { keyVersion, aad });
}

export async function decryptJson<T>(
	tx: OrgTx,
	orgId: string,
	stored: string | null,
	aad: string,
): Promise<T | null> {
	if (!stored || !isEncryptedField(stored)) return null;
	const { dek } = await loadOrgDek(tx, orgId);
	return decryptField<T>(stored, dek, aad);
}
