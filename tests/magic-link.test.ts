import { describe, expect, it } from "vitest";
import {
	confirmLinkUrl,
	linkFailure,
	safeNextPath,
	verifyFormFields,
} from "@/lib/auth/magic-link";

describe("safeNextPath", () => {
	it("lässt Seiten auf dem eigenen Origin durch", () => {
		expect(
			safeNextPath("/einladung/7c9e6679-7425-40de-944b-e07fc1f90ae7"),
		).toBe("/einladung/7c9e6679-7425-40de-944b-e07fc1f90ae7");
		expect(safeNextPath("/login?grund=link-ungueltig&weiter=%2Fheute")).toBe(
			"/login?grund=link-ungueltig&weiter=%2Fheute",
		);
	});

	it("lehnt fremde Ziele, Steuerzeichen und API-Routen ab", () => {
		for (const raw of [
			undefined,
			"",
			"heute",
			"https://evil.example/heute",
			"//evil.example",
			"/\\evil.example",
			"/%0d%0aSet-Cookie:x".replace("%0d%0a", "\r\n"),
			"/api/auth/sign-out",
			"/api",
			`/${"a".repeat(600)}`,
			["/heute", "/heute"],
		]) {
			expect(safeNextPath(raw), String(raw)).toBeNull();
		}
	});
});

describe("confirmLinkUrl", () => {
	it("macht aus dem Verify-Link die Bestätigungsseite mit denselben Parametern", () => {
		const verify =
			"https://raza.work/api/auth/magic-link/verify?token=AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEf&callbackURL=%2Fheute&newUserCallbackURL=%2Fonboarding&errorCallbackURL=%2Flogin%3Fgrund%3Dlink-ungueltig";
		const url = new URL(confirmLinkUrl(verify));
		expect(url.origin).toBe("https://raza.work");
		expect(url.pathname).toBe("/login/link");
		expect(url.searchParams.get("token")).toBe(
			"AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEf",
		);
		expect(url.searchParams.get("callbackURL")).toBe("/heute");
		expect(url.searchParams.get("newUserCallbackURL")).toBe("/onboarding");
		expect(url.searchParams.get("errorCallbackURL")).toBe(
			"/login?grund=link-ungueltig",
		);
	});
});

describe("verifyFormFields", () => {
	const token = "AbCdEfGhIjKlMnOpQrStUvWxYzAbCdEf";

	it("reicht Token und geprüfte Rücksprungziele an das Formular weiter", () => {
		expect(
			verifyFormFields({
				token,
				callbackURL: "/einladung/abc",
				newUserCallbackURL: "/einladung/abc",
				errorCallbackURL: "/login?grund=link-ungueltig",
			}),
		).toEqual([
			["token", token],
			["callbackURL", "/einladung/abc"],
			["newUserCallbackURL", "/einladung/abc"],
			["errorCallbackURL", "/login?grund=link-ungueltig"],
		]);
	});

	it("verwirft fremde Rücksprungziele, behält aber den Token", () => {
		expect(
			verifyFormFields({ token, callbackURL: "https://evil.example" }),
		).toEqual([["token", token]]);
	});

	it("ohne gültigen Token kein Formular", () => {
		expect(verifyFormFields({})).toBeNull();
		expect(verifyFormFields({ token: "kurz" })).toBeNull();
		expect(verifyFormFields({ token: `${token}"><script>` })).toBeNull();
	});
});

describe("linkFailure", () => {
	it("ordnet die Better-Auth-Codes einem Hinweis zu", () => {
		expect(linkFailure("INVALID_TOKEN")).toBe("expired");
		expect(linkFailure("new_user_signup_disabled")).toBe("no_account");
		expect(linkFailure("failed_to_create_session")).toBe("other");
		expect(linkFailure(undefined)).toBe("other");
	});
});
