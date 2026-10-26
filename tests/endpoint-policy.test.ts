import { describe, expect, it } from "vitest";
import {
	authEndpointDecision,
	type EndpointState,
	GUARDED_AUTH_PATHS,
	isGuardedAuthPath,
} from "@/lib/auth/endpoint-policy";

const base: EndpointState = {
	hasSession: true,
	mfaVerified: true,
	stepUpFresh: true,
	hasTotp: true,
	passkeys: 0,
	hasRegistrationToken: false,
	adminNetwork: true,
};

// Sitzung nur per Mail-Link: kein bestätigter zweiter Faktor
const mailOnly: EndpointState = {
	...base,
	mfaVerified: false,
	stepUpFresh: false,
};

describe("authEndpointDecision", () => {
	it("sperrt die Umgehung des zweiten Faktors über eine Mail-Link-Sitzung", () => {
		for (const path of [
			"/two-factor/get-totp-uri",
			"/two-factor/generate-backup-codes",
			"/two-factor/disable",
			"/two-factor/enable",
			"/passkey/generate-register-options",
			"/passkey/verify-registration",
			"/passkey/delete-passkey",
		]) {
			expect(authEndpointDecision(path, mailOnly)).toEqual({
				allow: false,
				code: "mfa_required",
			});
		}
	});

	it("verlangt zum Verwalten einen frischen Step-up", () => {
		const stale = { ...base, stepUpFresh: false };
		expect(authEndpointDecision("/two-factor/disable", stale)).toEqual({
			allow: false,
			code: "step_up_required",
		});
		expect(
			authEndpointDecision("/passkey/generate-register-options", stale),
		).toEqual({
			allow: false,
			code: "step_up_required",
		});
		expect(
			authEndpointDecision("/two-factor/disable", { ...base, passkeys: 1 }),
		).toEqual({ allow: true });
	});

	it("lässt die Ersteinrichtung ohne Faktor zu", () => {
		const fresh: EndpointState = {
			...mailOnly,
			hasTotp: false,
			passkeys: 0,
		};
		expect(authEndpointDecision("/two-factor/enable", fresh).allow).toBe(true);
		expect(
			authEndpointDecision("/passkey/generate-register-options", fresh).allow,
		).toBe(true);
		// Verwalten bleibt auch dann gesperrt
		expect(authEndpointDecision("/two-factor/get-totp-uri", fresh).allow).toBe(
			false,
		);
	});

	it("Passkey ohne Sitzung nur mit Link-Token", () => {
		const anon: EndpointState = {
			...base,
			hasSession: false,
			mfaVerified: false,
			stepUpFresh: false,
			hasTotp: false,
		};
		expect(
			authEndpointDecision("/passkey/generate-register-options", anon),
		).toEqual({ allow: false, code: "unauthenticated" });
		expect(
			authEndpointDecision("/passkey/generate-register-options", {
				...anon,
				hasRegistrationToken: true,
			}).allow,
		).toBe(true);
		expect(
			authEndpointDecision("/passkey/verify-registration", anon).allow,
		).toBe(true);
		expect(authEndpointDecision("/two-factor/enable", anon).allow).toBe(false);
	});

	it("der letzte Faktor lässt sich nicht entfernen", () => {
		const passkeyOnly = { ...base, hasTotp: false, passkeys: 1 };
		expect(
			authEndpointDecision("/passkey/delete-passkey", passkeyOnly),
		).toEqual({ allow: false, code: "last_factor" });
		expect(authEndpointDecision("/two-factor/disable", base)).toEqual({
			allow: false,
			code: "last_factor",
		});
		expect(
			authEndpointDecision("/passkey/delete-passkey", {
				...passkeyOnly,
				passkeys: 2,
			}).allow,
		).toBe(true);
		expect(
			authEndpointDecision("/two-factor/disable", { ...base, passkeys: 1 })
				.allow,
		).toBe(true);
		// ohne Step-up bleibt es beim Step-up-Hinweis
		expect(
			authEndpointDecision("/passkey/delete-passkey", {
				...passkeyOnly,
				stepUpFresh: false,
			}),
		).toEqual({ allow: false, code: "step_up_required" });
	});

	it("E-Mail-/SMS-Codes sind nie erlaubt, alles andere bleibt unberührt", () => {
		expect(authEndpointDecision("/two-factor/send-otp", base)).toEqual({
			allow: false,
			code: "forbidden",
		});
		expect(
			authEndpointDecision("/two-factor/verify-totp", mailOnly).allow,
		).toBe(true);
		expect(authEndpointDecision("/sign-in/magic-link", mailOnly).allow).toBe(
			true,
		);
		expect(GUARDED_AUTH_PATHS.has("/two-factor/verify-totp")).toBe(false);
	});

	it("Admin-Endpunkte nur aus dem Admin-Netz (Härtung A2)", () => {
		const outside = { ...base, adminNetwork: false };
		for (const path of [
			"/admin/impersonate-user",
			"/admin/ban-user",
			"/admin/set-role",
			"/admin/create-user",
			"/admin/list-users",
		]) {
			expect(isGuardedAuthPath(path)).toBe(true);
			expect(authEndpointDecision(path, outside)).toEqual({
				allow: false,
				code: "admin_network",
			});
			expect(authEndpointDecision(path, base).allow).toBe(true);
		}
		// andere Pfade hängen nicht am Admin-Netz
		expect(authEndpointDecision("/sign-in/magic-link", outside).allow).toBe(
			true,
		);
		expect(isGuardedAuthPath("/sign-in/magic-link")).toBe(false);
	});
});
