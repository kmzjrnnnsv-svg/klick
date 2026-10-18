import { describe, expect, it } from "vitest";
import {
	kindOfToken,
	REGISTRATION_PREFIX,
	type RegistrationKind,
	registrationUrl,
} from "@/lib/auth/registration-link";

// Präfixe sind Teil des Secret-Scannings (klk_<art>_) und der Seiten-Zuordnung.
describe("Passkey-Links", () => {
	const page: Record<RegistrationKind, string> = {
		invite: "/einladung#",
		recover: "/zugang#",
		activate: "/aktivieren#",
	};

	it("Präfix ↔ Art und Seite je Art", () => {
		for (const kind of Object.keys(page) as RegistrationKind[]) {
			const token = `${REGISTRATION_PREFIX[kind]}abc`;
			expect(kindOfToken(token)).toBe(kind);
			expect(registrationUrl(token)).toContain(`${page[kind]}${token}`);
		}
	});

	it("unbekannte Präfixe sind keine Links", () => {
		expect(kindOfToken("klk_portal_abc")).toBeNull();
		expect(kindOfToken("abc")).toBeNull();
		expect(new Set(Object.values(REGISTRATION_PREFIX)).size).toBe(3);
	});
});
