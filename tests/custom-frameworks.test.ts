import { describe, expect, it } from "vitest";
import { CATALOG_FRAMEWORKS } from "@/lib/compliance/catalog";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog/controls";
import {
	customSlug,
	isCustomSlug,
	keyFromSlug,
	mapCsvRows,
	naturalCompare,
	parseControls,
	parseDomain,
	suggestKey,
	uniqueKey,
	validKey,
} from "@/lib/custom-frameworks/rules";
import { suggestControls } from "@/lib/custom-frameworks/suggest";

// Eigene Rahmenwerke (R4): Kurzname, Slug-Namensraum, CSV, Vorschläge.

const known = (c: string) => CONTROL_BY_CODE.has(c as `CC-${string}-${string}`);

describe("Kurzname und Slug", () => {
	it("kein Klick-Rahmenwerk beginnt mit x-", () => {
		expect(CATALOG_FRAMEWORKS.filter((f) => isCustomSlug(f.slug))).toEqual([]);
	});

	it("Slug x-<key> passt in die Slug-Grenze von 40 Zeichen", () => {
		const key = suggestKey("A".repeat(80));
		expect(validKey(key)).toBe(true);
		expect(customSlug(key).length).toBeLessThanOrEqual(40);
		expect(keyFromSlug(customSlug("kunde-a"))).toBe("kunde-a");
		expect(keyFromSlug("iso27001")).toBeNull();
	});

	it("Kurzname aus dem Namen, Umlaute ausgeschrieben, frei gewählt", () => {
		expect(suggestKey("Anforderungen der Müller AG")).toBe(
			"anforderungen-der-mueller-ag",
		);
		expect(suggestKey("!!!")).toBe("rahmenwerk");
		const taken = new Set(["kunde", "kunde-2"]);
		expect(uniqueKey("kunde", taken)).toBe("kunde-3");
		expect(uniqueKey("neu", taken)).toBe("neu");
		expect(validKey("-x")).toBe(false);
		expect(validKey("Gross")).toBe(false);
	});

	it("natürliche Reihenfolge der Nummern", () => {
		expect(["3.1.10", "3.1.2", "3.1.1"].sort(naturalCompare)).toEqual([
			"3.1.1",
			"3.1.2",
			"3.1.10",
		]);
	});
});

describe("CSV", () => {
	it("deutsche und englische Spalten, Controls und Abdeckung", () => {
		const { items, errors } = mapCsvRows(
			[
				{
					Abschnitt: "A",
					Abschnitt_Titel: "Zugriff",
					Code: "A.1",
					Titel: "Rechte prüfen",
					Text: "Rechte vierteljährlich prüfen.",
					Bereich: "Zugriff",
					Controls: "CC-IAM-05, CC-IAM-01:teilweise",
				},
				{
					section: "B",
					code: "B.1",
					title: "Backups",
					requirement: "Täglich sichern.",
					domain: "continuity",
					controls: "CC-BCM-03",
					coverage: "partial",
				},
			],
			known,
		);
		expect(errors).toEqual([]);
		expect(items).toHaveLength(2);
		expect(items[0]).toMatchObject({
			sectionCode: "A",
			sectionTitle: "Zugriff",
			domain: "access",
			controls: [
				{ code: "CC-IAM-05", coverage: "full" },
				{ code: "CC-IAM-01", coverage: "partial" },
			],
		});
		expect(items[1]?.controls).toEqual([
			{ code: "CC-BCM-03", coverage: "partial" },
		]);
	});

	it("Fehler je Zeile: Code fehlt, doppelt, kein Text, unbekanntes Control", () => {
		const { items, errors } = mapCsvRows(
			[
				{ titel: "ohne Code" },
				{ code: "1", titel: "eins" },
				{ code: "1", titel: "doppelt" },
				{ code: "2" },
				{ code: "3", titel: "drei", controls: "CC-GIBT-ES-NICHT" },
			],
			known,
		);
		expect(errors.map((e) => [e.row, e.error.split(":")[0]])).toEqual([
			[2, "code_missing"],
			[4, "code_duplicate"],
			[5, "text_missing"],
			[6, "control_unknown"],
		]);
		expect(items.map((i) => i.code)).toEqual(["1", "3"]);
		expect(items[1]?.controls).toEqual([]);
	});

	it("Bereich: Klick-Wert, deutsches Wort oder Rückfall", () => {
		expect(parseDomain("Notfall", "governance")).toBe("continuity");
		expect(parseDomain("network", "governance")).toBe("network");
		expect(parseDomain("unbekannt", "risk")).toBe("risk");
		expect(parseControls("cc-iam-05 CC-IAM-05", "", known).controls).toEqual([
			{ code: "CC-IAM-05", coverage: "full" },
		]);
	});
});

describe("Vorschlag passender Maßnahmen", () => {
	it("Zugriffsrechte prüfen findet die Rezertifizierung", () => {
		const s = suggestControls(
			"Zugriffsrechte werden quartalsweise überprüft und nicht benötigte Berechtigungen entzogen.",
			"access",
		);
		expect(s[0]?.code).toBe("CC-IAM-05");
	});

	it("Datensicherung findet Backups und Wiederherstellung", () => {
		const s = suggestControls(
			"Daten werden täglich gesichert und die Wiederherstellung jährlich getestet.",
			"continuity",
		);
		expect(s.map((x) => x.code)).toContain("CC-BCM-03");
	});

	it("leerer Text schlägt nichts vor", () => {
		expect(suggestControls("und oder", "access")).toEqual([]);
	});
});
