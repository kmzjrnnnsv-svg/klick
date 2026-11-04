import { describe, expect, it } from "vitest";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import {
	type CatalogOrderControl,
	CONTROL_AFTER,
	predecessorsOf,
} from "@/lib/compliance/catalog/control-order";

// Teil C: Reihenfolge beim Umsetzen. Verweise gibt es, und über den ganzen
// Katalog (gepflegt + Regel je Bereich) entsteht kein Kreis.

describe("Reihenfolge der Maßnahmen", () => {
	it("verweist nur auf bestehende Controls", () => {
		const unknown: string[] = [];
		for (const [code, before] of Object.entries(CONTROL_AFTER)) {
			if (!CONTROL_BY_CODE.has(code)) unknown.push(code);
			for (const b of before) if (!CONTROL_BY_CODE.has(b)) unknown.push(b);
			expect(before, code).not.toContain(code);
		}
		expect(unknown).toEqual([]);
	});

	it("hat über den ganzen Katalog keinen Kreis", () => {
		const all = new Map<string, CatalogOrderControl>(
			[...CONTROL_BY_CODE.values()].map((c) => [c.code, c]),
		);
		const preds = new Map<string, string[]>(
			[...all.values()].map((c) => [c.code, predecessorsOf(c, all)]),
		);
		const state = new Map<string, "visiting" | "done">();
		const cycle: string[] = [];
		const visit = (code: string, path: string[]): void => {
			if (state.get(code) === "done" || cycle.length) return;
			if (state.get(code) === "visiting") {
				cycle.push(...path, code);
				return;
			}
			state.set(code, "visiting");
			for (const p of preds.get(code) ?? []) visit(p, [...path, code]);
			state.set(code, "done");
		};
		for (const code of all.keys()) visit(code, []);
		expect(cycle).toEqual([]);
	});

	it("stellt die Richtlinie des Bereichs vor technische Maßnahmen", () => {
		const pick = (codes: string[]) =>
			new Map(
				codes.map((c) => {
					const ctl = CONTROL_BY_CODE.get(c);
					if (!ctl) throw new Error(c);
					return [c, ctl];
				}),
			);
		const plan = pick(["CC-IAM-01", "CC-IAM-03", "CC-IAM-02", "CC-CRY-01"]);
		const iam03 = CONTROL_BY_CODE.get("CC-IAM-03");
		if (!iam03) throw new Error("CC-IAM-03");
		// IAM-01 ist die Richtlinie im Bereich Zugang, CRY-01 ein anderer Bereich
		expect(predecessorsOf(iam03, plan)).toEqual(["CC-IAM-01"]);
		// nur, was im Plan steht
		const iam02 = CONTROL_BY_CODE.get("CC-IAM-02");
		if (!iam02) throw new Error("CC-IAM-02");
		expect(predecessorsOf(iam02, pick(["CC-IAM-02"]))).toEqual([]);
	});
});
