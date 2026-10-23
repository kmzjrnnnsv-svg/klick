import {
	createHash,
	createPublicKey,
	type KeyObject,
	verify,
} from "node:crypto";

// WebAuthn-Assertion ohne Klick prüfen (Prüfseite, signaturen.json): Daten
// des Authenticators, clientDataJSON, Signatur und öffentlicher Schlüssel
// (COSE, wie beim Anlegen des Passkeys gespeichert). Nur node:crypto — die
// Prüfung ist mit jeder WebAuthn-Bibliothek nachvollziehbar.

// ── minimaler CBOR-Leser (nur was COSE-Schlüssel brauchen) ───────────────
type Cbor = number | Uint8Array | string | Cbor[] | Map<number | string, Cbor>;

function readCbor(buf: Uint8Array, pos = 0): [Cbor, number] {
	const head = buf[pos] ?? 0;
	const major = head >> 5;
	const info = head & 0x1f;
	let p = pos + 1;
	let len: number;
	if (info < 24) len = info;
	else if (info === 24) len = buf[p++] ?? 0;
	else if (info === 25) {
		len = ((buf[p] ?? 0) << 8) | (buf[p + 1] ?? 0);
		p += 2;
	} else if (info === 26) {
		len = Buffer.from(buf.subarray(p, p + 4)).readUInt32BE(0);
		p += 4;
	} else throw new Error("cbor: Länge nicht unterstützt");
	switch (major) {
		case 0:
			return [len, p];
		case 1:
			return [-1 - len, p];
		case 2:
			return [buf.subarray(p, p + len), p + len];
		case 3:
			return [Buffer.from(buf.subarray(p, p + len)).toString("utf8"), p + len];
		case 4: {
			const arr: Cbor[] = [];
			for (let i = 0; i < len; i += 1) {
				const [v, q] = readCbor(buf, p);
				arr.push(v);
				p = q;
			}
			return [arr, p];
		}
		case 5: {
			const map = new Map<number | string, Cbor>();
			for (let i = 0; i < len; i += 1) {
				const [k, q] = readCbor(buf, p);
				const [v, r] = readCbor(buf, q);
				map.set(k as number | string, v);
				p = r;
			}
			return [map, p];
		}
		default:
			throw new Error("cbor: Typ nicht unterstützt");
	}
}

const b64u = (b: Cbor | undefined) => {
	if (!(b instanceof Uint8Array)) throw new Error("cose: Feld fehlt");
	return Buffer.from(b).toString("base64url");
};

// COSE-Schlüssel → KeyObject + Algorithmus (ES256, EdDSA, RS256)
export function coseToKey(cose: Uint8Array): {
	key: KeyObject;
	alg: -7 | -8 | -257;
} {
	const [m] = readCbor(cose);
	if (!(m instanceof Map)) throw new Error("cose: keine Map");
	const kty = m.get(1);
	const alg = m.get(3);
	if (kty === 2 && alg === -7 && m.get(-1) === 1)
		return {
			alg: -7,
			key: createPublicKey({
				key: {
					kty: "EC",
					crv: "P-256",
					x: b64u(m.get(-2)),
					y: b64u(m.get(-3)),
				},
				format: "jwk",
			}),
		};
	if (kty === 1 && alg === -8 && m.get(-1) === 6)
		return {
			alg: -8,
			key: createPublicKey({
				key: { kty: "OKP", crv: "Ed25519", x: b64u(m.get(-2)) },
				format: "jwk",
			}),
		};
	if (kty === 3 && alg === -257)
		return {
			alg: -257,
			key: createPublicKey({
				key: { kty: "RSA", n: b64u(m.get(-1)), e: b64u(m.get(-2)) },
				format: "jwk",
			}),
		};
	throw new Error("cose: Algorithmus nicht unterstützt");
}

export type AssertionFlags = {
	up: boolean;
	uv: boolean;
	be: boolean;
	bs: boolean;
};

export type AssertionCheck =
	| { ok: true; flags: AssertionFlags; signCount: number }
	| {
			ok: false;
			reason:
				| "client_data"
				| "type"
				| "challenge"
				| "origin"
				| "rp_id"
				| "user_presence"
				| "user_verification"
				| "signature"
				| "key";
	  };

export function verifyAssertion(input: {
	publicKeyCose: Uint8Array;
	authenticatorData: Uint8Array;
	clientDataJSON: Uint8Array;
	signature: Uint8Array;
	expectedChallenge: string;
	expectedOrigin: string;
	rpId: string;
	requireUserVerification?: boolean;
}): AssertionCheck {
	let client: {
		type?: string;
		challenge?: string;
		origin?: string;
		crossOrigin?: boolean;
	};
	try {
		client = JSON.parse(Buffer.from(input.clientDataJSON).toString("utf8"));
	} catch {
		return { ok: false, reason: "client_data" };
	}
	if (client.type !== "webauthn.get") return { ok: false, reason: "type" };
	if (client.challenge !== input.expectedChallenge)
		return { ok: false, reason: "challenge" };
	if (client.origin !== input.expectedOrigin || client.crossOrigin === true)
		return { ok: false, reason: "origin" };
	const auth = Buffer.from(input.authenticatorData);
	if (auth.length < 37) return { ok: false, reason: "rp_id" };
	const rpHash = createHash("sha256").update(input.rpId).digest();
	if (!auth.subarray(0, 32).equals(rpHash))
		return { ok: false, reason: "rp_id" };
	const flagsByte = auth[32] ?? 0;
	const flags: AssertionFlags = {
		up: (flagsByte & 0x01) !== 0,
		uv: (flagsByte & 0x04) !== 0,
		be: (flagsByte & 0x08) !== 0,
		bs: (flagsByte & 0x10) !== 0,
	};
	if (!flags.up) return { ok: false, reason: "user_presence" };
	if ((input.requireUserVerification ?? true) && !flags.uv)
		return { ok: false, reason: "user_verification" };
	let key: ReturnType<typeof coseToKey>;
	try {
		key = coseToKey(input.publicKeyCose);
	} catch {
		return { ok: false, reason: "key" };
	}
	const data = Buffer.concat([
		auth,
		createHash("sha256").update(input.clientDataJSON).digest(),
	]);
	const ok =
		key.alg === -8
			? verify(null, data, key.key, input.signature)
			: verify("sha256", data, key.key, input.signature);
	if (!ok) return { ok: false, reason: "signature" };
	return { ok: true, flags, signCount: auth.readUInt32BE(33) };
}
