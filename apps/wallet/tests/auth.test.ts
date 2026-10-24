import { safeNext } from "@wallet/lib/auth/gates";
import { kindOfToken, LINK_PREFIX } from "@wallet/lib/auth/links";
import { isMemberRole, roleAllows } from "@wallet/lib/auth/permissions";
import { describe, expect, it } from "vitest";

describe("Rechte je Rolle", () => {
	it("Inhaber:in darf alles, Bedienung legt an, Lesend liest", () => {
		expect(roleAllows("owner", "members:manage")).toBe(true);
		expect(roleAllows("operator", "wallet:initiate")).toBe(true);
		expect(roleAllows("operator", "wallet:manage")).toBe(false);
		expect(roleAllows("operator", "members:manage")).toBe(false);
		expect(roleAllows("viewer", "wallet:read")).toBe(true);
		expect(roleAllows("viewer", "wallet:initiate")).toBe(false);
		expect(roleAllows("viewer", "audit:read")).toBe(false);
	});
	it("nur bekannte Rollen", () => {
		expect(isMemberRole("owner")).toBe(true);
		expect(isMemberRole("admin")).toBe(false);
		expect(isMemberRole(undefined)).toBe(false);
	});
});

describe("Rückweg nach dem Anmelden", () => {
	it("nur relative Pfade der App", () => {
		expect(safeNext("/send?x=1")).toBe("/send?x=1");
		expect(safeNext("//evil.example")).toBeNull();
		expect(safeNext("https://evil.example")).toBeNull();
		expect(safeNext("/api/auth/sign-out")).toBeNull();
		expect(safeNext("/\\evil")).toBeNull();
		expect(safeNext(undefined)).toBeNull();
	});
});

describe("Link-Token", () => {
	it("Art aus dem Präfix, Klick-Token zählen nicht", () => {
		expect(kindOfToken(`${LINK_PREFIX.invite}abc`)).toBe("invite");
		expect(kindOfToken(`${LINK_PREFIX.activate}abc`)).toBe("activate");
		expect(kindOfToken(`${LINK_PREFIX.recover}abc`)).toBe("recover");
		expect(kindOfToken("klk_invite_abc")).toBeNull();
		expect(kindOfToken("")).toBeNull();
	});
});
