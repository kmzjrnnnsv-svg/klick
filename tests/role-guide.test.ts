import { describe, expect, it } from "vitest";
import {
	canDecideApprovals,
	capabilitiesFor,
	roleChange,
} from "@/lib/auth/role-guide";

const allowed = (role: Parameters<typeof capabilitiesFor>[0]) =>
	capabilitiesFor(role)
		.filter((c) => c.allowed)
		.map((c) => c.key);

describe("Rollen-Leitfaden (aus roleAllows abgeleitet)", () => {
	it("Lesend: lesen und kommentieren, sonst nichts", () => {
		expect(allowed("viewer")).toEqual(["read", "comment"]);
	});

	it("Bearbeiter:in gibt frei, wenn die Funktion gefragt ist (alter Hinweis war falsch)", () => {
		const caps = allowed("editor");
		expect(caps).toContain("work");
		expect(caps).toContain("decide");
		expect(caps).not.toContain("publish");
		expect(caps).not.toContain("team");
		expect(caps).not.toContain("settings");
	});

	it("Inhaber:in darf alles", () => {
		expect(capabilitiesFor("owner").every((c) => c.allowed)).toBe(true);
	});

	it("Prüfer:in stellt Prüfungsanfragen, gibt aber nichts frei", () => {
		const caps = allowed("auditor");
		expect(caps).toContain("auditRequests");
		expect(caps).not.toContain("decide");
		expect(caps).not.toContain("work");
	});

	it("Rollenwechsel nennt Gewinne und Verluste", () => {
		expect(roleChange("editor", "viewer")).toEqual({
			gains: [],
			losses: ["work", "decide", "export"],
		});
		const up = roleChange("viewer", "owner");
		expect(up.losses).toEqual([]);
		expect(up.gains).toContain("team");
	});

	it("Freigabe-Recht hängt an der Rolle", () => {
		expect(canDecideApprovals("editor")).toBe(true);
		expect(canDecideApprovals("viewer")).toBe(false);
		expect(canDecideApprovals("auditor")).toBe(false);
	});
});
