import { describe, expect, it } from "vitest";
import {
	canHoldCustomRoles,
	effectivePermissions,
	grantableActions,
	mergePermissions,
	sanitizePermissions,
} from "@/lib/auth/permission-catalog";
import { allows, permissionsAllow } from "@/lib/auth/permissions";

describe("Rechte-Katalog (eigene Rollen, ADR-020)", () => {
	it("Inhaber-Rechte sind nie vergebbar", () => {
		expect(grantableActions("settings")).toEqual([]);
		expect(grantableActions("role_assignment")).toEqual([]);
		expect(grantableActions("integration")).toEqual([]);
		expect(grantableActions("member" as never)).toEqual([]);
	});
	it("Rechte ohne prüfende Aktion sind ausgeblendet", () => {
		expect(grantableActions("risk")).toEqual([
			"read",
			"create",
			"update",
			"accept",
		]);
		expect(grantableActions("document")).not.toContain("publish");
		expect(grantableActions("approval")).toEqual(["read", "decide"]);
	});
	it("sanitizePermissions verwirft Unbekanntes und Reserviertes", () => {
		expect(
			sanitizePermissions({
				provider: ["create", "create", "fly"],
				settings: ["update"],
				member: ["create"],
				risk: "accept",
			}),
		).toEqual({ provider: ["create"] });
		expect(sanitizePermissions(null)).toEqual({});
	});
	it("mergePermissions vereinigt ohne Duplikate", () => {
		expect(
			mergePermissions(
				{ risk: ["read"] },
				{ risk: ["read", "create"], provider: ["create"] },
			),
		).toEqual({ risk: ["read", "create"], provider: ["create"] });
	});
	it("Lesend + Einkauf darf Dienstleister anlegen, sonst nichts dazu", () => {
		const einkauf = { provider: ["create", "update"] };
		const p = effectivePermissions("viewer", [einkauf]);
		expect(permissionsAllow(p, { provider: ["read", "create"] })).toBe(true);
		expect(permissionsAllow(p, { risk: ["create"] })).toBe(false);
		expect(allows({ permissions: p }, { approval: ["decide"] })).toBe(false);
		// ohne eigene Rolle: nur lesen
		expect(
			permissionsAllow(effectivePermissions("viewer", []), {
				provider: ["create"],
			}),
		).toBe(false);
	});
	it("Externe und Inhaber:innen tragen keine eigenen Rollen", () => {
		expect(canHoldCustomRoles("viewer")).toBe(true);
		expect(canHoldCustomRoles("editor")).toBe(true);
		for (const r of ["owner", "auditor", "consultant"])
			expect(canHoldCustomRoles(r)).toBe(false);
		const p = effectivePermissions("consultant", [
			{ approval: ["decide"], risk: ["accept"] },
		]);
		expect(permissionsAllow(p, { approval: ["decide"] })).toBe(false);
		expect(permissionsAllow(p, { risk: ["accept"] })).toBe(false);
	});
	it("auch eine eigene Rolle gibt nie Einstellungen frei", () => {
		const p = effectivePermissions("editor", [{ settings: ["update"] }]);
		expect(permissionsAllow(p, { settings: ["update"] })).toBe(false);
	});
});
