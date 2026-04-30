import { beforeAll, describe, expect, it } from "vitest";
import {
	decryptBytes,
	encryptBytes,
	generateDek,
	sha256Hex,
	unwrapDek,
	wrapDek,
} from "@/lib/crypto/envelope";

beforeAll(() => {
	// Stable test KEK (32 bytes base64). Mirrors what .env.local provides at runtime.
	process.env.VAULT_KEK_BASE64 = "MRCiuOCuE4+1KMDyqvB4Dldl4yswx/lCU63BJuykpY8=";
});

describe("envelope encryption", () => {
	it("wraps and unwraps a DEK round-trip", async () => {
		const dek = await generateDek();
		const wrapped = await wrapDek(dek);
		const unwrapped = await unwrapDek(wrapped);
		expect(Buffer.from(unwrapped).equals(Buffer.from(dek))).toBe(true);
	});

	it("encrypts and decrypts arbitrary bytes round-trip", async () => {
		const dek = await generateDek();
		const plain = new TextEncoder().encode("hello, vault");
		const { ciphertext, nonce } = await encryptBytes(plain, dek);
		expect(ciphertext.length).toBeGreaterThan(plain.length); // includes auth tag
		const back = await decryptBytes(ciphertext, nonce, dek);
		expect(new TextDecoder().decode(back)).toBe("hello, vault");
	});

	it("rejects tampered ciphertext", async () => {
		const dek = await generateDek();
		const plain = new TextEncoder().encode("important");
		const { ciphertext, nonce } = await encryptBytes(plain, dek);
		ciphertext[0] ^= 0xff; // flip a bit
		await expect(decryptBytes(ciphertext, nonce, dek)).rejects.toThrow();
	});

	it("uses a different nonce for each encryption (no reuse)", async () => {
		const dek = await generateDek();
		const plain = new TextEncoder().encode("same plaintext");
		const a = await encryptBytes(plain, dek);
		const b = await encryptBytes(plain, dek);
		expect(Buffer.from(a.nonce).equals(Buffer.from(b.nonce))).toBe(false);
		expect(Buffer.from(a.ciphertext).equals(Buffer.from(b.ciphertext))).toBe(
			false,
		);
	});

	it("computes a stable hex sha256", async () => {
		const a = await sha256Hex(new TextEncoder().encode("abc"));
		expect(a).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
	});
});
