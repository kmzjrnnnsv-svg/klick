import { X509Certificate } from "node:crypto";
import { SAML_SECURITY } from "./sso-policy";
import { SAML_DIGEST_ALGORITHMS, SAML_SIGNATURE_ALGORITHMS } from "./sso-saml";

// Metadaten eines SAML-Anbieters lesen (AP10), ohne XML-Bibliothek: nur die
// Stellen, die Klick braucht (Entity-ID, Anmeldeadresse, Signatur-
// Zertifikate). DOCTYPE/ENTITY werden abgelehnt (XXE), Größe wie im Plugin.
// Die Prüfung der Signatur übernimmt bei der Anmeldung das Plugin; hier geht
// es um Einrichtung, Anzeige und die Beobachtung des Zertifikats.

export type CertInfo = {
	fingerprint: string;
	notBefore: string;
	notAfter: string;
	subject: string;
	keyType: string;
	keyBits: number | null;
	// Base64 ohne Kopf/Fuß (für die Einrichtung ohne Metadaten-Datei)
	der: string;
};

export type MetadataWarning =
	| "cert_expired"
	| "cert_expires_soon"
	| "weak_key"
	| "weak_algorithm"
	| "no_post_or_redirect";

export type IdpMetadata = {
	entityId: string;
	ssoUrl: string | null;
	certificates: CertInfo[];
	warnings: MetadataWarning[];
};

export type MetadataError =
	| "metadata_too_large"
	| "metadata_doctype"
	| "metadata_invalid"
	| "metadata_many_entities"
	| "metadata_no_idp"
	| "metadata_no_cert"
	| "metadata_cert_invalid";

const DAY = 86_400_000;
const REDIRECT = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect";
const POST = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST";

function decodeXmlText(s: string): string {
	return s
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, n) =>
			String.fromCodePoint(Number.parseInt(n, 16)),
		)
		.replace(/&amp;/g, "&");
}

// Wert eines Attributs in einem Start-Tag (Name ohne Präfix)
function attr(tag: string, name: string): string | null {
	const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag);
	if (!m) return null;
	return decodeXmlText(m[2] ?? m[3] ?? "");
}

// Start-Tags eines Elements (beliebiges Präfix)
function startTags(xml: string, local: string): { tag: string; at: number }[] {
	const re = new RegExp(
		`<(?:[A-Za-z_][\\w.-]*:)?${local}(?=[\\s/>])[^>]*>`,
		"g",
	);
	const out: { tag: string; at: number }[] = [];
	for (let m = re.exec(xml); m; m = re.exec(xml))
		out.push({ tag: m[0], at: m.index });
	return out;
}

// Inhalt des ersten Elements ab `from` bis zum passenden Ende (nicht
// verschachtelt: reicht für IDPSSODescriptor, KeyDescriptor)
function block(xml: string, local: string, from = 0): string | null {
	const open = new RegExp(
		`<(?:[A-Za-z_][\\w.-]*:)?${local}(?=[\\s/>])[^>]*>`,
		"g",
	);
	open.lastIndex = from;
	const m = open.exec(xml);
	if (!m) return null;
	if (m[0].endsWith("/>")) return "";
	const close = new RegExp(`</(?:[A-Za-z_][\\w.-]*:)?${local}\\s*>`, "g");
	close.lastIndex = m.index + m[0].length;
	const c = close.exec(xml);
	if (!c) return null;
	return xml.slice(m.index + m[0].length, c.index);
}

/** Zertifikat (PEM oder Base64) lesen. */
export function certificateInfo(raw: string): CertInfo | null {
	const b64 = raw
		.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "")
		.replace(/\s+/g, "");
	if (!/^[A-Za-z0-9+/=]{100,}$/.test(b64)) return null;
	try {
		const cert = new X509Certificate(Buffer.from(b64, "base64"));
		const details = cert.publicKey.asymmetricKeyDetails;
		return {
			fingerprint: cert.fingerprint256,
			notBefore: new Date(cert.validFrom).toISOString(),
			notAfter: new Date(cert.validTo).toISOString(),
			subject: cert.subject.replace(/\n/g, ", "),
			keyType: cert.publicKey.asymmetricKeyType ?? "unknown",
			keyBits:
				details?.modulusLength ??
				(details?.namedCurve ? curveBits(details.namedCurve) : null),
			der: b64,
		};
	} catch {
		return null;
	}
}

function curveBits(curve: string): number | null {
	const m = /(\d{3})/.exec(curve);
	return m ? Number(m[1]) : null;
}

export function certWarnings(c: CertInfo, now: Date): MetadataWarning[] {
	const out: MetadataWarning[] = [];
	const left = new Date(c.notAfter).getTime() - now.getTime();
	if (left <= 0) out.push("cert_expired");
	else if (left <= 30 * DAY) out.push("cert_expires_soon");
	if (c.keyType === "rsa" && (c.keyBits ?? 0) < 2048) out.push("weak_key");
	return out;
}

/** Metadaten des Anbieters lesen und prüfen. */
export function parseIdpMetadata(
	xml: string,
	now: Date,
): { ok: true; data: IdpMetadata } | { ok: false; error: MetadataError } {
	if (Buffer.byteLength(xml, "utf8") > SAML_SECURITY.maxMetadataSize)
		return { ok: false, error: "metadata_too_large" };
	if (/<!DOCTYPE|<!ENTITY/i.test(xml))
		return { ok: false, error: "metadata_doctype" };
	const entities = startTags(xml, "EntityDescriptor");
	if (entities.length === 0) return { ok: false, error: "metadata_invalid" };
	if (entities.length > 1)
		return { ok: false, error: "metadata_many_entities" };
	const entityId = attr(entities[0]?.tag ?? "", "entityID");
	if (!entityId || entityId.length > 500)
		return { ok: false, error: "metadata_invalid" };
	const idp = block(xml, "IDPSSODescriptor");
	if (idp === null) return { ok: false, error: "metadata_no_idp" };

	// Anmeldeadresse: Redirect bevorzugt (wie das Plugin), sonst POST
	const services = startTags(idp, "SingleSignOnService").map((s) => ({
		binding: attr(s.tag, "Binding"),
		location: attr(s.tag, "Location"),
	}));
	const sso =
		services.find((s) => s.binding === REDIRECT) ??
		services.find((s) => s.binding === POST) ??
		null;

	// Signatur-Zertifikate nur aus dem IDPSSODescriptor (Entra hat weitere
	// KeyDescriptor in RoleDescriptor-Blöcken)
	const certificates: CertInfo[] = [];
	let at = 0;
	for (;;) {
		const kd = startTags(idp.slice(at), "KeyDescriptor")[0];
		if (!kd) break;
		const start = at + kd.at;
		const body = block(idp, "KeyDescriptor", start) ?? "";
		at = start + kd.tag.length + body.length;
		const use = attr(kd.tag, "use");
		if (use && use !== "signing") continue;
		const certRe =
			/<(?:[A-Za-z_][\w.-]*:)?X509Certificate\s*>([^<]+)<\/(?:[A-Za-z_][\w.-]*:)?X509Certificate\s*>/g;
		for (let m = certRe.exec(body); m; m = certRe.exec(body)) {
			const info = certificateInfo(m[1] ?? "");
			if (!info) return { ok: false, error: "metadata_cert_invalid" };
			if (!certificates.some((c) => c.fingerprint === info.fingerprint))
				certificates.push(info);
		}
	}
	if (certificates.length === 0)
		return { ok: false, error: "metadata_no_cert" };

	const warnings = new Set<MetadataWarning>();
	if (!sso?.location) warnings.add("no_post_or_redirect");
	// Gilt mindestens ein Zertifikat noch? Dann nur „läuft bald ab“ melden
	const all = certificates.map((c) => certWarnings(c, now));
	if (all.every((w) => w.includes("cert_expired")))
		warnings.add("cert_expired");
	else if (
		all.some((w) => w.includes("cert_expires_soon")) &&
		!certificates.some(
			(c) => new Date(c.notAfter).getTime() - now.getTime() > 30 * DAY,
		)
	)
		warnings.add("cert_expires_soon");
	if (all.some((w) => w.includes("weak_key"))) warnings.add("weak_key");
	// Signierte Metadaten mit altem Verfahren: Hinweis (die Anmeldung prüft
	// die Verfahren der Antwort ohnehin)
	for (const t of [
		...startTags(xml, "SignatureMethod"),
		...startTags(xml, "DigestMethod"),
	]) {
		const alg = attr(t.tag, "Algorithm") ?? "";
		if (!SAML_SIGNATURE_ALGORITHMS.has(alg) && !SAML_DIGEST_ALGORITHMS.has(alg))
			warnings.add("weak_algorithm");
	}
	return {
		ok: true,
		data: {
			entityId,
			ssoUrl: sso?.location ?? null,
			certificates,
			warnings: [...warnings],
		},
	};
}

/** Spätestes Ablaufdatum der Zertifikate (gilt, solange eines gilt). */
export function latestNotAfter(certs: readonly CertInfo[]): string | null {
	let best: string | null = null;
	for (const c of certs)
		if (!best || new Date(c.notAfter) > new Date(best)) best = c.notAfter;
	return best;
}

/** Fingerabdrücke als sortierte, kommagetrennte Liste (Vergleich im Tick). */
export function fingerprintSet(certs: readonly { fingerprint: string }[]) {
	return [...new Set(certs.map((c) => c.fingerprint))].sort().join(",");
}

// ---------------------------------------------------------------------------
// Probe-Anmeldung (AP10b): was in einer SAML-Antwort ankam. Wird nur nach
// der Prüfung durch das Plugin gelesen (Signatur, genau eine Assertion,
// Audience, Zeitfenster, InResponseTo) und nur angezeigt, nie für Rechte.

export type SamlProbeView = {
	inResponseTo: string | null;
	issuer: string | null;
	nameId: string | null;
	attributes: Record<string, string[]>;
	authnContext: string | null;
};

export function samlProbeView(xml: string): SamlProbeView {
	const root = startTags(xml, "Response")[0]?.tag ?? "";
	const assertion = block(xml, "Assertion") ?? "";
	const text = (local: string, scope: string) => {
		const m = new RegExp(
			`<(?:[A-Za-z_][\\w.-]*:)?${local}(?=[\\s>])[^>]*>([^<]*)</(?:[A-Za-z_][\\w.-]*:)?${local}\\s*>`,
		).exec(scope);
		return m ? decodeXmlText((m[1] ?? "").trim()) : null;
	};
	const attributes: Record<string, string[]> = {};
	const attrRe =
		/<(?:[A-Za-z_][\w.-]*:)?Attribute(?=[\s>])([^>]*)>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?Attribute\s*>/g;
	for (let m = attrRe.exec(assertion); m; m = attrRe.exec(assertion)) {
		const name = attr(`<a${m[1] ?? ""}>`, "Name");
		if (!name) continue;
		const values: string[] = [];
		const valRe =
			/<(?:[A-Za-z_][\w.-]*:)?AttributeValue(?=[\s>])[^>]*>([^<]*)<\/(?:[A-Za-z_][\w.-]*:)?AttributeValue\s*>/g;
		for (let v = valRe.exec(m[2] ?? ""); v; v = valRe.exec(m[2] ?? ""))
			values.push(decodeXmlText((v[1] ?? "").trim()));
		attributes[name] = [...(attributes[name] ?? []), ...values].slice(0, 200);
		if (Object.keys(attributes).length >= 100) break;
	}
	return {
		inResponseTo: attr(root, "InResponseTo"),
		issuer: text("Issuer", assertion) ?? text("Issuer", xml),
		nameId: text("NameID", assertion),
		attributes,
		authnContext: text("AuthnContextClassRef", assertion),
	};
}

/** ID einer AuthnRequest aus der Redirect-Adresse (SAMLRequest: Base64 über
 *  raw-deflate). */
export function authnRequestId(
	redirectUrl: string,
	inflate: (b: Buffer) => Buffer,
): string | null {
	try {
		const req = new URL(redirectUrl).searchParams.get("SAMLRequest");
		if (!req) return null;
		const xml = inflate(Buffer.from(req, "base64")).toString("utf8");
		return attr(startTags(xml, "AuthnRequest")[0]?.tag ?? "", "ID");
	} catch {
		return null;
	}
}
