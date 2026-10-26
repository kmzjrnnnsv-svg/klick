import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { authEndpointDecision } from "@/lib/auth/endpoint-policy";
import {
	SAML_SECURITY,
	ssoCallbackProviderId,
	ssoEmailAllowed,
} from "@/lib/auth/sso-policy";
import {
	decodeSamlResponse,
	samlAlgorithmsAllowed,
	samlRegistration,
} from "@/lib/auth/sso-saml";
import { ROOT } from "./helpers/walk";

// SSO absichern (Härtung A7): reine Regeln. Ende-zu-Ende mit eigenem IdP in
// tests/sso-saml.integration.test.ts.

const SIG = (alg: string, dig: string, p = "ds") =>
	`<${p}:SignedInfo><${p}:SignatureMethod Algorithm="${alg}"/><${p}:Reference><${p}:DigestMethod Algorithm="${dig}"/></${p}:Reference></${p}:SignedInfo>`;
const RSA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";

describe("samlAlgorithmsAllowed", () => {
	it("SHA-256 ja, SHA-1 nein, ohne Signatur nein", () => {
		expect(samlAlgorithmsAllowed(SIG(RSA256, SHA256))).toBe(true);
		expect(
			samlAlgorithmsAllowed(
				SIG("http://www.w3.org/2000/09/xmldsig#rsa-sha1", SHA256),
			),
		).toBe(false);
		expect(
			samlAlgorithmsAllowed(
				SIG(RSA256, "http://www.w3.org/2000/09/xmldsig#sha1"),
			),
		).toBe(false);
		expect(samlAlgorithmsAllowed("<Response/>")).toBe(false);
	});
	it("jedes Präfix, Kodierung und fehlendes Attribut", () => {
		expect(samlAlgorithmsAllowed(SIG(RSA256, SHA256, "x9"))).toBe(true);
		expect(samlAlgorithmsAllowed(SIG(RSA256, SHA256, "ü"))).toBe(true);
		// kodiert = nicht wörtlich in der Liste
		expect(
			samlAlgorithmsAllowed(
				SIG("http://www.w3.org/2001/04/xmldsig-more#rsa-&#115;ha256", SHA256),
			),
		).toBe(false);
		expect(
			samlAlgorithmsAllowed(`${SIG(RSA256, SHA256)}<ds:SignatureMethod/>`),
		).toBe(false);
		// auch eine zweite, schwache Signatur fällt (z. B. im Kommentar)
		expect(
			samlAlgorithmsAllowed(
				`${SIG(RSA256, SHA256)}<!-- ${SIG("http://www.w3.org/2000/09/xmldsig#rsa-sha1", SHA256)} -->`,
			),
		).toBe(false);
		expect(samlAlgorithmsAllowed(SIG(RSA256, SHA256).replace(/"/g, "'"))).toBe(
			true,
		);
	});
	it("Base64 aus dem Formular", () => {
		const b64 = Buffer.from(SIG(RSA256, SHA256)).toString("base64");
		expect(decodeSamlResponse(`${b64.slice(0, 10)}\n${b64.slice(10)}`)).toBe(
			SIG(RSA256, SHA256),
		);
	});
});

describe("samlRegistration", () => {
	it("eigene Entity-ID und Audience je Anbieter, Assertion signiert", () => {
		const a = samlRegistration({
			origin: "https://raza.work",
			providerId: "a",
			idpEntityId: "https://sts.windows.net/t/",
			certificate: "CERT",
		});
		const b = samlRegistration({
			origin: "https://raza.work",
			providerId: "b",
			idpEntityId: "https://sts.windows.net/t/",
			certificate: "CERT",
		});
		expect(a.spMetadata.entityID).toBe(
			"https://raza.work/api/auth/sso/saml2/sp/metadata?providerId=a",
		);
		expect(a.audience).toBe(a.spMetadata.entityID);
		expect(a.spMetadata.entityID).not.toBe(b.spMetadata.entityID);
		expect(a.spMetadata.entityID).not.toBe("https://sts.windows.net/t/");
		expect(a.wantAssertionsSigned).toBe(true);
	});
});

describe("Domain-Bindung und Rückruf", () => {
	const p = { domain: "firma.de", domainVerified: true };
	it("nur genau die bestätigte Domain", () => {
		expect(ssoEmailAllowed("a@firma.de", p)).toBe(true);
		expect(ssoEmailAllowed("A@FIRMA.DE", p)).toBe(true);
		expect(ssoEmailAllowed("a@mail.firma.de", p)).toBe(false);
		expect(ssoEmailAllowed("a@firma.de.evil", p)).toBe(false);
		expect(ssoEmailAllowed("a@andere.de", p)).toBe(false);
		expect(ssoEmailAllowed("a@firma.de", { ...p, domainVerified: false })).toBe(
			false,
		);
		expect(
			ssoEmailAllowed("a@b.de", { domain: "a.de, b.de", domainVerified: true }),
		).toBe(true);
		expect(ssoEmailAllowed("x", p)).toBe(false);
		expect(ssoEmailAllowed("a@firma.de", null)).toBe(false);
	});
	it("Anbieter nur aus dem Pfad mit ID", () => {
		expect(
			ssoCallbackProviderId("/sso/saml2/sp/acs/:providerId", {
				providerId: "p1",
			}),
		).toBe("p1");
		expect(ssoCallbackProviderId("/sso/callback", {})).toBeNull();
		expect(
			ssoCallbackProviderId("/sign-in/sso", { providerId: "p1" }),
		).toBeNull();
	});
	it("geteilter Rückruf gesperrt", () => {
		const s = {
			hasSession: false,
			mfaVerified: false,
			stepUpFresh: false,
			hasTotp: false,
			passkeys: 0,
			hasRegistrationToken: false,
			adminNetwork: false,
			impersonated: false,
			httpRequest: true,
		};
		expect(authEndpointDecision("/sso/callback", s).allow).toBe(false);
	});
});

describe("Plugin-Einstellungen", () => {
	it("IdP-initiiert aus, Zeitfenster Pflicht, alte Verfahren abgelehnt", () => {
		expect(SAML_SECURITY).toMatchObject({
			enableInResponseToValidation: true,
			allowIdpInitiated: false,
			requireTimestamps: true,
			algorithms: { onDeprecated: "reject" },
		});
		expect(SAML_SECURITY.clockSkew).toBeLessThanOrEqual(5 * 60_000);
		const server = readFileSync(join(ROOT, "lib/auth/server.ts"), "utf8");
		expect(server).toMatch(/saml:\s*SAML_SECURITY/);
		const sso = readFileSync(join(ROOT, "app/actions/sso.ts"), "utf8");
		expect(sso).toMatch(/samlConfig:\s*samlRegistration\(/);
	});
});
