import {
	appendFileSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	canonicalJson,
	chainHash,
	GENESIS,
	Journal,
	JournalError,
	parseJournal,
} from "@/signer/journal";

// Journal des Signers: Hash-Kette, nur anhängend, abgerissene letzte Zeile
// wird gekürzt, jeder andere Bruch verhindert den Start.

const tmp = () => join(mkdtempSync(join(tmpdir(), "klick-journal-")), "j.log");

function filled(path: string, n = 3) {
	const { journal } = Journal.open(path);
	for (let i = 0; i < n; i += 1)
		journal.append({ type: "unfreeze", at: 1_800_000_000 + i });
	journal.close();
}

const code = (fn: () => unknown) => {
	try {
		fn();
	} catch (e) {
		if (e instanceof JournalError) return `${e.code}@${e.line}`;
		throw e;
	}
	return "ok";
};

describe("kanonisches JSON", () => {
	it("sortiert Schlüssel, lässt undefined weg, nur ganze Zahlen", () => {
		expect(canonicalJson({ b: 1, a: [true, null, "x"], c: undefined })).toBe(
			'{"a":[true,null,"x"],"b":1}',
		);
		expect(() => canonicalJson({ x: 1.5 })).toThrow();
		expect(() => canonicalJson({ x: 10n })).toThrow();
	});
});

describe("Journal", () => {
	it("Kette: jede Zeile hängt am Kopf davor", () => {
		const path = tmp();
		filled(path);
		const parsed = parseJournal(readFileSync(path, "utf8"));
		expect(parsed.seq).toBe(3);
		const [first] = parsed.entries;
		expect(first?.head).toBe(chainHash(GENESIS, canonicalJson(first?.event)));
		const { journal, entries } = Journal.open(path);
		expect(entries.map((e) => e.seq)).toEqual([1, 2, 3]);
		expect(journal.head).toBe(parsed.head);
		const next = journal.append({ type: "unfreeze", at: 1_800_000_010 });
		expect(next.seq).toBe(4);
		journal.close();
	});

	it("abgerissene letzte Zeile wird gekürzt, der Rest bleibt", () => {
		const path = tmp();
		filled(path);
		const before = readFileSync(path, "utf8");
		appendFileSync(path, '9f3c\t{"seq":4,"ty');
		const { journal, entries } = Journal.open(path);
		expect(entries).toHaveLength(3);
		journal.close();
		expect(readFileSync(path, "utf8")).toBe(before);
	});

	it("geänderte Zeile in der Mitte verhindert den Start", () => {
		const path = tmp();
		filled(path);
		const lines = readFileSync(path, "utf8").split("\n");
		lines[1] = (lines[1] as string).replace(
			'"at":1800000001',
			'"at":1800000099',
		);
		writeFileSync(path, lines.join("\n"));
		expect(code(() => Journal.open(path))).toBe("hash@2");
	});

	it("vertauschte Zeilen oder fehlende Zeile verhindern den Start", () => {
		const path = tmp();
		filled(path);
		const lines = readFileSync(path, "utf8").split("\n");
		writeFileSync(path, [lines[0], lines[2], lines[1], ""].join("\n"));
		expect(code(() => Journal.open(path))).toBe("hash@2");
		writeFileSync(path, [lines[0], lines[2], ""].join("\n"));
		expect(code(() => Journal.open(path))).toBe("hash@2");
	});

	it("nachgerechneter Hash mit falscher Nummer: sequence", () => {
		const body = canonicalJson({ type: "unfreeze", at: 1, seq: 5 });
		const text = `${chainHash(GENESIS, body)}\t${body}\n`;
		expect(code(() => parseJournal(text))).toBe("sequence@1");
	});

	it("nicht kanonischer Inhalt mit passendem Hash: format", () => {
		const body = '{"type":"unfreeze","seq":1,"at":1}';
		const text = `${chainHash(GENESIS, body)}\t${body}\n`;
		expect(code(() => parseJournal(text))).toBe("format@1");
	});
});
