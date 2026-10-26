import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { ROOT } from "./walk";

// Eigener SAML-IdP für Tests (Härtung A7): Schlüssel und Zertifikat erzeugt
// openssl zur Laufzeit (nichts im Repo), signiert wird mit xml-crypto aus den
// Abhängigkeiten des SSO-Plugins (kein neues Paket). Antworten lassen sich
// gezielt verbiegen: ohne Signatur, nur Response signiert, SHA-1, falsche
// Audience, ohne InResponseTo, abgelaufen, fremde Adresse.

const fromSso = createRequire(
	join(ROOT, "node_modules/@better-auth/sso/package.json"),
);
const fromSamlify = createRequire(fromSso.resolve("samlify"));
const { SignedXml } = fromSamlify("xml-crypto") as {
	SignedXml: new (
		opts: Record<string, unknown>,
	) => {
		addReference(opts: Record<string, unknown>): void;
		computeSignature(xml: string, opts: Record<string, unknown>): void;
		getSignedXml(): string;
	};
};

export type IdpKeys = { key: string; cert: string };

export function testIdpKeys(): IdpKeys {
	const dir = mkdtempSync(join(tmpdir(), "klick-saml-"));
	try {
		execFileSync(
			"openssl",
			[
				"req",
				"-x509",
				"-newkey",
				"rsa:2048",
				"-nodes",
				"-subj",
				"/CN=klick-test-idp",
				"-days",
				"2",
				"-keyout",
				join(dir, "key.pem"),
				"-out",
				join(dir, "cert.pem"),
			],
			{ stdio: "ignore" },
		);
		return {
			key: readFileSync(join(dir, "key.pem"), "utf8"),
			cert: readFileSync(join(dir, "cert.pem"), "utf8"),
		};
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** ID der AuthnRequest aus der Weiterleitung an den IdP (Redirect-Binding). */
export function authnRequestId(redirectUrl: string): string {
	const raw = new URL(redirectUrl).searchParams.get("SAMLRequest") ?? "";
	const xml = inflateRawSync(Buffer.from(raw, "base64")).toString("utf8");
	const id = /\sID="([^"]+)"/.exec(xml)?.[1];
	if (!id) throw new Error("AuthnRequest ohne ID");
	return id;
}

export type ResponseOptions = {
	keys: IdpKeys;
	idpEntityId: string;
	audience: string;
	acsUrl: string;
	inResponseTo: string | null;
	email: string;
	sign?: "assertion" | "response" | "none";
	alg?: "sha256" | "sha1";
	// Gültigkeit relativ zu jetzt (ms)
	notBefore?: number;
	notOnOrAfter?: number;
	// nach dem Signieren verändern (Signatur-Wrapping)
	mutate?: (xml: string) => string;
};

const iso = (offset: number) => new Date(Date.now() + offset).toISOString();
const rid = () => `_${randomBytes(16).toString("hex")}`;
const esc = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const ALG = {
	sha256: {
		sig: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
		digest: "http://www.w3.org/2001/04/xmlenc#sha256",
	},
	sha1: {
		sig: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
		digest: "http://www.w3.org/2000/09/xmldsig#sha1",
	},
};

function sign(
	xml: string,
	o: ResponseOptions,
	element: "Assertion" | "Response",
): string {
	const a = ALG[o.alg ?? "sha256"];
	const sig = new SignedXml({
		privateKey: o.keys.key,
		publicCert: o.keys.cert,
		signatureAlgorithm: a.sig,
		canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
	});
	sig.addReference({
		xpath: `//*[local-name(.)='${element}']`,
		transforms: [
			"http://www.w3.org/2000/09/xmldsig#enveloped-signature",
			"http://www.w3.org/2001/10/xml-exc-c14n#",
		],
		digestAlgorithm: a.digest,
	});
	sig.computeSignature(xml, {
		prefix: "ds",
		location: {
			reference: `//*[local-name(.)='${element}']/*[local-name(.)='Issuer']`,
			action: "after",
		},
	});
	return sig.getSignedXml();
}

/** SAML-Response als Base64 (POST-Binding). */
export function samlResponse(o: ResponseOptions): string {
	const now = iso(0);
	const irt = o.inResponseTo ? ` InResponseTo="${esc(o.inResponseTo)}"` : "";
	const notBefore = iso(o.notBefore ?? -60_000);
	const notOnOrAfter = iso(o.notOnOrAfter ?? 5 * 60_000);
	let xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${rid()}" Version="2.0" IssueInstant="${now}" Destination="${esc(o.acsUrl)}"${irt}><saml:Issuer>${esc(o.idpEntityId)}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status><saml:Assertion ID="${rid()}" Version="2.0" IssueInstant="${now}"><saml:Issuer>${esc(o.idpEntityId)}</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${esc(o.email)}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${notOnOrAfter}" Recipient="${esc(o.acsUrl)}"${irt}/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}"><saml:AudienceRestriction><saml:Audience>${esc(o.audience)}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${now}" SessionIndex="${rid()}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement><saml:AttributeStatement><saml:Attribute Name="email"><saml:AttributeValue>${esc(o.email)}</saml:AttributeValue></saml:Attribute><saml:Attribute Name="name"><saml:AttributeValue>Test Person</saml:AttributeValue></saml:Attribute></saml:AttributeStatement></saml:Assertion></samlp:Response>`;
	const mode = o.sign ?? "assertion";
	if (mode === "assertion") xml = sign(xml, o, "Assertion");
	if (mode === "response") xml = sign(xml, o, "Response");
	if (o.mutate) xml = o.mutate(xml);
	return Buffer.from(xml, "utf8").toString("base64");
}
