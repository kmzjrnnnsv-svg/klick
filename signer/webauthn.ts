import {
	createHash,
	createHmac,
	createPublicKey,
	timingSafeEqual,
	verify,
} from "node:crypto";

// WebAuthn im Signer (rein, synchron, nur node:crypto): Einrichtung eines
// Sicherheitsschlüssels und Prüfung einer Bestätigung. Bewusst ohne
// @simplewebauthn/server (Abhängigkeiten, Netz bei CRLs, kein crossOrigin-
// Check). Erlaubt sind nur gerätegebundene Schlüssel (BE=0, BS=0) mit
// Nutzerverifikation und ES256 auf P-256.

export const FLAG = {
	UP: 0x01,
	UV: 0x04,
	BE: 0x08,
	BS: 0x10,
	AT: 0x40,
	ED: 0x80,
} as const;

export type WebAuthnError =
	| "encoding"
	| "mac"
	| "client_type"
	| "challenge"
	| "origin"
	| "cross_origin"
	| "rp"
	| "user_presence"
	| "user_verification"
	| "backup"
	| "attested"
	| "credential"
	| "algorithm"
	| "key_mismatch"
	| "counter"
	| "signature";

export class WebAuthnFailure extends Error {
	constructor(readonly code: WebAuthnError) {
		super(`webauthn_${code}`);
	}
}
const fail = (code: WebAuthnError): never => {
	throw new WebAuthnFailure(code);
};

const B64U = /^[A-Za-z0-9_-]*$/;
export const b64u = {
	encode: (b: Uint8Array) => Buffer.from(b).toString("base64url"),
	decode(s: unknown, max = 4096): Buffer {
		if (typeof s !== "string" || s.length > max || !B64U.test(s))
			fail("encoding");
		return Buffer.from(s as string, "base64url");
	},
};

const sha256 = (b: Uint8Array | string) =>
	createHash("sha256").update(b).digest();
const hmac = (secretHex: string, msg: string) =>
	createHmac("sha256", Buffer.from(secretHex, "hex")).update(msg).digest();

// ── CBOR (nur was ein COSE-Schlüssel braucht) ────────────────────────────

type Cbor = number | Buffer | string | Cbor[] | Map<Cbor, Cbor>;

function cborDecode(buf: Buffer, offset: number, depth = 0): [Cbor, number] {
	if (depth > 4 || offset >= buf.length) fail("encoding");
	const head = buf[offset] as number;
	const major = head >> 5;
	const info = head & 0x1f;
	let pos = offset + 1;
	let len: number;
	if (info < 24) len = info;
	else if (info === 24) {
		len = buf[pos] as number;
		pos += 1;
	} else if (info === 25) {
		len = buf.readUInt16BE(pos);
		pos += 2;
	} else return fail("encoding");
	switch (major) {
		case 0:
			return [len, pos];
		case 1:
			return [-1 - len, pos];
		case 2:
		case 3: {
			if (pos + len > buf.length) fail("encoding");
			const bytes = buf.subarray(pos, pos + len);
			return [
				major === 2 ? Buffer.from(bytes) : bytes.toString("utf8"),
				pos + len,
			];
		}
		case 4: {
			const arr: Cbor[] = [];
			for (let i = 0; i < len; i += 1) {
				const [v, next] = cborDecode(buf, pos, depth + 1);
				arr.push(v);
				pos = next;
			}
			return [arr, pos];
		}
		case 5: {
			const map = new Map<Cbor, Cbor>();
			for (let i = 0; i < len; i += 1) {
				const [k, afterKey] = cborDecode(buf, pos, depth + 1);
				const [v, afterVal] = cborDecode(buf, afterKey, depth + 1);
				if (typeof k !== "number" && typeof k !== "string") fail("encoding");
				if (map.has(k)) fail("encoding");
				map.set(k, v);
				pos = afterVal;
			}
			return [map, pos];
		}
		default:
			return fail("encoding");
	}
}

// COSE-Schlüssel: nur EC2 (kty 2), ES256 (alg −7), P-256 (crv 1)
function coseP256(map: Cbor): { x: Buffer; y: Buffer } {
	if (!(map instanceof Map)) return fail("encoding");
	if (map.get(1) !== 2 || map.get(3) !== -7 || map.get(-1) !== 1)
		fail("algorithm");
	const x = map.get(-2);
	const y = map.get(-3);
	if (
		!Buffer.isBuffer(x) ||
		!Buffer.isBuffer(y) ||
		x.length !== 32 ||
		y.length !== 32
	)
		fail("algorithm");
	return { x: x as Buffer, y: y as Buffer };
}

const SPKI_P256_PREFIX = Buffer.from(
	"3059301306072a8648ce3d020106082a8648ce3d030107034200",
	"hex",
);

export function spkiFromXY(x: Uint8Array, y: Uint8Array): Buffer {
	return Buffer.concat([SPKI_P256_PREFIX, Buffer.from([4]), x, y]);
}

function pointOfSpki(spki: Buffer): Buffer {
	if (
		spki.length !== 91 ||
		!spki.subarray(0, 26).equals(SPKI_P256_PREFIX) ||
		spki[26] !== 4
	)
		fail("algorithm");
	return spki.subarray(27);
}

// ── Authenticator-Daten und Client-Daten ─────────────────────────────────

export type AuthData = {
	rpIdHash: Buffer;
	flags: number;
	counter: number;
	attested: { aaguid: Buffer; credId: Buffer; cose: Cbor } | null;
};

export function parseAuthData(buf: Buffer): AuthData {
	if (buf.length < 37 || buf.length > 1024) fail("encoding");
	const flags = buf[32] as number;
	const out: AuthData = {
		rpIdHash: buf.subarray(0, 32),
		flags,
		counter: buf.readUInt32BE(33),
		attested: null,
	};
	let pos = 37;
	if (flags & FLAG.AT) {
		if (buf.length < pos + 18) fail("encoding");
		const aaguid = buf.subarray(pos, pos + 16);
		const len = buf.readUInt16BE(pos + 16);
		pos += 18;
		if (len < 16 || len > 1023 || buf.length < pos + len) fail("encoding");
		const credId = buf.subarray(pos, pos + len);
		pos += len;
		const [cose, next] = cborDecode(buf, pos);
		pos = next;
		out.attested = { aaguid, credId, cose };
	}
	// Erweiterungen lassen wir nicht zu (ED) — es darf nichts übrig bleiben
	if (flags & FLAG.ED || pos !== buf.length) fail("encoding");
	return out;
}

function checkClientData(
	raw: Buffer,
	want: { type: string; challenge: Uint8Array; origin: string },
) {
	if (raw.length > 2048) fail("encoding");
	let cd: Record<string, unknown>;
	try {
		cd = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
	} catch {
		return fail("encoding");
	}
	if (cd.type !== want.type) fail("client_type");
	if (cd.challenge !== b64u.encode(want.challenge)) fail("challenge");
	if (cd.origin !== want.origin) fail("origin");
	// in fremden Seiten eingebettet (iframe) nie
	if (cd.crossOrigin !== undefined && cd.crossOrigin !== false)
		fail("cross_origin");
	if (cd.topOrigin !== undefined) fail("cross_origin");
}

function checkFlags(a: AuthData, rpId: string) {
	if (!a.rpIdHash.equals(sha256(rpId))) fail("rp");
	if (!(a.flags & FLAG.UP)) fail("user_presence");
	if (!(a.flags & FLAG.UV)) fail("user_verification");
	// synchronisierbare Passkeys (BE) zählen nie als Sicherheitsschlüssel
	if (a.flags & FLAG.BE || a.flags & FLAG.BS) fail("backup");
}

const sameBytes = (a: Buffer, b: Buffer) =>
	a.length === b.length && timingSafeEqual(a, b);

// ── Einrichtung ──────────────────────────────────────────────────────────

export const enrolChallenge = (secretHex: string, enrolId: string) =>
	hmac(secretHex, `klick-enrol/v1|challenge|${enrolId}`);

export function enrolMac(
	secretHex: string,
	p: {
		enrolId: string;
		credId: string;
		clientDataJSON: Uint8Array;
		authenticatorData: Uint8Array;
		spki: Uint8Array;
	},
): Buffer {
	const h = (b: Uint8Array) => sha256(b).toString("hex");
	return hmac(
		secretHex,
		`klick-enrol/v1|${p.enrolId}|${p.credId}|${h(p.clientDataJSON)}|${h(p.authenticatorData)}|${h(p.spki)}`,
	);
}

export type EnrolInput = {
	enrolId: string;
	credId: string;
	spki: string;
	authenticatorData: string;
	clientDataJSON: string;
	mac: string;
};

export function verifyEnrolment(
	input: EnrolInput,
	ctx: { rpId: string; origin: string; secret: string },
): { credId: string; spki: string; aaguid: string; counter: number } {
	const credId = b64u.decode(input.credId, 1400);
	const spki = b64u.decode(input.spki, 200);
	const authData = b64u.decode(input.authenticatorData, 1400);
	const cdj = b64u.decode(input.clientDataJSON, 2800);
	const mac = b64u.decode(input.mac, 64);
	// zuerst das Geheimnis des Links: ohne es zählt nichts
	const want = enrolMac(ctx.secret, {
		enrolId: input.enrolId,
		credId: input.credId,
		clientDataJSON: cdj,
		authenticatorData: authData,
		spki,
	});
	if (!sameBytes(mac, want)) fail("mac");
	checkClientData(cdj, {
		type: "webauthn.create",
		challenge: enrolChallenge(ctx.secret, input.enrolId),
		origin: ctx.origin,
	});
	const a = parseAuthData(authData);
	checkFlags(a, ctx.rpId);
	if (!a.attested) return fail("attested");
	if (!a.attested.credId.equals(credId)) fail("credential");
	const { x, y } = coseP256(a.attested.cose);
	if (!pointOfSpki(spki).equals(Buffer.concat([x, y]))) fail("key_mismatch");
	return {
		credId: b64u.encode(credId),
		spki: b64u.encode(spki),
		aaguid: a.attested.aaguid.toString("hex"),
		counter: a.counter,
	};
}

// ── Bestätigung ──────────────────────────────────────────────────────────

export type AssertionInput = {
	authenticatorData: string;
	clientDataJSON: string;
	signature: string;
};

export function verifyAssertion(
	input: AssertionInput,
	ctx: {
		rpId: string;
		origin: string;
		challenge: Uint8Array;
		spki: string;
		storedCounter: number;
	},
): { counter: number } {
	const authData = b64u.decode(input.authenticatorData, 1400);
	const cdj = b64u.decode(input.clientDataJSON, 2800);
	const sig = b64u.decode(input.signature, 200);
	checkClientData(cdj, {
		type: "webauthn.get",
		challenge: ctx.challenge,
		origin: ctx.origin,
	});
	const a = parseAuthData(authData);
	checkFlags(a, ctx.rpId);
	const key = createPublicKey({
		key: b64u.decode(ctx.spki, 200),
		format: "der",
		type: "spki",
	});
	const ok = verify(
		"sha256",
		Buffer.concat([authData, sha256(cdj)]),
		{ key, dsaEncoding: "der" },
		sig,
	);
	if (!ok) fail("signature");
	// Zähler: wenn einer von beiden ≠ 0, muss er steigen (geklonter Schlüssel)
	if (
		(a.counter !== 0 || ctx.storedCounter !== 0) &&
		a.counter <= ctx.storedCounter
	)
		fail("counter");
	return { counter: a.counter };
}
