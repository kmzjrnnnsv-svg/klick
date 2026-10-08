import { describe, expect, it } from "vitest";
import { holdsFunction } from "@/lib/compliance/top-management";

const rows = [
	{
		function: "management_body" as const,
		userId: "gf",
		deputyUserId: "vertretung",
	},
	{ function: "isb_ciso" as const, userId: "isb", deputyUserId: null },
];

describe("Top-Management (Funktion Geschäftsleitung)", () => {
	it("Geschäftsleitung und ihre Vertretung zählen", () => {
		expect(holdsFunction(rows, "gf")).toBe(true);
		expect(holdsFunction(rows, "vertretung")).toBe(true);
	});
	it("andere Funktionen und Rollen zählen nicht", () => {
		expect(holdsFunction(rows, "isb")).toBe(false);
		expect(holdsFunction(rows, "owner-ohne-funktion")).toBe(false);
	});
});
