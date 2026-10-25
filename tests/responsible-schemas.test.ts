import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// „Verantwortlich“ = Funktion oder Person: jedes Schema mit ownerUserId nimmt
// auch `function:<key>` an (responsibleRef). Sonst lehnt der Server ab, was
// ResponsibleSelect im Formular anbietet. Ausnahmen sind bewusst nur Personen.
const PERSON_ONLY = new Set([
	// Maßnahmen werden Aufgaben, Aufgaben haben eine Person
	"registers.ts:createTreatmentSchema",
	// Kommunikation führt Funktion und Person in zwei Feldern
	"governance.ts:communicationSchema",
]);

const dir = join(__dirname, "../lib/validation");

async function schemasWithOwner() {
	const out: { key: string; field: z.ZodType }[] = [];
	for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
		const mod = (await import(join(dir, f))) as Record<string, unknown>;
		for (const [name, v] of Object.entries(mod)) {
			if (!(v instanceof z.ZodObject)) continue;
			const field = (v as z.ZodObject).shape.ownerUserId;
			if (field) out.push({ key: `${f}:${name}`, field: field as z.ZodType });
		}
	}
	return out;
}

describe("Verantwortlich in den Schemas", () => {
	it("jedes Schema mit ownerUserId nimmt eine Funktion an", async () => {
		const all = await schemasWithOwner();
		expect(all.length).toBeGreaterThan(20);
		const rejecting = all
			.filter(({ key }) => !PERSON_ONLY.has(key))
			.filter(({ field }) => !field.safeParse("function:isb_ciso").success)
			.map(({ key }) => key);
		expect(rejecting).toEqual([]);
		// keine veralteten Ausnahmen
		const keys = new Set(all.map((s) => s.key));
		expect([...PERSON_ONLY].filter((k) => !keys.has(k))).toEqual([]);
	});

	it("unbekannte Funktionen lehnt es ab", async () => {
		const all = await schemasWithOwner();
		const accepting = all
			.filter(({ field }) => field.safeParse("function:chef").success)
			.map(({ key }) => key);
		expect(accepting).toEqual([]);
	});
});
