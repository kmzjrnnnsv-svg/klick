import { describe, expect, it } from "vitest";
import {
	DEFAULT_SSO_POLICY,
	groupsFrom,
	isSsoCallbackPath,
	oidcMfa,
	providerPreset,
	roleFromGroups,
	samlMfa,
	ssoGate,
	ssoPolicyOf,
} from "@/lib/auth/sso-policy";

// SSO je Kunde (S1–S3): Gruppen → Rolle, Firmen-MFA, Erzwingen, Vorlagen.

const policy = ssoPolicyOf({
	defaultRole: "employee",
	groupRoles: [
		{ group: "Klick-Lesend", role: "viewer" },
		{ group: "0b6f6a1e-1111-4222-8333-944455556666", role: "editor" },
		{ group: "x", role: "owner" },
	],
});

describe("Rolle aus Gruppen", () => {
	it("höchste passende Rolle, nie Inhaber:in, sonst Standard", () => {
		expect(roleFromGroups([], policy)).toBe("employee");
		expect(roleFromGroups(["klick-lesend"], policy)).toBe("viewer");
		expect(
			roleFromGroups(
				["Klick-Lesend", "0B6F6A1E-1111-4222-8333-944455556666"],
				policy,
			),
		).toBe("editor");
		// „owner“ wird beim Einlesen verworfen
		expect(policy.groupRoles).toHaveLength(2);
		expect(roleFromGroups(["x"], policy)).toBe("employee");
	});
	it("Gruppen aus Liste, Text oder fehlend", () => {
		expect(groupsFrom({ groups: ["a", " b "] }, "groups")).toEqual(["a", "b"]);
		expect(groupsFrom({ roles: "a,b" }, "roles")).toEqual(["a", "b"]);
		expect(groupsFrom({}, "groups")).toEqual([]);
		expect(groupsFrom(null, "groups")).toEqual([]);
	});
	it("unbekannte Werte fallen auf den Standard", () => {
		expect(ssoPolicyOf(null)).toEqual(DEFAULT_SSO_POLICY);
		expect(ssoPolicyOf({ defaultRole: "owner" }).defaultRole).toBe("employee");
	});
});

describe("Firmen-MFA", () => {
	it("OIDC amr/acr", () => {
		expect(oidcMfa({ amr: ["pwd", "mfa"] })).toBe(true);
		expect(oidcMfa({ amr: ["pwd"] })).toBe(false);
		expect(oidcMfa({ amr: "mfa" })).toBe(false);
		expect(
			oidcMfa({
				acr: "http://schemas.openid.net/pape/policies/2007/06/multi-factor",
			}),
		).toBe(true);
		expect(oidcMfa({})).toBe(false);
	});
	it("SAML authnmethodsreferences", () => {
		expect(
			samlMfa({
				"http://schemas.microsoft.com/claims/authnmethodsreferences": [
					"http://schemas.microsoft.com/ws/2008/06/identity/authenticationmethod/password",
					"http://schemas.microsoft.com/claims/multipleauthn",
				],
			}),
		).toBe(true);
		expect(samlMfa({ email: "a@b.de" })).toBe(false);
	});
});

describe("SSO erzwingen", () => {
	const deny = [{ orgId: "o", isOwner: false }];
	it("nur der SSO-Rückruf gibt eine Sitzung", () => {
		expect(isSsoCallbackPath("/sso/callback/:providerId")).toBe(true);
		expect(isSsoCallbackPath("/sso/saml2/sp/acs/:providerId")).toBe(true);
		expect(isSsoCallbackPath("/passkey/verify-authentication")).toBe(false);
		expect(ssoGate({ path: "/magic-link/verify", enforcingOrgs: deny })).toBe(
			"deny",
		);
		expect(
			ssoGate({ path: "/sso/callback/:providerId", enforcingOrgs: deny }),
		).toBe("allow");
		expect(ssoGate({ path: "/magic-link/verify", enforcingOrgs: [] })).toBe(
			"allow",
		);
	});
	it("Inhaber:innen behalten den Notzugang", () => {
		expect(
			ssoGate({
				path: "/passkey/verify-authentication",
				enforcingOrgs: [{ orgId: "o", isOwner: true }],
			}),
		).toBe("bypass");
	});
});

describe("Anbieter-Vorlagen", () => {
	it("Entra, Google, Okta, OIDC", () => {
		expect(
			providerPreset("entra", {
				tenant: "0b6f6a1e-1111-4222-8333-944455556666",
			})?.issuer,
		).toBe(
			"https://login.microsoftonline.com/0b6f6a1e-1111-4222-8333-944455556666/v2.0",
		);
		expect(providerPreset("entra", { tenant: "nope" })).toBeNull();
		expect(providerPreset("google", {})?.discoveryEndpoint).toBe(
			"https://accounts.google.com/.well-known/openid-configuration",
		);
		expect(
			providerPreset("okta", { oktaDomain: "https://firma.okta.com/" })?.issuer,
		).toBe("https://firma.okta.com");
		expect(providerPreset("oidc", { issuer: "http://unsicher" })).toBeNull();
	});
});
