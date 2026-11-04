import { describe, expect, it } from "vitest";
import { splitInternalPaths } from "@/lib/text/internal-paths";

describe("interne Pfade im Text", () => {
	it("macht eigene Pfade zu Teilen, Satzzeichen bleiben Text", () => {
		expect(splitInternalPaths("Offener Punkt: /controls/CC-IAM-01.")).toEqual([
			{ kind: "text", value: "Offener Punkt: " },
			{ kind: "path", value: "/controls/CC-IAM-01" },
			{ kind: "text", value: "." },
		]);
	});
	it("behält Abfrage und Anker", () => {
		const parts = splitInternalPaths(
			"Siehe /dokumente?vorlagen=1&vorlage=DOC-ISMS",
		);
		expect(parts[1]).toEqual({
			kind: "path",
			value: "/dokumente?vorlagen=1&vorlage=DOC-ISMS",
		});
	});
	it("fremde Adressen und Pfade mitten im Wort bleiben Text", () => {
		for (const s of [
			"https://example.org/controls",
			"//evil.example/x",
			"und/oder",
			"Ein Satz ohne Pfad",
		])
			expect(splitInternalPaths(s).every((p) => p.kind === "text")).toBe(true);
	});
});
