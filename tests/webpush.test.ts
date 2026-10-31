import {
	createDecipheriv,
	createECDH,
	createHmac,
	createPublicKey,
	verify,
} from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	encryptPush,
	generateVapidKeys,
	vapidAuthorization,
} from "@/lib/push/webpush";

// Web Push (RFC 8291/8292) ohne Abhängigkeit: Testvektor aus RFC 8291
// Anhang A, Rundreise mit einer Entschlüsselung wie im Browser, VAPID-JWT
// mit dem öffentlichen Schlüssel geprüft.

const u = (s: string) => Buffer.from(s, "base64url");
const hmac = (k: Buffer, d: Buffer) =>
	createHmac("sha256", k).update(d).digest();

// Entschlüsseln wie der Browser (Empfänger mit privatem Schlüssel)
function decrypt(body: Buffer, uaPrivate: Buffer, auth: Buffer): Buffer {
	const salt = body.subarray(0, 16);
	const idlen = body.readUInt8(20);
	const asPublic = body.subarray(21, 21 + idlen);
	const ct = body.subarray(21 + idlen);
	const ecdh = createECDH("prime256v1");
	ecdh.setPrivateKey(uaPrivate);
	const uaPublic = ecdh.getPublicKey();
	const secret = ecdh.computeSecret(asPublic);
	const prkKey = hmac(auth, secret);
	const ikm = hmac(
		prkKey,
		Buffer.concat([
			Buffer.from("WebPush: info\0", "latin1"),
			uaPublic,
			asPublic,
			Buffer.from([1]),
		]),
	);
	const prk = hmac(salt, ikm);
	const cek = hmac(
		prk,
		Buffer.from("Content-Encoding: aes128gcm\0\u0001", "latin1"),
	).subarray(0, 16);
	const nonce = hmac(
		prk,
		Buffer.from("Content-Encoding: nonce\0\u0001", "latin1"),
	).subarray(0, 12);
	const d = createDecipheriv("aes-128-gcm", cek, nonce);
	d.setAuthTag(ct.subarray(ct.length - 16));
	const plain = Buffer.concat([
		d.update(ct.subarray(0, ct.length - 16)),
		d.final(),
	]);
	expect(plain[plain.length - 1]).toBe(2);
	return plain.subarray(0, plain.length - 1);
}

describe("Web Push verschlüsseln", () => {
	it("entspricht dem Testvektor aus RFC 8291 Anhang A", () => {
		const body = encryptPush(
			{
				p256dh:
					"BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
				auth: "BTBZMqHH6r4Tts7J_aSIgg",
			},
			Buffer.from("When I grow up, I want to be a watermelon"),
			{
				salt: u("DGv6ra1nlYgDCS1FRnbzlw"),
				asPrivateKey: u("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"),
			},
		);
		expect(body.toString("base64url")).toBe(
			"DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
		);
	});

	it("Rundreise: der Browser liest genau den Text", () => {
		const ua = createECDH("prime256v1");
		ua.generateKeys();
		const auth = Buffer.alloc(16, 7);
		const text = JSON.stringify({
			title: "Freigabe angefragt",
			url: "/heute/freigaben",
		});
		const body = encryptPush(
			{
				p256dh: ua.getPublicKey().toString("base64url"),
				auth: auth.toString("base64url"),
			},
			Buffer.from(text),
		);
		expect(decrypt(body, ua.getPrivateKey(), auth).toString()).toBe(text);
	});

	it("lehnt falsche Schlüssel und zu große Nachrichten ab", () => {
		expect(() =>
			encryptPush(
				{ p256dh: "AAAA", auth: "BTBZMqHH6r4Tts7J_aSIgg" },
				Buffer.from("x"),
			),
		).toThrow("push_bad_keys");
		const ua = createECDH("prime256v1");
		ua.generateKeys();
		expect(() =>
			encryptPush(
				{
					p256dh: ua.getPublicKey().toString("base64url"),
					auth: "BTBZMqHH6r4Tts7J_aSIgg",
				},
				Buffer.alloc(5000),
			),
		).toThrow("push_too_large");
	});
});

describe("VAPID", () => {
	it("signiert ein JWT für die Herkunft des Push-Dienstes", () => {
		const keys = {
			...generateVapidKeys(),
			subject: "mailto:no-reply@raza.work",
		};
		const header = vapidAuthorization(
			"https://fcm.googleapis.com/fcm/send/abc",
			keys,
			1_700_000_000_000,
		);
		const m = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
		expect(m).not.toBeNull();
		const [, h, p, sig, k] = m as unknown as string[];
		expect(k).toBe(keys.publicKey);
		const payload = JSON.parse(Buffer.from(p ?? "", "base64url").toString());
		expect(payload).toEqual({
			aud: "https://fcm.googleapis.com",
			exp: 1_700_000_000 + 12 * 3600,
			sub: "mailto:no-reply@raza.work",
		});
		const pub = u(keys.publicKey);
		const key = createPublicKey({
			key: {
				kty: "EC",
				crv: "P-256",
				x: pub.subarray(1, 33).toString("base64url"),
				y: pub.subarray(33).toString("base64url"),
			},
			format: "jwk",
		});
		expect(
			verify(
				"sha256",
				Buffer.from(`${h}.${p}`),
				{ key, dsaEncoding: "ieee-p1363" },
				u(sig ?? ""),
			),
		).toBe(true);
	});
});
