import {
	createCipheriv,
	createECDH,
	createHmac,
	createPrivateKey,
	randomBytes,
	sign,
} from "node:crypto";

// Web Push ohne Abhängigkeit (Push-Benachrichtigungen je Person): Inhalt
// Ende-zu-Ende verschlüsselt für den Browser (RFC 8291, aes128gcm), der
// Push-Dienst (Google, Apple, Mozilla, Microsoft) sieht nur Bytes. Anmeldung
// beim Dienst per VAPID (RFC 8292, ES256). Schlüssel als base64url: öffentlich
// 65 Byte (unkomprimierter P-256-Punkt), privat 32 Byte.

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type VapidKeys = {
	publicKey: string;
	privateKey: string;
	subject: string;
};

const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url");
const fromB64u = (s: string) => Buffer.from(s, "base64url");

function hkdfExtract(salt: Buffer, ikm: Buffer): Buffer {
	return createHmac("sha256", salt).update(ikm).digest();
}

// Ein Block reicht: alle Längen hier ≤ 32 Byte
function hkdfExpand(prk: Buffer, info: Buffer, length: number): Buffer {
	return createHmac("sha256", prk)
		.update(Buffer.concat([info, Buffer.from([1])]))
		.digest()
		.subarray(0, length);
}

const RECORD_SIZE = 4096;
// Puffer für Kopf, Trenner und Prüfsumme; Push-Dienste nehmen ≥ 4 KB
export const MAX_PLAINTEXT = 3000;

// Nachricht verschlüsseln (RFC 8291 §3.4, ein Datensatz). salt und
// asPrivateKey nur für Testvektoren.
export function encryptPush(
	target: Pick<PushTarget, "p256dh" | "auth">,
	plaintext: Buffer,
	opts: { salt?: Buffer; asPrivateKey?: Buffer } = {},
): Buffer {
	if (plaintext.length > MAX_PLAINTEXT) throw new Error("push_too_large");
	const uaPublic = fromB64u(target.p256dh);
	const authSecret = fromB64u(target.auth);
	if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length !== 16)
		throw new Error("push_bad_keys");
	const ecdh = createECDH("prime256v1");
	if (opts.asPrivateKey) ecdh.setPrivateKey(opts.asPrivateKey);
	else ecdh.generateKeys();
	const asPublic = ecdh.getPublicKey();
	const ecdhSecret = ecdh.computeSecret(uaPublic);
	const prkKey = hkdfExtract(authSecret, ecdhSecret);
	const keyInfo = Buffer.concat([
		Buffer.from("WebPush: info\0", "latin1"),
		uaPublic,
		asPublic,
	]);
	const ikm = hkdfExpand(prkKey, keyInfo, 32);
	const salt = opts.salt ?? randomBytes(16);
	const prk = hkdfExtract(salt, ikm);
	const cek = hkdfExpand(
		prk,
		Buffer.from("Content-Encoding: aes128gcm\0", "latin1"),
		16,
	);
	const nonce = hkdfExpand(
		prk,
		Buffer.from("Content-Encoding: nonce\0", "latin1"),
		12,
	);
	const cipher = createCipheriv("aes-128-gcm", cek, nonce);
	const body = Buffer.concat([
		cipher.update(Buffer.concat([plaintext, Buffer.from([2])])),
		cipher.final(),
		cipher.getAuthTag(),
	]);
	const header = Buffer.alloc(16 + 4 + 1);
	salt.copy(header, 0);
	header.writeUInt32BE(RECORD_SIZE, 16);
	header.writeUInt8(asPublic.length, 20);
	return Buffer.concat([header, asPublic, body]);
}

// VAPID-Kopfzeile für einen Push-Dienst (aud = Herkunft des Endpunkts)
export function vapidAuthorization(
	endpoint: string,
	keys: VapidKeys,
	nowMs: number,
): string {
	const pub = fromB64u(keys.publicKey);
	if (pub.length !== 65 || pub[0] !== 4) throw new Error("vapid_bad_key");
	const key = createPrivateKey({
		key: {
			kty: "EC",
			crv: "P-256",
			d: keys.privateKey,
			x: b64u(pub.subarray(1, 33)),
			y: b64u(pub.subarray(33, 65)),
		},
		format: "jwk",
	});
	const header = b64u(
		Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })),
	);
	const payload = b64u(
		Buffer.from(
			JSON.stringify({
				aud: new URL(endpoint).origin,
				exp: Math.floor(nowMs / 1000) + 12 * 3600,
				sub: keys.subject,
			}),
		),
	);
	const data = `${header}.${payload}`;
	const sig = sign("sha256", Buffer.from(data), {
		key,
		dsaEncoding: "ieee-p1363",
	});
	return `vapid t=${data}.${b64u(sig)}, k=${keys.publicKey}`;
}

// Neues VAPID-Schlüsselpaar (Skript push:keys)
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
	const ecdh = createECDH("prime256v1");
	ecdh.generateKeys();
	return {
		publicKey: b64u(ecdh.getPublicKey()),
		// immer 32 Byte (führende Nullen), sonst lehnt JWK den Schlüssel ab
		privateKey: b64u(
			Buffer.concat([Buffer.alloc(32), ecdh.getPrivateKey()]).subarray(-32),
		),
	};
}
