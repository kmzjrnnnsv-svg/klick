import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Unterschrift per Passkey (N4): der kanonische Text legt fest, WAS
// unterschrieben wird. Die WebAuthn-Challenge ist SHA-256 über diesen Text,
// damit bindet die Assertion Organisation, Nachweis, Prüfsumme, Person,
// Funktion, Zweck, Einmalwert und Ablauf. Jedes Feld hat ein festes Muster
// — kein Freitext, kein Trennzeichen im Feld.

export const SIGN_PURPOSES = ["approve", "acknowledge", "review"] as const;
export type SignPurpose = (typeof SIGN_PURPOSES)[number];

export type SignFields = {
	org: string;
	// evidence:<uuid> oder batch:<uuid> (Sammelunterschrift über Merkle-Wurzel)
	target: string;
	// SHA-256 der Datei bzw. Merkle-Wurzel, 64 hex
	hash: string;
	signer: string;
	// Funktion (role function) oder „-“
	function: string;
	purpose: SignPurpose;
	nonce: string;
	// ISO-Zeit, sekundengenau, UTC
	expires: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PATTERNS: Record<keyof SignFields, RegExp> = {
	org: UUID,
	target:
		/^(evidence|batch):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
	hash: /^[0-9a-f]{64}$/,
	signer: UUID,
	function: /^(-|[a-z][a-z_]{1,39})$/,
	purpose: new RegExp(`^(${SIGN_PURPOSES.join("|")})$`),
	nonce: /^[0-9a-f]{32}$/,
	expires: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
};
const ORDER: (keyof SignFields)[] = [
	"org",
	"target",
	"hash",
	"signer",
	"function",
	"purpose",
	"nonce",
	"expires",
];
const PREFIX = "klick-sign/v1";

export function encodeSignText(f: SignFields): string {
	for (const k of ORDER)
		if (!PATTERNS[k].test(f[k])) throw new Error(`sign: Feld ${k} ungültig`);
	return [PREFIX, ...ORDER.map((k) => f[k])].join("|");
}

export function parseSignText(text: string): SignFields | null {
	const parts = text.split("|");
	if (parts.length !== ORDER.length + 1 || parts[0] !== PREFIX) return null;
	const f = Object.fromEntries(
		ORDER.map((k, i) => [k, parts[i + 1] ?? ""]),
	) as SignFields;
	for (const k of ORDER) if (!PATTERNS[k].test(f[k])) return null;
	// Rundreise: nur genau diese Kodierung gilt
	return encodeSignText(f) === text ? f : null;
}

export const base64url = (b: Uint8Array | Buffer): string =>
	Buffer.from(b).toString("base64url");

// WebAuthn-Challenge = SHA-256(Text), base64url
export const signChallenge = (text: string): string =>
	base64url(createHash("sha256").update(text, "utf8").digest());

// Zustandslos ausgestellt: der Server signiert den Text mit einem eigenen
// Schlüssel, beim Einreichen zählt nur ein Text, den er selbst ausgestellt hat
export function sealSignText(text: string, secret: string): string {
	return base64url(
		createHmac("sha256", `klick-sign|${secret}`).update(text).digest(),
	);
}

export function checkSeal(text: string, seal: string, secret: string): boolean {
	const want = Buffer.from(sealSignText(text, secret));
	const got = Buffer.from(seal);
	return want.length === got.length && timingSafeEqual(want, got);
}
