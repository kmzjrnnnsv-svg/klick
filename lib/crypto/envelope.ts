import { createHash } from "node:crypto";
import sodium from "libsodium-wrappers";
import { getKms, type Kms, type WrappedDek } from "./kms";

// Envelope-Verschlüsselung: per-Org-DEK (XChaCha20-Poly1305), DEK mit dem
// KEK umschlossen (lib/crypto/kms.ts). Jedes Blob trägt einen kleinen
// versionierten Header, damit Rotation und Formatwechsel ohne Big-Bang gehen.

export const ENVELOPE_VERSION = 1;
const HEADER_BYTES = 1 + 2; // version (u8) + keyVersion (u16 BE)

export async function generateDek(): Promise<Uint8Array> {
	await sodium.ready;
	return sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
}

export async function wrapDek(
	dek: Uint8Array,
	kms: Kms = getKms(),
): Promise<WrappedDek> {
	return kms.wrap(dek);
}

export async function unwrapDek(
	wrapped: WrappedDek,
	kms: Kms = getKms(),
): Promise<Uint8Array> {
	return kms.unwrap(wrapped);
}

export type Sealed = {
	version: number;
	keyVersion: number;
	nonce: Uint8Array;
	ciphertext: Uint8Array;
};

export async function encryptBytes(
	plain: Uint8Array,
	dek: Uint8Array,
	opts: { keyVersion: number; aad?: string },
): Promise<Sealed> {
	await sodium.ready;
	const nonce = sodium.randombytes_buf(
		sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
	);
	const aad = opts.aad ? sodium.from_string(opts.aad) : null;
	const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
		plain,
		aad,
		null,
		nonce,
		dek,
	);
	return {
		version: ENVELOPE_VERSION,
		keyVersion: opts.keyVersion,
		nonce,
		ciphertext,
	};
}

export async function decryptBytes(
	sealed: Sealed,
	dek: Uint8Array,
	aad?: string,
): Promise<Uint8Array> {
	await sodium.ready;
	try {
		return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
			null,
			sealed.ciphertext,
			aad ? sodium.from_string(aad) : null,
			sealed.nonce,
			dek,
		);
	} catch {
		throw new Error(
			"Entschlüsselung fehlgeschlagen (falscher Schlüssel, falsche Nonce oder manipulierte Daten)",
		);
	}
}

// Serialisierung: [version:u8][keyVersion:u16][nonce:24][ciphertext…]
export function packEnvelope(sealed: Sealed): Uint8Array {
	const out = new Uint8Array(
		HEADER_BYTES + sealed.nonce.length + sealed.ciphertext.length,
	);
	out[0] = sealed.version;
	out[1] = (sealed.keyVersion >> 8) & 0xff;
	out[2] = sealed.keyVersion & 0xff;
	out.set(sealed.nonce, HEADER_BYTES);
	out.set(sealed.ciphertext, HEADER_BYTES + sealed.nonce.length);
	return out;
}

export function unpackEnvelope(bytes: Uint8Array): Sealed {
	if (bytes.length < HEADER_BYTES + 24 + 16) {
		throw new Error("Envelope zu kurz");
	}
	const version = bytes[0];
	if (version !== ENVELOPE_VERSION) {
		throw new Error(`Unbekannte Envelope-Version ${version}`);
	}
	const keyVersion = (bytes[1] << 8) | bytes[2];
	const nonce = bytes.slice(HEADER_BYTES, HEADER_BYTES + 24);
	const ciphertext = bytes.slice(HEADER_BYTES + 24);
	return { version, keyVersion, nonce, ciphertext };
}

export function sha256Hex(bytes: Uint8Array): string {
	return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}
