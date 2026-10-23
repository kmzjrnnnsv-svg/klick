import { createHash, randomBytes } from "node:crypto";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { describe, expect, it } from "vitest";
import {
	enrolMac,
	parseAuthData,
	verifyAssertion,
	verifyEnrolment,
	WebAuthnFailure,
} from "@/signer/webauthn";
import { SoftSecurityKey } from "./helpers/security-key";

// Eigener ES256-Prüfer des Signers gegen einen Software-Schlüssel; der
// gültige Fall zusätzlich gegen @simplewebauthn/server als Vergleich.

const RP = "freigabe.raza.work";
const ORIGIN = `https://${RP}`;
const SECRET = randomBytes(32).toString("hex");
const ENROL = randomBytes(16).toString("hex");
const CHALLENGE = createHash("sha256").update("klick-wallet/v1|…").digest();

const code = (fn: () => unknown) => {
	try {
		fn();
	} catch (e) {
		if (e instanceof WebAuthnFailure) return e.code;
		throw e;
	}
	return "ok";
};

const enrolCtx = { rpId: RP, origin: ORIGIN, secret: SECRET };

describe("Einrichtung", () => {
	it("gültig: Schlüssel, Zähler, AAGUID", () => {
		const k = new SoftSecurityKey();
		const out = verifyEnrolment(
			k.enrol({ rpId: RP, origin: ORIGIN, enrolId: ENROL, secret: SECRET }),
			enrolCtx,
		);
		expect(out.credId).toBe(k.id);
		expect(out.aaguid).toBe("0".repeat(32));
		expect(Buffer.from(out.spki, "base64url").equals(k.spki())).toBe(true);
	});

	it("ohne das Geheimnis des Links zählt nichts", () => {
		const k = new SoftSecurityKey();
		const data = k.enrol({
			rpId: RP,
			origin: ORIGIN,
			enrolId: ENROL,
			secret: randomBytes(32).toString("hex"),
		});
		expect(code(() => verifyEnrolment(data, enrolCtx))).toBe("mac");
	});

	it("synchronisierte Passkeys (BE/BS) und ohne Nutzerverifikation abgelehnt", () => {
		const base = { rpId: RP, origin: ORIGIN, enrolId: ENROL, secret: SECRET };
		const be = new SoftSecurityKey({ be: true });
		expect(code(() => verifyEnrolment(be.enrol(base), enrolCtx))).toBe(
			"backup",
		);
		const bs = new SoftSecurityKey({ be: true, bs: true });
		expect(code(() => verifyEnrolment(bs.enrol(base), enrolCtx))).toBe(
			"backup",
		);
		const nouv = new SoftSecurityKey({ uv: false });
		expect(code(() => verifyEnrolment(nouv.enrol(base), enrolCtx))).toBe(
			"user_verification",
		);
	});

	it("fremde Herkunft, iframe, falscher Algorithmus", () => {
		const k = new SoftSecurityKey();
		const base = { rpId: RP, origin: ORIGIN, enrolId: ENROL, secret: SECRET };
		expect(
			code(() =>
				verifyEnrolment(
					k.enrol({ ...base, origin: "https://raza.work" }),
					enrolCtx,
				),
			),
		).toBe("origin");
		expect(
			code(() =>
				verifyEnrolment(
					k.enrol({ ...base, extraClientData: { crossOrigin: true } }),
					enrolCtx,
				),
			),
		).toBe("cross_origin");
		expect(
			code(() =>
				verifyEnrolment(
					k.enrol({
						...base,
						extraClientData: { topOrigin: "https://evil.example" },
					}),
					enrolCtx,
				),
			),
		).toBe("cross_origin");
		expect(
			code(() => verifyEnrolment(k.enrol({ ...base, alg: -257 }), enrolCtx)),
		).toBe("algorithm");
		expect(
			code(() =>
				verifyEnrolment(k.enrol({ ...base, rpId: "raza.work" }), enrolCtx),
			),
		).toBe("rp");
	});

	it("SPKI passt nicht zum Schlüssel in den Authenticator-Daten", () => {
		const k = new SoftSecurityKey();
		const other = new SoftSecurityKey();
		const data = k.enrol({
			rpId: RP,
			origin: ORIGIN,
			enrolId: ENROL,
			secret: SECRET,
		});
		// MAC korrekt über die fremde SPKI — nur der Abgleich darf greifen
		const spki = other.spki();
		const mac = enrolMac(SECRET, {
			enrolId: ENROL,
			credId: data.credId,
			clientDataJSON: Buffer.from(data.clientDataJSON, "base64url"),
			authenticatorData: Buffer.from(data.authenticatorData, "base64url"),
			spki,
		});
		expect(
			code(() =>
				verifyEnrolment(
					{
						...data,
						spki: spki.toString("base64url"),
						mac: mac.toString("base64url"),
					},
					enrolCtx,
				),
			),
		).toBe("key_mismatch");
	});
});

describe("Bestätigung", () => {
	const enrolled = (k: SoftSecurityKey) =>
		verifyEnrolment(
			k.enrol({ rpId: RP, origin: ORIGIN, enrolId: ENROL, secret: SECRET }),
			enrolCtx,
		);
	const ctx = (spki: string, storedCounter = 0) => ({
		rpId: RP,
		origin: ORIGIN,
		challenge: CHALLENGE,
		spki,
		storedCounter,
	});

	it("gültig — und simplewebauthn sieht es genauso", async () => {
		const k = new SoftSecurityKey();
		const { spki } = enrolled(k);
		const a = k.assert({ rpId: RP, origin: ORIGIN, challenge: CHALLENGE });
		expect(verifyAssertion(a, ctx(spki))).toEqual({ counter: 1 });
		const ref = await verifyAuthenticationResponse({
			response: {
				id: a.credId,
				rawId: a.credId,
				type: "public-key",
				clientExtensionResults: {},
				response: {
					authenticatorData: a.authenticatorData,
					clientDataJSON: a.clientDataJSON,
					signature: a.signature,
				},
			},
			expectedChallenge: Buffer.from(CHALLENGE).toString("base64url"),
			expectedOrigin: ORIGIN,
			expectedRPID: RP,
			requireUserVerification: true,
			credential: {
				id: a.credId,
				publicKey: new Uint8Array(k.coseKey()),
				counter: 0,
			},
		});
		expect(ref.verified).toBe(true);
	});

	it("falsche Challenge, Herkunft, rpId, Typ", () => {
		const k = new SoftSecurityKey();
		const { spki } = enrolled(k);
		const other = createHash("sha256").update("anders").digest();
		expect(
			code(() =>
				verifyAssertion(
					k.assert({ rpId: RP, origin: ORIGIN, challenge: other }),
					ctx(spki),
				),
			),
		).toBe("challenge");
		expect(
			code(() =>
				verifyAssertion(
					k.assert({
						rpId: RP,
						origin: "https://raza.work",
						challenge: CHALLENGE,
					}),
					ctx(spki),
				),
			),
		).toBe("origin");
		expect(
			code(() =>
				verifyAssertion(
					k.assert({ rpId: "raza.work", origin: ORIGIN, challenge: CHALLENGE }),
					ctx(spki),
				),
			),
		).toBe("rp");
		expect(
			code(() =>
				verifyAssertion(
					k.assert({
						rpId: RP,
						origin: ORIGIN,
						challenge: CHALLENGE,
						extraClientData: { type: "webauthn.create" },
					}),
					ctx(spki),
				),
			),
		).toBe("client_type");
	});

	it("iframe, ohne UV/UP, BE gesetzt", () => {
		const k = new SoftSecurityKey();
		const { spki } = enrolled(k);
		const base = { rpId: RP, origin: ORIGIN, challenge: CHALLENGE };
		expect(
			code(() =>
				verifyAssertion(
					k.assert({ ...base, extraClientData: { crossOrigin: true } }),
					ctx(spki),
				),
			),
		).toBe("cross_origin");
		expect(
			code(() =>
				verifyAssertion(k.assert({ ...base, flags: { uv: false } }), ctx(spki)),
			),
		).toBe("user_verification");
		expect(
			code(() =>
				verifyAssertion(k.assert({ ...base, flags: { up: false } }), ctx(spki)),
			),
		).toBe("user_presence");
		expect(
			code(() =>
				verifyAssertion(k.assert({ ...base, flags: { be: true } }), ctx(spki)),
			),
		).toBe("backup");
	});

	it("fremder Schlüssel und manipulierte Daten: Signatur", () => {
		const k = new SoftSecurityKey();
		const other = new SoftSecurityKey();
		const { spki } = enrolled(other);
		expect(
			code(() =>
				verifyAssertion(
					k.assert({ rpId: RP, origin: ORIGIN, challenge: CHALLENGE }),
					ctx(spki),
				),
			),
		).toBe("signature");
		const mine = enrolled(k);
		const a = k.assert({ rpId: RP, origin: ORIGIN, challenge: CHALLENGE });
		const ad = Buffer.from(a.authenticatorData, "base64url");
		ad[36] = (ad[36] as number) ^ 1; // Zähler verändert
		expect(
			code(() =>
				verifyAssertion(
					{ ...a, authenticatorData: ad.toString("base64url") },
					ctx(mine.spki),
				),
			),
		).toBe("signature");
	});

	it("Zähler muss steigen (Wiederholung, geklonter Schlüssel)", () => {
		const k = new SoftSecurityKey();
		const { spki } = enrolled(k);
		const a = k.assert({ rpId: RP, origin: ORIGIN, challenge: CHALLENGE });
		expect(verifyAssertion(a, ctx(spki, 0)).counter).toBe(1);
		expect(code(() => verifyAssertion(a, ctx(spki, 1)))).toBe("counter");
		// Schlüssel ohne Zähler (immer 0) bleibt erlaubt
		const flat = new SoftSecurityKey({}, false);
		const f = enrolled(flat);
		const b = flat.assert({ rpId: RP, origin: ORIGIN, challenge: CHALLENGE });
		expect(verifyAssertion(b, ctx(f.spki, 0)).counter).toBe(0);
	});

	it("Authenticator-Daten: Erweiterungen und Reste abgelehnt", () => {
		const k = new SoftSecurityKey();
		const ad = k.authData(RP);
		expect(parseAuthData(ad).counter).toBe(0);
		expect(
			code(() => parseAuthData(Buffer.concat([ad, Buffer.from([0])]))),
		).toBe("encoding");
		const ed = Buffer.from(ad);
		ed[32] = (ed[32] as number) | 0x80;
		expect(code(() => parseAuthData(ed))).toBe("encoding");
		expect(code(() => parseAuthData(ad.subarray(0, 30)))).toBe("encoding");
	});
});
