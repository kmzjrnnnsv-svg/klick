// SAML-Anbieter einer Org (S3, Härtung A7) — rein, getestet. Eine Quelle für
// die Einrichtung (app/actions/sso.ts) und den Test mit eigenem IdP.
//
// Wichtig: Das Plugin speichert als samlConfig.issuer die Entity-ID des IdP
// und nimmt daraus die Entity-ID von Klick, wenn spMetadata.entityID fehlt.
// Dann wäre die Audience für alle Orgs desselben IdP gleich. Deshalb stehen
// Entity-ID und Audience von Klick hier ausdrücklich, je Anbieter eindeutig.

export const SAML_GROUPS_CLAIM =
	"http://schemas.microsoft.com/ws/2008/06/identity/claims/groups";
export const SAML_AUTHN_METHODS_CLAIM =
	"http://schemas.microsoft.com/claims/authnmethodsreferences";

/** Entity-ID von Klick je Anbieter (= Adresse der SP-Metadaten). */
export function samlSpEntityId(origin: string, providerId: string): string {
	return `${origin}/api/auth/sso/saml2/sp/metadata?providerId=${encodeURIComponent(providerId)}`;
}

/** ACS je Anbieter (Rückruf des IdP). */
export function samlAcsUrl(origin: string, providerId: string): string {
	return `${origin}/api/auth/sso/saml2/sp/acs/${encodeURIComponent(providerId)}`;
}

export type SamlRegistrationInput = {
	origin: string;
	providerId: string;
	idpEntityId: string;
	ssoUrl?: string | null;
	certificate?: string | null;
	metadataXml?: string | null;
	emailAttribute?: string | null;
	nameAttribute?: string | null;
	groupsAttribute?: string | null;
};

export function samlRegistration(input: SamlRegistrationInput) {
	const spEntityId = samlSpEntityId(input.origin, input.providerId);
	return {
		// Klick als SP: eigene Entity-ID je Anbieter, Audience = diese
		spMetadata: { entityID: spEntityId },
		audience: spEntityId,
		entryPoint: input.ssoUrl ?? "",
		cert: input.metadataXml ? undefined : (input.certificate ?? undefined),
		callbackUrl: `${input.origin}/heute`,
		idpMetadata: input.metadataXml
			? { metadata: input.metadataXml }
			: { entityID: input.idpEntityId, cert: input.certificate ?? "" },
		// Signatur auf der Assertion Pflicht (nicht nur auf der Response)
		wantAssertionsSigned: true,
		mapping: {
			email: input.emailAttribute || "email",
			name: input.nameAttribute || "name",
			extraFields: {
				groups: input.groupsAttribute || SAML_GROUPS_CLAIM,
				authnmethodsreferences: SAML_AUTHN_METHODS_CLAIM,
			},
		},
	};
}

// Verfahren in der XML-Signatur (Härtung A7). Das Plugin prüft Algorithmen
// nur am SigAlg des Redirect-Bindings, nicht an SignatureMethod/DigestMethod
// einer POST-Antwort — eine mit SHA-1 signierte Assertion ging sonst durch.
// Allowlist: was nicht genau so dasteht (auch kodierte Varianten), fällt.
export const SAML_SIGNATURE_ALGORITHMS: ReadonlySet<string> = new Set([
	"http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
	"http://www.w3.org/2001/04/xmldsig-more#rsa-sha384",
	"http://www.w3.org/2001/04/xmldsig-more#rsa-sha512",
	"http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256",
	"http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384",
	"http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512",
	"http://www.w3.org/2007/05/xmldsig-more#sha256-rsa-MGF1",
]);
export const SAML_DIGEST_ALGORITHMS: ReadonlySet<string> = new Set([
	"http://www.w3.org/2001/04/xmlenc#sha256",
	"http://www.w3.org/2001/04/xmldsig-more#sha384",
	"http://www.w3.org/2001/04/xmlenc#sha512",
]);

// Attribut eines Start-Tags ab Position `from` (nach dem Elementnamen) lesen;
// ein kleiner Scanner statt Regex, damit „>“ in Werten nichts verschiebt.
function attribute(xml: string, from: number, name: string): string | null {
	let i = from;
	for (;;) {
		while (i < xml.length && /\s/.test(xml[i] ?? "")) i++;
		const c = xml[i];
		if (c === undefined || c === ">" || c === "/") return null;
		const eq = xml.indexOf("=", i);
		if (eq < 0) return null;
		const attr = xml.slice(i, eq).trim();
		// wohlgeformt: Name ohne Leerraum und ohne Klammern, sonst nein
		if (!attr || /[\s<>]/.test(attr)) return null;
		let j = eq + 1;
		while (j < xml.length && /\s/.test(xml[j] ?? "")) j++;
		const quote = xml[j];
		if (quote !== '"' && quote !== "'") return null;
		const end = xml.indexOf(quote, j + 1);
		if (end < 0) return null;
		const local = attr.slice(attr.lastIndexOf(":") + 1);
		if (local === name && !attr.includes(":")) return xml.slice(j + 1, end);
		i = end + 1;
	}
}

/**
 * Alle SignatureMethod/DigestMethod einer SAML-Antwort aus der Allowlist und
 * mindestens eine Signatur? Elemente werden über den lokalen Namen gefunden
 * (jedes Präfix), Werte müssen exakt passen.
 */
export function samlAlgorithmsAllowed(xml: string): boolean {
	let signatures = 0;
	const tag = /<([^\s/>!?]+)/g;
	for (let m = tag.exec(xml); m; m = tag.exec(xml)) {
		const qname = m[1] ?? "";
		const local = qname.slice(qname.lastIndexOf(":") + 1);
		if (local !== "SignatureMethod" && local !== "DigestMethod") continue;
		const alg = attribute(xml, m.index + 1 + qname.length, "Algorithm");
		const allowed =
			local === "SignatureMethod"
				? SAML_SIGNATURE_ALGORITHMS
				: SAML_DIGEST_ALGORITHMS;
		if (!alg || !allowed.has(alg)) return false;
		if (local === "SignatureMethod") signatures++;
	}
	return signatures > 0;
}

/** SAMLResponse aus dem POST-Body (Base64, Leerraum egal) als Text. */
export function decodeSamlResponse(raw: string): string {
	try {
		return Buffer.from(raw.replace(/\s+/g, ""), "base64").toString("utf8");
	} catch {
		return "";
	}
}
