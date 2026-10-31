import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
	authnRequestId,
	certificateInfo,
	parseIdpMetadata,
	samlProbeView,
} from "@/lib/auth/saml-metadata";
import {
	certReminder,
	metadataUrlAllowed,
	nextSsoStep,
	SAML_PRESETS,
	SAML_VENDORS,
	spMetadataXml,
	suggestProviderId,
} from "@/lib/auth/sso-saml-vendors";
import { samlVendorSchema, ssoProviderIdSchema } from "@/lib/validation/sso";
import de from "@/messages/de.json";
import { samlResponse, testIdpKeys } from "./helpers/saml-idp";

// SAML in fünf Minuten (AP10): Vorlagen, Kennung, Metadaten-Adresse (SSRF),
// eigene Metadaten, Lesen der Metadaten des Anbieters, Zertifikatsablauf.

const keys = testIdpKeys();
const certB64 = keys.cert
	.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "")
	.replace(/\s+/g, "");

function idpMetadata(opts: { entityId?: string; extra?: string } = {}) {
	return `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" entityID="${opts.entityId ?? "https://idp.example.com/saml"}">
  <md:RoleDescriptor><md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>nicht-lesbar</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor></md:RoleDescriptor>
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="encryption"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>auch-nicht</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>
    <md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>
${certB64}
    </ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.com/sso/post"/>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.com/sso?a=1&amp;b=2"/>
  </md:IDPSSODescriptor>${opts.extra ?? ""}
</md:EntityDescriptor>`;
}

describe("Vorlagen je Anbieter", () => {
	it("Liste im Schema = Liste der Vorlagen", () => {
		expect([...samlVendorSchema.options]).toEqual([...SAML_VENDORS]);
	});

	it("jede Vorlage hat Namen, Schritte und Attribute", () => {
		const s = de.SsoSetup as Record<string, unknown>;
		for (const v of SAML_VENDORS) {
			expect(typeof s[`vendor_${v}`]).toBe("string");
			const steps = s[`samlSteps_${v}`] as string[];
			expect(Array.isArray(steps) && steps.length >= 3).toBe(true);
			const p = SAML_PRESETS[v];
			expect(p.attributes.email.length).toBeGreaterThan(0);
			expect(p.attributes.name.length).toBeGreaterThan(0);
			if (p.metadata !== "file") {
				// mit Adresse: entweder Hosts des Anbieters oder eigene Domain
				expect(p.metadataHosts.length > 0 || p.ownDomain).toBe(true);
			}
		}
	});

	it("Beispiel-Adressen der Vorlagen sind erlaubt", () => {
		for (const v of SAML_VENDORS) {
			const ex = SAML_PRESETS[v].metadataUrlExample;
			if (!ex) continue;
			const url = ex.replace(/<[^>]+>/g, "x");
			expect(metadataUrlAllowed(url, v, ["firma.de"]), v).toBe(true);
		}
	});
});

describe("Kennung aus der Domain", () => {
	it("schlägt saml-<domain> vor und hält die Regel ein", () => {
		expect(suggestProviderId("firma.de")).toBe("saml-firma-de");
		expect(suggestProviderId("Firma.DE, firma.com")).toBe("saml-firma-de");
		expect(suggestProviderId("firma.de", "oidc")).toBe("oidc-firma-de");
		const long = suggestProviderId(`${"sehr-lange-domain".repeat(5)}.de`);
		expect(long.length).toBeLessThanOrEqual(40);
		for (const d of ["firma.de", "x.io", `${"a".repeat(80)}.de`, "--.de"])
			expect(ssoProviderIdSchema.safeParse(suggestProviderId(d)).success).toBe(
				true,
			);
	});
});

describe("Metadaten-Adresse (SSRF)", () => {
	it("nur Hosts des Anbieters", () => {
		const ok = (u: string, v = "entra" as const) =>
			metadataUrlAllowed(u, v, ["firma.de"]);
		expect(
			ok(
				"https://login.microsoftonline.com/t/federationmetadata/2007-06/federationmetadata.xml",
			),
		).toBe(true);
		expect(ok("https://login.microsoftonline.com.evil.com/x")).toBe(false);
		expect(ok("https://evil.com/login.microsoftonline.com")).toBe(false);
		expect(ok("http://login.microsoftonline.com/x")).toBe(false);
		expect(ok("https://login.microsoftonline.com:8443/x")).toBe(false);
		expect(ok("https://user:pw@login.microsoftonline.com/x")).toBe(false);
		// Entra darf nicht von der eigenen Domain
		expect(ok("https://adfs.firma.de/x")).toBe(false);
	});

	it("Okta nur Subdomains, ADFS auch die eigene Domain", () => {
		expect(
			metadataUrlAllowed(
				"https://firma.okta.com/app/1/sso/saml/metadata",
				"okta",
				[],
			),
		).toBe(true);
		expect(metadataUrlAllowed("https://okta.com/x", "okta", [])).toBe(false);
		expect(metadataUrlAllowed("https://notokta.com/x", "okta", [])).toBe(false);
		expect(
			metadataUrlAllowed("https://adfs.firma.de/m.xml", "adfs", ["firma.de"]),
		).toBe(true);
		expect(
			metadataUrlAllowed("https://firma.de/m.xml", "adfs", ["firma.de"]),
		).toBe(true);
		expect(
			metadataUrlAllowed("https://adfs.firma.de.evil.com/m", "adfs", [
				"firma.de",
			]),
		).toBe(false);
		expect(
			metadataUrlAllowed("https://adfs.other.de/m", "adfs", ["firma.de"]),
		).toBe(false);
		expect(metadataUrlAllowed("https://10.0.0.5/m", "adfs", ["firma.de"])).toBe(
			false,
		);
		expect(
			metadataUrlAllowed("https://localhost/m", "other", ["localhost"]),
		).toBe(false);
	});
});

describe("Metadaten von Klick", () => {
	it("enthält Entity-ID und ACS, maskiert", () => {
		const xml = spMetadataXml({
			entityId:
				"https://k.example/api/auth/sso/saml2/sp/metadata?providerId=a&b",
			acsUrl: "https://k.example/api/auth/sso/saml2/sp/acs/a",
		});
		expect(xml).toContain(
			'entityID="https://k.example/api/auth/sso/saml2/sp/metadata?providerId=a&amp;b"',
		);
		expect(xml).toContain(
			'Location="https://k.example/api/auth/sso/saml2/sp/acs/a"',
		);
		expect(xml).toContain('WantAssertionsSigned="true"');
		// und lässt sich mit dem eigenen Leser lesen (Entity-ID)
		expect(/entityID="([^"]+)"/.exec(xml)?.[1]).toContain("providerId=a&amp;b");
	});
});

describe("Metadaten des Anbieters lesen", () => {
	const now = new Date();

	it("liest Entity-ID, Redirect-Adresse und nur das Signaturzertifikat", () => {
		const r = parseIdpMetadata(idpMetadata(), now);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.entityId).toBe("https://idp.example.com/saml");
		expect(r.data.ssoUrl).toBe("https://idp.example.com/sso?a=1&b=2");
		expect(r.data.certificates).toHaveLength(1);
		expect(r.data.certificates[0]?.keyBits).toBe(2048);
		// testIdpKeys gilt 2 Tage: läuft bald ab
		expect(r.data.warnings).toContain("cert_expires_soon");
	});

	it("lehnt DOCTYPE, mehrere Anbieter, fehlendes Zertifikat ab", () => {
		expect(
			parseIdpMetadata(`<!DOCTYPE x [<!ENTITY a "b">]>${idpMetadata()}`, now),
		).toEqual({ ok: false, error: "metadata_doctype" });
		expect(
			parseIdpMetadata(
				`<md:EntitiesDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata">${idpMetadata()}${idpMetadata()}</md:EntitiesDescriptor>`.replace(
					/<\?xml[^>]*>/g,
					"",
				),
				now,
			),
		).toEqual({ ok: false, error: "metadata_many_entities" });
		expect(
			parseIdpMetadata(
				'<EntityDescriptor entityID="x"><IDPSSODescriptor></IDPSSODescriptor></EntityDescriptor>',
				now,
			),
		).toEqual({ ok: false, error: "metadata_no_cert" });
		expect(parseIdpMetadata("<html></html>", now)).toEqual({
			ok: false,
			error: "metadata_invalid",
		});
		expect(parseIdpMetadata("x".repeat(110_000), now)).toEqual({
			ok: false,
			error: "metadata_too_large",
		});
	});

	it("meldet alte Verfahren in signierten Metadaten", () => {
		const r = parseIdpMetadata(
			idpMetadata({
				extra:
					'<ds:Signature><ds:SignedInfo><ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/></ds:SignedInfo></ds:Signature>',
			}),
			now,
		);
		expect(r.ok && r.data.warnings).toContain("weak_algorithm");
	});

	it("liest ein einzelnes Zertifikat (PEM)", () => {
		const c = certificateInfo(keys.cert);
		expect(c?.subject).toContain("klick-test-idp");
		expect(certificateInfo("kein zertifikat")).toBeNull();
	});
});

describe("Ablauf und nächster Schritt", () => {
	const now = new Date("2026-10-31T12:00:00Z");
	it("erinnert 30 und 7 Tage vorher", () => {
		expect(certReminder("2027-01-31T12:00:00Z", now)).toBeNull();
		expect(certReminder("2026-11-25T12:00:00Z", now)).toBe("30");
		expect(certReminder("2026-11-05T12:00:00Z", now)).toBe("7");
		expect(certReminder("2026-10-30T12:00:00Z", now)).toBe("expired");
		expect(certReminder(null, now)).toBeNull();
	});

	it("ein Schritt nach dem anderen", () => {
		const base = { domainVerified: false, probeOk: false, enforced: false };
		expect(nextSsoStep({ ...base, protocol: "saml" })).toBe("domain");
		expect(
			nextSsoStep({ ...base, domainVerified: true, protocol: "saml" }),
		).toBe("probe");
		expect(
			nextSsoStep({ ...base, domainVerified: true, protocol: "oidc" }),
		).toBe("enforce");
		expect(
			nextSsoStep({
				domainVerified: true,
				probeOk: true,
				enforced: true,
				protocol: "saml",
			}),
		).toBe("done");
	});
});

describe("Probe: was in der Antwort ankam", () => {
	it("liest InResponseTo, NameID und Attribute", () => {
		const b64 = samlResponse({
			keys,
			idpEntityId: "https://idp.example.com/saml",
			audience: "https://k.example/sp",
			acsUrl: "https://k.example/acs",
			inResponseTo: "_abc123",
			email: "mara@firma.de",
		});
		const view = samlProbeView(Buffer.from(b64, "base64").toString("utf8"));
		expect(view.inResponseTo).toBe("_abc123");
		expect(view.nameId).toBe("mara@firma.de");
		expect(view.issuer).toBe("https://idp.example.com/saml");
		expect(view.attributes.email).toEqual(["mara@firma.de"]);
		expect(view.attributes.name).toEqual(["Test Person"]);
		expect(view.authnContext).toContain("PasswordProtectedTransport");
	});

	it("ID der AuthnRequest aus der Weiterleitung", async () => {
		const { deflateRawSync } = await import("node:zlib");
		const req = deflateRawSync(
			Buffer.from(
				'<samlp:AuthnRequest xmlns:samlp="x" ID="_r1" Version="2.0"/>',
			),
		).toString("base64");
		const url = `https://idp.example.com/sso?SAMLRequest=${encodeURIComponent(req)}`;
		expect(authnRequestId(url, inflateRawSync)).toBe("_r1");
		expect(
			authnRequestId("https://idp.example.com/sso", inflateRawSync),
		).toBeNull();
	});
});

describe("Probe: Ursache in Klartext", () => {
	it("übersetzt die Fehler des Rückrufs", async () => {
		const { probeErrorKey } = await import("@/lib/auth/sso-probe-errors");
		expect(probeErrorKey("SSO_PROBE_DONE", null)).toBeNull();
		expect(probeErrorKey(null, null)).toBeNull();
		expect(
			probeErrorKey(
				"invalid_saml_response",
				"SAML assertion audience does not match this Service Provider",
			),
		).toBe("audience");
		expect(
			probeErrorKey(
				"invalid_saml_response",
				"SAML bearer SubjectConfirmationData Recipient does not match this Service Provider",
			),
		).toBe("recipient");
		expect(
			probeErrorKey("invalid_saml_response", "SAML assertion has expired"),
		).toBe("expired");
		expect(
			probeErrorKey("invalid_saml_response", "SAML assertion is not yet valid"),
		).toBe("clock");
		expect(
			probeErrorKey(
				"invalid_saml_response",
				"SAML assertion signature is required",
			),
		).toBe("signature");
		expect(probeErrorKey("replay_detected", null)).toBe("replay");
		expect(probeErrorKey("invalid_state", null)).toBe("state");
		expect(probeErrorKey("algorithm", null)).toBe("algorithm");
		expect(probeErrorKey("irgendwas", null)).toBe("other");
	});
});
