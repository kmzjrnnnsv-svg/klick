import { describe, expect, it } from "vitest";
import { roleAllows } from "@/lib/auth/permissions";
import { normalizeRole } from "@/lib/auth/session-rules";
import { inDistribution } from "@/lib/documents/distribution";
import { buildNav, navTabs } from "@/lib/nav";

// Mitarbeitende (M1): sehen nur gültige Richtlinien laut Verteiler und
// freigegebene Nachweise, bestätigen die Kenntnisnahme, sonst nichts.

describe("Rolle Mitarbeitende", () => {
	it("darf nur Richtlinien lesen, bestätigen und freigegebene Nachweise laden", () => {
		expect(roleAllows("employee", { policy: ["read"] })).toBe(true);
		expect(roleAllows("employee", { acknowledgement: ["create"] })).toBe(true);
		expect(roleAllows("employee", { evidence_shared: ["read"] })).toBe(true);
		for (const p of [
			{ document: ["read"] },
			{ evidence: ["read"] },
			{ control: ["read"] },
			{ risk: ["read"] },
			{ comment: ["create"] },
			{ export: ["download"] },
		] as const)
			expect(roleAllows("employee", p as never)).toBe(false);
	});
	it("alle anderen Rollen sehen die Richtlinien auch", () => {
		for (const role of [
			"owner",
			"editor",
			"viewer",
			"auditor",
			"consultant",
		] as const) {
			expect(roleAllows(role, { policy: ["read"] })).toBe(true);
			expect(roleAllows(role, { evidence_shared: ["read"] })).toBe(true);
		}
	});
	it("steht unter Lesend; unbekannte Rollen bleiben Lesend", () => {
		expect(normalizeRole("employee,viewer")).toBe("viewer");
		expect(normalizeRole("employee")).toBe("employee");
		expect(normalizeRole("member,employee")).toBe("employee");
		expect(normalizeRole("member")).toBe("viewer");
	});
	it("Navigation: nur Richtlinien, keine Tab-Leiste", () => {
		const nav = buildNav({
			frameworks: [{ slug: "iso27001", name: "ISO 27001" }],
			licenceStage: "0_vorbereitung",
			caspServices: [],
			role: "employee",
		});
		expect(nav.flatMap((g) => g.items.map((i) => i.href))).toEqual([
			"/richtlinien",
		]);
		expect(navTabs(nav)).toEqual([]);
	});
});

describe("Verteiler", () => {
	const staff = { role: "employee", functions: [] };
	const isb = { role: "editor", functions: ["isb"] };
	it("leer oder „all“ = alle", () => {
		expect(inDistribution([], staff)).toBe(true);
		expect(inDistribution(["all"], staff)).toBe(true);
	});
	it("Grundrolle oder Funktion", () => {
		expect(inDistribution(["employee"], staff)).toBe(true);
		expect(inDistribution(["employee"], isb)).toBe(false);
		expect(inDistribution(["function:isb"], isb)).toBe(true);
		expect(inDistribution(["function:dpo"], isb)).toBe(false);
	});
	it("eigene Rollen als Funktion", () => {
		const id = "0b6f6a1e-1111-4222-8333-944455556666";
		expect(
			inDistribution([`function:role:${id}`], {
				role: "viewer",
				functions: [`role:${id}`],
			}),
		).toBe(true);
	});
});
