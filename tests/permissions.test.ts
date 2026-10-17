import { describe, expect, it } from "vitest";
import { roleAllows } from "@/lib/auth/permissions";

describe("permissions", () => {
	it("viewer liest und kommentiert, ändert nichts", () => {
		expect(roleAllows("viewer", { control: ["read"] })).toBe(true);
		expect(roleAllows("viewer", { comment: ["create"] })).toBe(true);
		expect(roleAllows("viewer", { control: ["update"] })).toBe(false);
		expect(roleAllows("viewer", { document: ["create"] })).toBe(false);
	});
	it("editor arbeitet, gibt aber nicht frei", () => {
		expect(roleAllows("editor", { control: ["update"] })).toBe(true);
		expect(roleAllows("editor", { document: ["create", "update"] })).toBe(true);
		expect(roleAllows("editor", { document: ["approve"] })).toBe(false);
		expect(roleAllows("editor", { document: ["publish"] })).toBe(false);
		expect(roleAllows("editor", { resolution: ["create"] })).toBe(false);
		expect(roleAllows("editor", { settings: ["update"] })).toBe(false);
		expect(roleAllows("editor", { member: ["create"] })).toBe(false);
	});
	it("owner darf alles", () => {
		expect(roleAllows("owner", { document: ["approve", "publish"] })).toBe(
			true,
		);
		expect(roleAllows("owner", { resolution: ["create"] })).toBe(true);
		expect(
			roleAllows("owner", { member: ["create", "update", "delete"] }),
		).toBe(true);
		expect(roleAllows("owner", { settings: ["update"] })).toBe(true);
	});
	it("auditor: lesen + Nachweisanfragen + Findings, keine Statusänderung", () => {
		expect(roleAllows("auditor", { audit_request: ["create"] })).toBe(true);
		expect(roleAllows("auditor", { audit_finding: ["create"] })).toBe(true);
		expect(roleAllows("auditor", { control: ["read"] })).toBe(true);
		expect(roleAllows("auditor", { control: ["update"] })).toBe(false);
		expect(roleAllows("auditor", { document: ["create"] })).toBe(false);
	});
	it("consultant arbeitet wie editor, löscht und entscheidet nichts", () => {
		expect(roleAllows("consultant", { control: ["update", "assign"] })).toBe(
			true,
		);
		expect(roleAllows("consultant", { risk: ["create", "update"] })).toBe(true);
		expect(
			roleAllows("consultant", { assessment: ["answer", "review", "apply"] }),
		).toBe(true);
		expect(roleAllows("consultant", { export: ["create"] })).toBe(true);
		// nie löschen
		for (const r of [
			"document",
			"process",
			"risk",
			"provider",
			"asset",
			"evidence",
			"product",
		] as const)
			expect(roleAllows("consultant", { [r]: ["delete"] })).toBe(false);
		// keine Entscheidungen der Organisation
		expect(roleAllows("consultant", { approval: ["decide"] })).toBe(false);
		expect(roleAllows("consultant", { security: ["accept"] })).toBe(false);
		expect(roleAllows("consultant", { document: ["approve"] })).toBe(false);
		// Team, Einstellungen, Integrationen, Hinweisgeber bleiben intern
		expect(roleAllows("consultant", { member: ["create"] })).toBe(false);
		expect(roleAllows("consultant", { settings: ["update"] })).toBe(false);
		expect(roleAllows("consultant", { integration: ["create"] })).toBe(false);
		expect(roleAllows("consultant", { whistleblowing: ["read"] })).toBe(false);
	});
	it("unbekannte Rolle hat nichts", () => {
		expect(roleAllows("hacker", { control: ["read"] })).toBe(false);
	});
});
