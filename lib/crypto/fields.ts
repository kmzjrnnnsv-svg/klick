import {
	decryptBytes,
	encryptBytes,
	packEnvelope,
	unpackEnvelope,
} from "./envelope";

// Feldverschlüsselung für sensible Spalten (Verdachtsmeldungs-Notizen,
// Hinweisgeber-Meldungen, Fit-&-Proper-Checklisten, UBO-Ketten …) mit dem
// Org-DEK. Gespeichert wird ein Text "enc1:<base64>", damit die Spalte in
// SQL erkennbar verschlüsselt ist und ein DB-Dump ohne Org-Kontext nur
// Ciphertext liefert.

const PREFIX = "enc1:";

export function isEncryptedField(value: unknown): value is string {
	return typeof value === "string" && value.startsWith(PREFIX);
}

export async function encryptField(
	value: unknown,
	dek: Uint8Array,
	opts: { keyVersion: number; aad: string },
): Promise<string> {
	const plain = new TextEncoder().encode(JSON.stringify(value ?? null));
	const sealed = await encryptBytes(plain, dek, opts);
	return `${PREFIX}${Buffer.from(packEnvelope(sealed)).toString("base64")}`;
}

export async function decryptField<T = unknown>(
	stored: string,
	dek: Uint8Array,
	aad: string,
): Promise<T> {
	if (!isEncryptedField(stored)) {
		throw new Error("Feld ist nicht verschlüsselt gespeichert");
	}
	const bytes = Uint8Array.from(
		Buffer.from(stored.slice(PREFIX.length), "base64"),
	);
	const plain = await decryptBytes(unpackEnvelope(bytes), dek, aad);
	return JSON.parse(new TextDecoder().decode(plain)) as T;
}
