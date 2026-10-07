import { describe, expect, it } from "vitest";
import { extractMentionHandles, resolveMentions } from "@/lib/mentions";

const members = [
	{ userId: "1", name: "Anna Meier", email: "anna.meier@firma.de" },
	{ userId: "2", name: "Ben Özil", email: "ben@firma.de" },
	{ userId: "3", name: "Cara", email: "cara@extern.io" },
];

describe("mentions", () => {
	it("findet Handles am Wortanfang, ohne Satzzeichen, ohne E-Mail-Adressen zu zerreissen", () => {
		expect(
			extractMentionHandles(
				"Bitte @anna.meier prüfen, @ben@firma.de auch! (@cara)",
			),
		).toEqual(["anna.meier", "ben@firma.de", "cara"]);
		expect(extractMentionHandles("mail an info@firma.de")).toEqual([]);
	});

	it("löst gegen E-Mail, Local-Part und Namen auf, dedupliziert", () => {
		const r = resolveMentions(
			"@anna.meier und @Anna.Meier und @ben@firma.de",
			members,
		);
		expect(r.map((m) => m.userId).sort()).toEqual(["1", "2"]);
	});

	it("Umlaute und unbekannte Handles", () => {
		expect(resolveMentions("@ben.özil", members).map((m) => m.userId)).toEqual([
			"2",
		]);
		expect(resolveMentions("@niemand", members)).toEqual([]);
	});
});
