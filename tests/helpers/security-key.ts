import {
	createHash,
	generateKeyPairSync,
	type KeyObject,
	randomBytes,
	sign,
} from "node:crypto";
import { enrolChallenge, enrolMac } from "@/signer/webauthn";

// Sicherheitsschlüssel in Software für Tests (P-256, ES256): erzeugt
// Einrichtungs- und Bestätigungsdaten wie ein echter Authenticator.
// Flags (UV, BE, BS …) und Zähler lassen sich verstellen, um Prüfungen des
// Signers gezielt auszulösen.

const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest();

export type KeyFlags = {
	up?: boolean;
	uv?: boolean;
	be?: boolean;
	bs?: boolean;
};

export class SoftSecurityKey {
	readonly credId = randomBytes(16);
	private readonly priv: KeyObject;
	readonly pub: KeyObject;
	counter = 0;

	constructor(
		readonly flags: KeyFlags = {},
		// echte Schlüssel zählen hoch; 0 = Zähler nicht unterstützt
		readonly countUp = true,
	) {
		const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
		this.priv = pair.privateKey;
		this.pub = pair.publicKey;
	}

	get id() {
		return b64u(this.credId);
	}

	spki(): Buffer {
		return this.pub.export({ type: "spki", format: "der" });
	}

	coseKey(alg = -7): Buffer {
		const jwk = this.pub.export({ format: "jwk" });
		const x = Buffer.from(jwk.x as string, "base64url");
		const y = Buffer.from(jwk.y as string, "base64url");
		const algByte = alg === -7 ? 0x26 : 0x38; // −7 bzw. −257 (RS256, nur Test)
		const algBytes =
			alg === -7 ? Buffer.from([algByte]) : Buffer.from([0x39, 0x01, 0x00]);
		return Buffer.concat([
			Buffer.from([0xa5, 0x01, 0x02, 0x03]),
			algBytes,
			Buffer.from([0x20, 0x01, 0x21, 0x58, 0x20]),
			x,
			Buffer.from([0x22, 0x58, 0x20]),
			y,
		]);
	}

	private flagByte(at: boolean, over: KeyFlags) {
		const f = {
			up: true,
			uv: true,
			be: false,
			bs: false,
			...this.flags,
			...over,
		};
		return (
			(f.up ? 0x01 : 0) |
			(f.uv ? 0x04 : 0) |
			(f.be ? 0x08 : 0) |
			(f.bs ? 0x10 : 0) |
			(at ? 0x40 : 0)
		);
	}

	authData(
		rpId: string,
		opts: { at?: boolean; flags?: KeyFlags; alg?: number } = {},
	) {
		const counter = Buffer.alloc(4);
		counter.writeUInt32BE(this.counter);
		const parts: Buffer[] = [
			sha(rpId),
			Buffer.from([this.flagByte(Boolean(opts.at), opts.flags ?? {})]),
			counter,
		];
		if (opts.at) {
			const len = Buffer.alloc(2);
			len.writeUInt16BE(this.credId.length);
			parts.push(Buffer.alloc(16), len, this.credId, this.coseKey(opts.alg));
		}
		return Buffer.concat(parts);
	}

	clientData(type: string, challenge: Uint8Array, origin: string, extra = {}) {
		return Buffer.from(
			JSON.stringify({
				type,
				challenge: b64u(challenge),
				origin,
				crossOrigin: false,
				...extra,
			}),
		);
	}

	// Einrichtung über den Link (Challenge und MAC aus dem Geheimnis)
	enrol(p: {
		rpId: string;
		origin: string;
		enrolId: string;
		secret: string;
		flags?: KeyFlags;
		extraClientData?: Record<string, unknown>;
		alg?: number;
	}) {
		const challenge = enrolChallenge(p.secret, p.enrolId);
		const cdj = this.clientData(
			"webauthn.create",
			challenge,
			p.origin,
			p.extraClientData,
		);
		const authData = this.authData(p.rpId, {
			at: true,
			flags: p.flags,
			alg: p.alg,
		});
		const spki = this.spki();
		const mac = enrolMac(p.secret, {
			enrolId: p.enrolId,
			credId: this.id,
			clientDataJSON: cdj,
			authenticatorData: authData,
			spki,
		});
		return {
			enrolId: p.enrolId,
			credId: this.id,
			spki: b64u(spki),
			authenticatorData: b64u(authData),
			clientDataJSON: b64u(cdj),
			mac: b64u(mac),
		};
	}

	// Bestätigung einer Absicht (Challenge = SHA-256 des kanonischen Texts)
	assert(p: {
		rpId: string;
		origin: string;
		challenge: Uint8Array;
		flags?: KeyFlags;
		extraClientData?: Record<string, unknown>;
	}) {
		if (this.countUp) this.counter += 1;
		const authData = this.authData(p.rpId, { flags: p.flags });
		const cdj = this.clientData(
			"webauthn.get",
			p.challenge,
			p.origin,
			p.extraClientData,
		);
		const signature = sign("sha256", Buffer.concat([authData, sha(cdj)]), {
			key: this.priv,
			dsaEncoding: "der",
		});
		return {
			credId: this.id,
			authenticatorData: b64u(authData),
			clientDataJSON: b64u(cdj),
			signature: b64u(signature),
		};
	}
}
