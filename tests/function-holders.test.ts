import { describe, expect, it } from "vitest";
import {
	type FunctionAssignment,
	functionsOf,
	holdersOf,
	recipientsOf,
	responsibleFor,
} from "@/lib/compliance/function-holders";

const rows: FunctionAssignment[] = [
	// zwei Geschäftsführer:innen, die zuerst bestellte führt
	{
		function: "management_body",
		userId: "gf2",
		deputyUserId: null,
		appointedAt: "2025-03-01",
	},
	{
		function: "management_body",
		userId: "gf1",
		deputyUserId: null,
		appointedAt: "2024-01-01",
	},
	// eine Person mit drei Funktionen
	{ function: "isb_ciso", userId: "gf1", deputyUserId: "anna" },
	{ function: "dpo", userId: "gf1", deputyUserId: null },
	// extern besetzt: zählt nicht als Person, die Vertretung übernimmt
	{ function: "aml_officer", userId: null, deputyUserId: "anna" },
	// Vertretung = Inhaber:in wird nicht doppelt gezählt
	{ function: "compliance", userId: "bob", deputyUserId: "bob" },
];

describe("Funktion → Person", () => {
	it("mehrere Inhaber:innen in Bestellreihenfolge", () => {
		expect(holdersOf(rows, "management_body")).toEqual({
			holders: ["gf1", "gf2"],
			deputies: [],
		});
		expect(responsibleFor(rows, "management_body")).toBe("gf1");
	});

	it("ohne Konto übernimmt die Vertretung, unbesetzt ist null", () => {
		expect(responsibleFor(rows, "aml_officer")).toBe("anna");
		expect(responsibleFor(rows, "bcm_manager")).toBeNull();
	});

	it("Empfänger:innen: Inhaber:innen und Vertretung, ohne Doppel", () => {
		expect(recipientsOf(rows, "isb_ciso")).toEqual(["gf1", "anna"]);
		expect(recipientsOf(rows, "compliance")).toEqual(["bob"]);
	});

	it("Funktionen einer Person, Inhaber:in vor Vertretung", () => {
		expect(functionsOf(rows, "gf1").map((f) => f.function)).toEqual([
			"management_body",
			"isb_ciso",
			"dpo",
		]);
		expect(functionsOf(rows, "anna")).toEqual([
			{ function: "isb_ciso", as: "deputy" },
			{ function: "aml_officer", as: "deputy" },
		]);
	});
});
