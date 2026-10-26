import { describe, expect, it } from "vitest";
import {
	hidesSecret,
	maskSecret,
	restrictedView,
	seesSecret,
} from "@/lib/auth/visibility";

// Prüfer-Sicht (V3): Externe ohne „Entwürfe und Verlauf“ sehen nur die
// gültige Fassung; streng geheime Unterlagen nur mit Grant.

const v = (orgRole: string, grants: string[] = []) => ({ orgRole, grants });

describe("Prüfer-Sicht", () => {
	it("nur Externe ohne Grant sind eingeschränkt", () => {
		expect(restrictedView(v("auditor"))).toBe(true);
		expect(restrictedView(v("consultant"))).toBe(true);
		expect(restrictedView(v("consultant", ["work_in_progress"]))).toBe(false);
		expect(restrictedView(v("auditor", ["work_in_progress"]))).toBe(false);
		expect(restrictedView(v("owner"))).toBe(false);
		expect(restrictedView(v("editor"))).toBe(false);
		expect(restrictedView(v("viewer"))).toBe(false);
	});

	it("streng geheim: intern immer, extern nur mit Grant", () => {
		expect(seesSecret(v("viewer"))).toBe(true);
		expect(seesSecret(v("auditor"))).toBe(false);
		expect(seesSecret(v("auditor", ["secret_evidence"]))).toBe(true);
		expect(hidesSecret(v("auditor"), { classification: "secret" })).toBe(true);
		expect(hidesSecret(v("auditor"), { classification: "confidential" })).toBe(
			false,
		);
	});

	it("Listen zeigen streng geheime Einträge ohne Titel, Beschreibung, Link", () => {
		const rows = [
			{
				id: "1",
				classification: "secret",
				title: "HSM-Schlüssel",
				description: "Ort im Tresor",
				url: "https://intern",
				fileName: "hsm.pdf",
			},
			{
				id: "2",
				classification: "internal",
				title: "Schulung",
				description: null,
				url: null,
				fileName: null,
			},
		];
		const masked = maskSecret(v("auditor"), rows, "Streng geheim");
		expect(masked[0]).toEqual({
			id: "1",
			classification: "secret",
			title: "Streng geheim",
			description: null,
			url: null,
			fileName: null,
		});
		expect(masked[1]).toEqual(rows[1]);
		expect(maskSecret(v("owner"), rows, "x")).toEqual(rows);
	});
});
