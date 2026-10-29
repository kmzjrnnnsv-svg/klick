import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { describe, expect, it } from "vitest";
import {
	checkSeal,
	encodeSignText,
	parseSignText,
	type SignFields,
	sealSignText,
	signChallenge,
} from "@/lib/signatures/canonical";
import { checkDocumentSignature } from "@/lib/signatures/document";
import {
	merkleLeaf,
	merkleProof,
	merkleRoot,
	verifyMerkleProof,
} from "@/lib/signatures/merkle";
import { checkSignature } from "@/lib/signatures/report";
import { coseToKey, verifyAssertion } from "@/lib/signatures/verify";

const FIELDS: SignFields = {
	org: "2ad9b86d-857b-4165-8f02-d645992067dc",
	target: "evidence:4a26dca6-43ba-48e4-8c52-0c20c2cb24af",
	hash: "ab".repeat(32),
	signer: "290cecfb-8c8c-4eee-b376-2fc8b2e5b70c",
	function: "management_body",
	purpose: "approve",
	nonce: "0123456789abcdef0123456789abcdef",
	expires: "2026-10-23T12:10:00Z",
};

describe("kanonischer Unterschriftstext", () => {
	it("Rundreise und feste Reihenfolge", () => {
		const text = encodeSignText(FIELDS);
		expect(text.startsWith("klick-sign/v1|2ad9b86d-")).toBe(true);
		expect(parseSignText(text)).toEqual(FIELDS);
	});

	it("lehnt Trennzeichen, Zeilenumbrüche und fremde Felder ab", () => {
		expect(() =>
			encodeSignText({ ...FIELDS, function: "management_body|x" }),
		).toThrow();
		expect(() =>
			encodeSignText({ ...FIELDS, hash: `${"a".repeat(63)}\n` }),
		).toThrow();
		expect(parseSignText(`${encodeSignText(FIELDS)}|extra`)).toBeNull();
		expect(
			parseSignText(encodeSignText(FIELDS).replace("v1", "v2")),
		).toBeNull();
		expect(
			parseSignText(encodeSignText(FIELDS).replace("approve", "steal")),
		).toBeNull();
	});

	it("Siegel: nur vom Server ausgestellte Texte gelten", () => {
		const text = encodeSignText(FIELDS);
		const seal = sealSignText(text, "geheim");
		expect(checkSeal(text, seal, "geheim")).toBe(true);
		expect(checkSeal(text, seal, "anders")).toBe(false);
		expect(checkSeal(text.replace("approve", "review"), seal, "geheim")).toBe(
			false,
		);
	});
});

describe("Merkle-Sammelunterschrift", () => {
	const leaves = [1, 2, 3, 4, 5].map((i) =>
		merkleLeaf(`id-${i}`, String(i).repeat(64)),
	);
	it("jeder Nachweis lässt sich gegen die Wurzel prüfen", () => {
		const root = merkleRoot(leaves);
		leaves.forEach((leaf, i) => {
			expect(verifyMerkleProof(leaf, merkleProof(leaves, i), root)).toBe(true);
		});
	});
	it("ein fremder oder geänderter Nachweis passt nicht", () => {
		const root = merkleRoot(leaves);
		const forged = merkleLeaf("id-9", "9".repeat(64));
		expect(verifyMerkleProof(forged, merkleProof(leaves, 0), root)).toBe(false);
		expect(merkleRoot([leaves[0] ?? ""])).toBe(leaves[0]);
	});
});

// ── Software-Authenticator (ES256) ───────────────────────────────────────
function cborEncode(v: unknown): Buffer {
	const head = (major: number, n: number) =>
		n < 24
			? Buffer.from([(major << 5) | n])
			: n < 256
				? Buffer.from([(major << 5) | 24, n])
				: Buffer.from([(major << 5) | 25, n >> 8, n & 0xff]);
	if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
	if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
	if (v instanceof Map) {
		const parts: Buffer[] = [head(5, v.size)];
		for (const [k, x] of v) parts.push(cborEncode(k), cborEncode(x));
		return Buffer.concat(parts);
	}
	throw new Error("cbor");
}

function authenticator(rpId: string) {
	const { publicKey, privateKey } = generateKeyPairSync("ec", {
		namedCurve: "P-256",
	});
	const jwk = publicKey.export({ format: "jwk" });
	const cose = cborEncode(
		new Map<number, unknown>([
			[1, 2],
			[3, -7],
			[-1, 1],
			[-2, Buffer.from(jwk.x ?? "", "base64url")],
			[-3, Buffer.from(jwk.y ?? "", "base64url")],
		]),
	);
	const assert = (
		challenge: string,
		opts: { origin?: string; flags?: number; counter?: number } = {},
	) => {
		const authData = Buffer.concat([
			createHash("sha256").update(rpId).digest(),
			Buffer.from([opts.flags ?? 0x05]),
			Buffer.from([0, 0, 0, opts.counter ?? 1]),
		]);
		const clientDataJSON = Buffer.from(
			JSON.stringify({
				type: "webauthn.get",
				challenge,
				origin: opts.origin ?? "https://raza.work",
				crossOrigin: false,
			}),
		);
		const signature = sign(
			"sha256",
			Buffer.concat([
				authData,
				createHash("sha256").update(clientDataJSON).digest(),
			]),
			privateKey,
		);
		return { authData, clientDataJSON, signature };
	};
	return { cose, assert };
}

describe("Assertion offline prüfen", () => {
	const rpId = "raza.work";
	const origin = "https://raza.work";
	const a = authenticator(rpId);
	const challenge = signChallenge(encodeSignText(FIELDS));
	const check = (
		x: ReturnType<typeof a.assert>,
		over: Partial<Parameters<typeof verifyAssertion>[0]> = {},
	) =>
		verifyAssertion({
			publicKeyCose: a.cose,
			authenticatorData: x.authData,
			clientDataJSON: x.clientDataJSON,
			signature: x.signature,
			expectedChallenge: challenge,
			expectedOrigin: origin,
			rpId,
			...over,
		});

	it("gültige Unterschrift mit Nutzerverifikation", () => {
		const r = check(a.assert(challenge));
		expect(r).toEqual({
			ok: true,
			flags: { up: true, uv: true, be: false, bs: false },
			signCount: 1,
		});
		expect(coseToKey(a.cose).alg).toBe(-7);
	});

	it("dieselbe Prüfung wie @simplewebauthn/server", async () => {
		const x = a.assert(challenge, { counter: 5 });
		const res = await verifyAuthenticationResponse({
			response: {
				id: "cred",
				rawId: "cred",
				type: "public-key",
				clientExtensionResults: {},
				response: {
					authenticatorData: x.authData.toString("base64url"),
					clientDataJSON: x.clientDataJSON.toString("base64url"),
					signature: x.signature.toString("base64url"),
				},
			},
			expectedChallenge: challenge,
			expectedOrigin: origin,
			expectedRPID: rpId,
			credential: { id: "cred", publicKey: new Uint8Array(a.cose), counter: 0 },
			requireUserVerification: true,
		});
		expect(res.verified).toBe(true);
		expect(check(x).ok).toBe(true);
	});

	it("lehnt anderen Text, fremde Herkunft, fehlende UV, falschen Schlüssel ab", () => {
		const other = signChallenge(
			encodeSignText({ ...FIELDS, hash: "cd".repeat(32) }),
		);
		expect(check(a.assert(other))).toEqual({ ok: false, reason: "challenge" });
		expect(
			check(a.assert(challenge, { origin: "https://evil.example" })),
		).toEqual({
			ok: false,
			reason: "origin",
		});
		expect(check(a.assert(challenge, { flags: 0x01 }))).toEqual({
			ok: false,
			reason: "user_verification",
		});
		expect(check(a.assert(challenge), { rpId: "evil.example" })).toEqual({
			ok: false,
			reason: "rp_id",
		});
		const b = authenticator(rpId);
		expect(check(b.assert(challenge))).toEqual({
			ok: false,
			reason: "signature",
		});
	});
});

describe("Prüfbericht gespeicherter Unterschriften", () => {
	const rpId = "raza.work";
	const env = { origin: "https://raza.work", rpId };
	const a = authenticator(rpId);
	const ev = "4a26dca6-43ba-48e4-8c52-0c20c2cb24af";
	const ev2 = "5b37edb7-54cb-49f5-9d63-1d31d3dc35b0";
	const row = (text: string, extra: Record<string, unknown> = {}) => {
		const x = a.assert(signChallenge(text));
		return {
			evidenceId: ev,
			organizationId: FIELDS.org,
			sha256: FIELDS.hash,
			signerUserId: FIELDS.signer,
			signText: text,
			publicKey: a.cose.toString("base64url"),
			authenticatorData: x.authData.toString("base64url"),
			clientDataJSON: x.clientDataJSON.toString("base64url"),
			signature: x.signature.toString("base64url"),
			batchId: null as string | null,
			merkleRoot: null as string | null,
			merkleProof: null as { side: "L" | "R"; hash: string }[] | null,
			...extra,
		};
	};

	it("Einzelunterschrift gültig; andere Datei-Prüfsumme fällt auf", () => {
		const text = encodeSignText({ ...FIELDS, target: `evidence:${ev}` });
		expect(checkSignature(row(text), env).valid).toBe(true);
		const tampered = checkSignature(
			row(text, { sha256: "cd".repeat(32) }),
			env,
		);
		expect(tampered.text).toBe(false);
		expect(tampered.valid).toBe(false);
	});

	it("Sammelunterschrift: Pfad zur Wurzel je Nachweis", () => {
		const leaves = [
			merkleLeaf(ev, FIELDS.hash),
			merkleLeaf(ev2, "ef".repeat(32)),
		];
		const root = merkleRoot(leaves);
		const batchId = "6c48fec8-65dc-4a06-8e74-2e42e4ed46c1";
		const text = encodeSignText({
			...FIELDS,
			target: `batch:${batchId}`,
			hash: root,
		});
		const ok = checkSignature(
			row(text, {
				batchId,
				merkleRoot: root,
				merkleProof: merkleProof(leaves, 0),
			}),
			env,
		);
		expect(ok).toMatchObject({ text: true, merkle: true, valid: true });
		const wrong = checkSignature(
			row(text, {
				batchId,
				merkleRoot: root,
				merkleProof: merkleProof(leaves, 1),
			}),
			env,
		);
		expect(wrong.merkle).toBe(false);
		expect(wrong.valid).toBe(false);
	});
});

describe("Unterschrift unter einer Dokument-Fassung", () => {
	const rpId = "raza.work";
	const origin = "https://raza.work";
	const env = { origin, rpId };
	const a = authenticator(rpId);
	const versionId = "7b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
	const fields: SignFields = {
		...FIELDS,
		target: `docver:${versionId}`,
		hash: "cd".repeat(32),
	};
	const text = encodeSignText(fields);
	const x = a.assert(signChallenge(text));
	const row = {
		organizationId: fields.org,
		versionId,
		contentSha256: fields.hash,
		signerUserId: fields.signer,
		signText: text,
		publicKey: a.cose.toString("base64url"),
		authenticatorData: x.authData.toString("base64url"),
		clientDataJSON: x.clientDataJSON.toString("base64url"),
		signature: x.signature.toString("base64url"),
	};

	it("Ziel docver: Rundreise", () => {
		expect(parseSignText(text)).toEqual(fields);
		expect(parseSignText(text.replace("docver:", "document:"))).toBeNull();
	});

	it("gültig, solange die Fassung ihre Prüfsumme behält", () => {
		expect(checkDocumentSignature(row, env, fields.hash).valid).toBe(true);
		expect(checkDocumentSignature(row, env).valid).toBe(true);
	});

	it("ungültig bei geändertem Text, anderer Fassung oder Person", () => {
		expect(checkDocumentSignature(row, env, "ef".repeat(32)).valid).toBe(false);
		expect(
			checkDocumentSignature(
				{ ...row, versionId: "00000000-0000-4000-8000-000000000000" },
				env,
			).valid,
		).toBe(false);
		expect(
			checkDocumentSignature(
				{ ...row, signerUserId: "00000000-0000-4000-8000-000000000001" },
				env,
			).valid,
		).toBe(false);
		expect(
			checkDocumentSignature(row, { origin: "https://evil.example", rpId })
				.valid,
		).toBe(false);
	});
});
