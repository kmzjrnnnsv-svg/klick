import { createHash } from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	ftruncateSync,
	openSync,
	readFileSync,
	writeSync,
} from "node:fs";
import type { SignerEvent } from "./events";

// Journal des Signers: einzige Quelle seines Zustands (wird beim Start
// nachgespielt). Je Zeile `<sha256(vorheriger Kopf ‖ Inhalt)>\t<Inhalt>\n`,
// Inhalt = kanonisches JSON mit fortlaufender Nummer — nur anhängend, jede
// Zeile mit fsync. Eine abgerissene letzte Zeile (Absturz beim Schreiben)
// wird gekürzt; jeder andere Bruch verhindert den Start.

export const GENESIS = "0".repeat(64);
const MAX_LINE = 1024 * 1024;

export class JournalError extends Error {
	constructor(
		readonly code: "hash" | "format" | "sequence" | "size",
		readonly line: number,
	) {
		super(`journal_${code}@${line}`);
	}
}

export type JournalEntry = { seq: number; head: string; event: SignerEvent };

// Kanonisches JSON: Schlüssel sortiert, keine Leerzeichen; nur JSON-Werte
export function canonicalJson(v: unknown): string {
	if (v === null || typeof v === "boolean" || typeof v === "string")
		return JSON.stringify(v);
	if (typeof v === "number") {
		if (!Number.isSafeInteger(v)) throw new TypeError("nur ganze Zahlen");
		return String(v);
	}
	if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
	if (typeof v === "object")
		return `{${Object.keys(v as object)
			.filter((k) => (v as Record<string, unknown>)[k] !== undefined)
			.sort()
			.map(
				(k) =>
					`${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`,
			)
			.join(",")}}`;
	throw new TypeError(`nicht kanonisierbar: ${typeof v}`);
}

export const chainHash = (prev: string, body: string): string =>
	createHash("sha256").update(prev).update(body).digest("hex");

export type ParsedJournal = {
	entries: JournalEntry[];
	head: string;
	seq: number;
	// Bytes, die zu einer abgerissenen letzten Zeile gehören (0 = keine)
	tornBytes: number;
};

// Prüft die ganze Kette (rein)
export function parseJournal(text: string): ParsedJournal {
	const lastNl = text.lastIndexOf("\n");
	const complete = lastNl === -1 ? "" : text.slice(0, lastNl + 1);
	const tornBytes = Buffer.byteLength(text.slice(lastNl + 1), "utf8");
	const lines = complete === "" ? [] : complete.slice(0, -1).split("\n");
	const entries: JournalEntry[] = [];
	let head = GENESIS;
	lines.forEach((line, i) => {
		const n = i + 1;
		if (line.length > MAX_LINE) throw new JournalError("size", n);
		const tab = line.indexOf("\t");
		if (tab !== 64) throw new JournalError("format", n);
		const hash = line.slice(0, 64);
		const body = line.slice(65);
		if (chainHash(head, body) !== hash) throw new JournalError("hash", n);
		let event: SignerEvent;
		try {
			event = JSON.parse(body) as SignerEvent;
		} catch {
			throw new JournalError("format", n);
		}
		if (canonicalJson(event) !== body) throw new JournalError("format", n);
		if (event.seq !== n) throw new JournalError("sequence", n);
		head = hash;
		entries.push({ seq: n, head, event });
	});
	return { entries, head, seq: entries.length, tornBytes };
}

type Draft = SignerEvent extends infer E
	? E extends SignerEvent
		? Omit<E, "seq">
		: never
	: never;

export class Journal {
	private constructor(
		private fd: number,
		private _head: string,
		private _seq: number,
	) {}

	// Öffnen und prüfen; liefert die bisherigen Einträge zum Nachspielen
	static open(path: string): { journal: Journal; entries: JournalEntry[] } {
		const text = existsSync(path) ? readFileSync(path, "utf8") : "";
		const parsed = parseJournal(text);
		const fd = openSync(path, "a+", 0o600);
		if (parsed.tornBytes > 0) {
			ftruncateSync(fd, Buffer.byteLength(text, "utf8") - parsed.tornBytes);
			fsyncSync(fd);
		}
		return {
			journal: new Journal(fd, parsed.head, parsed.seq),
			entries: parsed.entries,
		};
	}

	get head() {
		return this._head;
	}
	get seq() {
		return this._seq;
	}

	// Anhängen + fsync, erst danach gilt der Eintrag
	append(draft: Draft): JournalEntry {
		const event = { ...draft, seq: this._seq + 1 } as SignerEvent;
		const body = canonicalJson(event);
		if (body.length > MAX_LINE) throw new JournalError("size", event.seq);
		const hash = chainHash(this._head, body);
		writeSync(this.fd, `${hash}\t${body}\n`);
		fsyncSync(this.fd);
		this._head = hash;
		this._seq = event.seq;
		return { seq: event.seq, head: hash, event };
	}

	close() {
		closeSync(this.fd);
	}
}
