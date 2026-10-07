import { describe, expect, it } from "vitest";
import * as appSchema from "@/db/schema";
import { generateDek } from "@/lib/crypto/envelope";
import { encryptField } from "@/lib/crypto/fields";
import { fieldAad } from "@/lib/crypto/org-dek";
import {
	decryptRows,
	orgTablesFromSchema,
	redactSettings,
	safeFileName,
	toJson,
} from "@/lib/export/org-export";

describe("Org-Export", () => {
	it("findet alle Org-Tabellen per Reflexion, Katalog bleibt draußen", () => {
		const names = orgTablesFromSchema(appSchema).map((t) => t.name);
		expect(names.length).toBeGreaterThan(70);
		for (const n of [
			"risks",
			"audit_log",
			"org_settings",
			"evidence",
			"complaints",
		])
			expect(names).toContain(n);
		for (const n of ["frameworks", "requirements", "controls", "cms_pages"])
			expect(names).not.toContain(n);
		expect([...names].sort()).toEqual(names);
		expect(
			orgTablesFromSchema(appSchema, new Set(["risks"])).map((t) => t.name),
		).not.toContain("risks");
	});

	it("entschlüsselt enc1-Felder mit passender AAD, lässt Rest unberührt, markiert Fehlschläge", async () => {
		const dek = await generateDek();
		const id = "11111111-1111-1111-1111-111111111111";
		const stored = await encryptField({ ref: "Ticket 42" }, dek, {
			keyVersion: 1,
			aad: fieldAad("complaints", id, "complainant_ref"),
		});
		const wrongAad = await encryptField("x", dek, {
			keyVersion: 1,
			aad: fieldAad("other", id, "complainant_ref"),
		});
		const { rows, decrypted, failed } = await decryptRows(
			"complaints",
			[
				{ id, complainant_ref: stored, category: "fees", amount: 12n },
				{ id: "2", complainant_ref: wrongAad, category: "other" },
			],
			dek,
		);
		expect(decrypted).toBe(1);
		expect(failed).toBe(1);
		expect(rows[0]?.complainant_ref).toEqual({ ref: "Ticket 42" });
		expect(rows[0]?.category).toBe("fees");
		expect(rows[0]?.__nicht_entschluesselbar).toBeUndefined();
		expect(rows[1]?.complainant_ref).toBe(wrongAad);
		expect(rows[1]?.__nicht_entschluesselbar).toEqual(["complainant_ref"]);
		expect(toJson(rows[0])).toContain('"amount": "12"');
	});

	it("redaktiert den DEK und baut sichere Dateinamen", () => {
		const r = redactSettings({
			organization_id: "o",
			encrypted_dek: "geheim",
			sector: "casp",
		});
		expect(r.encrypted_dek).toBe("[nicht exportiert]");
		expect(r.sector).toBe("casp");
		expect(safeFileName("../Prüf bericht (final).pdf", "x")).toBe(
			".._Pru_f_bericht_final_.pdf",
		);
		expect(safeFileName(null, "nachweis")).toBe("nachweis");
	});
});
