import { describe, expect, it } from "vitest";
import {
	decryptBytes,
	encryptBytes,
	generateDek,
	packEnvelope,
	sha256Hex,
	unpackEnvelope,
	unwrapDek,
	wrapDek,
} from "@/lib/crypto/envelope";
import { LocalKms } from "@/lib/crypto/kms";

const randomKek = () =>
	Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
const kmsFor = (kek: string, version = 1) =>
	LocalKms.fromEnv({
		VAULT_KEK_BASE64: kek,
		VAULT_KEK_VERSION: String(version),
	});

describe("envelope (XChaCha20-Poly1305)", () => {
	it("verschlüsselt und entschlüsselt mit AAD", async () => {
		const dek = await generateDek();
		const plain = new TextEncoder().encode("vertraulich — Prüfbericht 2026");
		const sealed = await encryptBytes(plain, dek, {
			keyVersion: 1,
			aad: "evidence:1",
		});
		expect(sealed.nonce.length).toBe(24);
		const back = await decryptBytes(sealed, dek, "evidence:1");
		expect(new TextDecoder().decode(back)).toBe(
			"vertraulich — Prüfbericht 2026",
		);
	});

	it("erkennt Manipulation am Ciphertext", async () => {
		const dek = await generateDek();
		const sealed = await encryptBytes(new Uint8Array([1, 2, 3, 4]), dek, {
			keyVersion: 1,
		});
		sealed.ciphertext[0] ^= 0xff;
		await expect(decryptBytes(sealed, dek)).rejects.toThrow(
			/Entschlüsselung fehlgeschlagen/,
		);
	});

	it("verweigert falsche AAD und falschen Schlüssel", async () => {
		const dek = await generateDek();
		const other = await generateDek();
		const sealed = await encryptBytes(new Uint8Array([9]), dek, {
			keyVersion: 1,
			aad: "a",
		});
		await expect(decryptBytes(sealed, dek, "b")).rejects.toThrow();
		await expect(decryptBytes(sealed, other, "a")).rejects.toThrow();
	});

	it("verwendet je Aufruf eine neue Nonce", async () => {
		const dek = await generateDek();
		const a = await encryptBytes(new Uint8Array([1]), dek, { keyVersion: 1 });
		const b = await encryptBytes(new Uint8Array([1]), dek, { keyVersion: 1 });
		expect(Buffer.from(a.nonce).equals(Buffer.from(b.nonce))).toBe(false);
	});

	it("packt Version und keyVersion in den Header", async () => {
		const dek = await generateDek();
		const sealed = await encryptBytes(new Uint8Array([7, 7]), dek, {
			keyVersion: 258,
		});
		const bytes = packEnvelope(sealed);
		expect(bytes[0]).toBe(1);
		const unpacked = unpackEnvelope(bytes);
		expect(unpacked.keyVersion).toBe(258);
		expect(Buffer.from(unpacked.nonce).equals(Buffer.from(sealed.nonce))).toBe(
			true,
		);
		expect(new Uint8Array(await decryptBytes(unpacked, dek))).toEqual(
			new Uint8Array([7, 7]),
		);
	});

	it("sha256Hex ist deterministisch", () => {
		expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
	});
});

describe("LocalKms", () => {
	it("umschließt und öffnet einen DEK mit der aktuellen KEK-Version", async () => {
		const kms = kmsFor(randomKek());
		const dek = await generateDek();
		const wrapped = await wrapDek(dek, kms);
		expect(wrapped.keyVersion).toBe(1);
		const back = await unwrapDek(wrapped, kms);
		expect(Buffer.from(back).equals(Buffer.from(dek))).toBe(true);
	});

	it("scheitert mit fremdem KEK", async () => {
		const dek = await generateDek();
		const wrapped = await wrapDek(dek, kmsFor(randomKek()));
		await expect(unwrapDek(wrapped, kmsFor(randomKek()))).rejects.toThrow(
			/DEK-Unwrap/,
		);
	});

	it("kennt Rotation: alte Version bleibt lesbar", async () => {
		const v1 = randomKek();
		const v2 = randomKek();
		const kmsV1 = kmsFor(v1);
		const dek = await generateDek();
		const wrappedV1 = await wrapDek(dek, kmsV1);
		const rotated = LocalKms.fromEnv({
			VAULT_KEK_BASE64: v2,
			VAULT_KEK_VERSION: "2",
			VAULT_KEK_BASE64_V1: v1,
		});
		expect(rotated.currentKeyVersion).toBe(2);
		expect(
			Buffer.from(await unwrapDek(wrappedV1, rotated)).equals(Buffer.from(dek)),
		).toBe(true);
		expect((await wrapDek(dek, rotated)).keyVersion).toBe(2);
	});

	it("lehnt KEKs mit falscher Länge ab", () => {
		expect(() => kmsFor(Buffer.from("zu kurz").toString("base64"))).toThrow(
			/32 Byte/,
		);
	});
});
