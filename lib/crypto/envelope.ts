import { createHash } from "node:crypto";
import sodium from "libsodium-wrappers";

let ready = false;
async function ensure() {
	if (ready) return;
	await sodium.ready;
	ready = true;
}

function getKek(): Uint8Array {
	const b64 = process.env.VAULT_KEK_BASE64;
	if (!b64) throw new Error("VAULT_KEK_BASE64 missing");
	const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
	if (bytes.length !== 32) {
		throw new Error(`KEK must be 32 bytes, got ${bytes.length}`);
	}
	return bytes;
}

/** Generate a fresh per-user data encryption key (32 bytes). */
export async function generateDek(): Promise<Uint8Array> {
	await ensure();
	return sodium.crypto_secretbox_keygen();
}

/** Wrap a DEK with the master KEK. Output is base64(nonce || ciphertext). */
export async function wrapDek(dek: Uint8Array): Promise<string> {
	await ensure();
	const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
	const ct = sodium.crypto_secretbox_easy(dek, nonce, getKek());
	const out = new Uint8Array(nonce.length + ct.length);
	out.set(nonce, 0);
	out.set(ct, nonce.length);
	return Buffer.from(out).toString("base64");
}

/** Reverse of wrapDek. */
export async function unwrapDek(wrappedB64: string): Promise<Uint8Array> {
	await ensure();
	const wrapped = Uint8Array.from(Buffer.from(wrappedB64, "base64"));
	const NONCE = sodium.crypto_secretbox_NONCEBYTES;
	const nonce = wrapped.slice(0, NONCE);
	const ct = wrapped.slice(NONCE);
	const dek = sodium.crypto_secretbox_open_easy(ct, nonce, getKek());
	if (!dek) throw new Error("DEK unwrap failed");
	return dek;
}

/** Authenticated symmetric encryption with a DEK. */
export async function encryptBytes(
	plain: Uint8Array,
	dek: Uint8Array,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
	await ensure();
	const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
	const ciphertext = sodium.crypto_secretbox_easy(plain, nonce, dek);
	return { ciphertext, nonce };
}

/** Authenticated symmetric decryption with a DEK. */
export async function decryptBytes(
	ciphertext: Uint8Array,
	nonce: Uint8Array,
	dek: Uint8Array,
): Promise<Uint8Array> {
	await ensure();
	const plain = sodium.crypto_secretbox_open_easy(ciphertext, nonce, dek);
	if (!plain)
		throw new Error(
			"decrypt failed (bad key, bad nonce, or tampered ciphertext)",
		);
	return plain;
}

/** Hex-encoded SHA-256 of arbitrary bytes (for integrity / audit hashing). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
	return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}
