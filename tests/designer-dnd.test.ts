import { describe, expect, it } from "vitest";
import { applyDesignerDrop, MAX_STEPS } from "@/lib/approvals/designer-dnd";

type S = { key: string; approvers: string[]; everyone: boolean };
const step = (key: string, ...approvers: string[]): S => ({
	key,
	approvers,
	everyone: false,
});
let n = 0;
const make = (approvers: string[]): S => ({
	key: `new${++n}`,
	approvers,
	everyone: false,
});

describe("Freigabe-Designer per Ziehen", () => {
	const base = [step("a", "function:management_body"), step("b", "role:x")];

	it("Stelle in eine Stufe: hinzufügen, nie doppelt", () => {
		const out = applyDesignerDrop(
			base,
			{ type: "rule", rule: "owner_of_entity" },
			{ type: "step", step: "b" },
			make,
		);
		expect(out[1]?.approvers).toEqual(["role:x", "owner_of_entity"]);
		const again = applyDesignerDrop(
			out,
			{ type: "rule", rule: "owner_of_entity" },
			{ type: "step", step: "b" },
			make,
		);
		expect(again[1]?.approvers).toEqual(["role:x", "owner_of_entity"]);
	});

	it("Stelle auf „Neue Stufe“: neue Stufe am Ende, höchstens acht", () => {
		const out = applyDesignerDrop(
			base,
			{ type: "rule", rule: "function:aml_officer" },
			{ type: "new" },
			make,
		);
		expect(out).toHaveLength(3);
		expect(out[2]?.approvers).toEqual(["function:aml_officer"]);
		const full = Array.from({ length: MAX_STEPS }, (_, i) => step(`f${i}`));
		expect(
			applyDesignerDrop(
				full,
				{ type: "rule", rule: "x" },
				{ type: "new" },
				make,
			),
		).toBe(full);
	});

	it("„Alle stimmen zu“ auf eine Stufe setzt die Eigenschaft", () => {
		const out = applyDesignerDrop(
			base,
			{ type: "everyone" },
			{ type: "step", step: "a" },
			make,
		);
		expect(out[0]?.everyone).toBe(true);
		expect(out[1]?.everyone).toBe(false);
	});

	it("Stelle zwischen Stufen verschieben, zurück in die Palette entfernt", () => {
		const moved = applyDesignerDrop(
			base,
			{ type: "assigned", step: "a", rule: "function:management_body" },
			{ type: "step", step: "b" },
			make,
		);
		expect(moved[0]?.approvers).toEqual([]);
		expect(moved[1]?.approvers).toEqual(["role:x", "function:management_body"]);
		const removed = applyDesignerDrop(
			base,
			{ type: "assigned", step: "b", rule: "role:x" },
			{ type: "palette" },
			make,
		);
		expect(removed[1]?.approvers).toEqual([]);
		// auf die eigene Stufe: nichts
		expect(
			applyDesignerDrop(
				base,
				{ type: "assigned", step: "b", rule: "role:x" },
				{ type: "step", step: "b" },
				make,
			),
		).toBe(base);
	});

	it("Stufe auf eine andere ziehen sortiert um", () => {
		const three = [...base, step("c", "user:1")];
		const out = applyDesignerDrop(
			three,
			{ type: "step", step: "c" },
			{ type: "step", step: "a" },
			make,
		);
		expect(out.map((s) => s.key)).toEqual(["c", "a", "b"]);
		const down = applyDesignerDrop(
			three,
			{ type: "step", step: "a" },
			{ type: "step", step: "c" },
			make,
		);
		expect(down.map((s) => s.key)).toEqual(["b", "c", "a"]);
		// Stufe in die Palette: nichts
		expect(
			applyDesignerDrop(
				three,
				{ type: "step", step: "a" },
				{ type: "palette" },
				make,
			),
		).toBe(three);
	});
});
