import { constants, inflateSync } from "node:zlib";

// Text aus einer PDF-Datei (rein, ohne Abhängigkeit) — läuft nur im
// isolierten Parser-Prozess (lib/parse/run.ts über extract.ts), denn die
// Datei ist fremd. Gelesen werden die üblichen Exporte (Word, LibreOffice,
// Google Docs, Klick selbst): Objekte und Objektströme, Seitenbaum in
// Lesereihenfolge, Schriften mit ToUnicode bzw. WinAnsi/Differences,
// Textoperatoren mit Position. Ausgabe: ein Absatz je Zeile (Zeilen eines
// Absatzes zusammengefügt, Silbentrennung aufgelöst) — so verschiebt ein
// eingefügtes Wort beim Vergleich nicht den Rest des Absatzes.
// Verschlüsselte PDFs → unsupported, ohne Text (Scan) → no_text, Zeichensalat
// (Schrift ohne Zuordnung) → error. Harte Grenzen gegen bösartige Dateien.

export type PdfTextResult =
	| { status: "ok"; text: string; truncated: boolean }
	| { status: "unsupported"; reason: "encrypted" }
	| { status: "no_text" }
	| { status: "error"; reason: string };

export const PDF_LIMITS = {
	maxObjects: 100_000,
	maxStreamBytes: 20 * 1024 * 1024,
	maxInflateTotal: 200 * 1024 * 1024,
	maxChars: 5_000_000,
	maxPages: 5_000,
	maxDepth: 3,
	maxOps: 20_000_000,
};

// ── Werte ────────────────────────────────────────────────────────────────

type Ref = { t: "ref"; n: number };
type Name = { t: "name"; v: string };
type Str = { t: "str"; v: string }; // Bytes als latin1-Zeichen
type Kw = { t: "kw"; v: string };
type Dict = Map<string, Val>;
type Val = number | Ref | Name | Str | Kw | Val[] | Dict | null;
type Stream = { dict: Dict; raw: Buffer };
type Obj = { value: Val; stream: Stream | null };

const isDict = (v: Val | undefined): v is Dict => v instanceof Map;
const isName = (v: Val | undefined): v is Name =>
	typeof v === "object" &&
	v !== null &&
	!Array.isArray(v) &&
	!isDict(v) &&
	v.t === "name";
const isRef = (v: Val | undefined): v is Ref =>
	typeof v === "object" &&
	v !== null &&
	!Array.isArray(v) &&
	!isDict(v) &&
	v.t === "ref";
const isStr = (v: Val | undefined): v is Str =>
	typeof v === "object" &&
	v !== null &&
	!Array.isArray(v) &&
	!isDict(v) &&
	v.t === "str";

const WS = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set("()<>[]{}/%".split("").map((c) => c.charCodeAt(0)));

class Lexer {
	i = 0;
	// Inhalte (Seiten) kennen keine Referenzen „n g R“ — ohne Vorausschau
	// ist das Lesen dort etwa dreimal schneller
	refs = true;
	constructor(readonly s: string) {}
	private code(i = this.i) {
		return this.s.charCodeAt(i);
	}
	skip() {
		const n = this.s.length;
		while (this.i < n) {
			const c = this.code();
			if (WS.has(c)) this.i += 1;
			else if (c === 0x25) {
				while (this.i < n && this.code() !== 0x0a && this.code() !== 0x0d)
					this.i += 1;
			} else break;
		}
	}
	// nächstes Token; Zahlen als number, Schlüsselwörter als Kw
	token(): Val | "<<" | ">>" | "[" | "]" | "{" | "}" | undefined {
		this.skip();
		if (this.i >= this.s.length) return undefined;
		const c = this.s[this.i];
		if (c === "<" && this.s[this.i + 1] === "<") {
			this.i += 2;
			return "<<";
		}
		if (c === ">" && this.s[this.i + 1] === ">") {
			this.i += 2;
			return ">>";
		}
		if (c === "[" || c === "]" || c === "{" || c === "}") {
			this.i += 1;
			return c;
		}
		if (c === "(") return this.literal();
		if (c === "<") return this.hex();
		if (c === "/") return this.name();
		return this.word();
	}
	private literal(): Str {
		let depth = 0;
		let out = "";
		this.i += 1;
		const n = this.s.length;
		while (this.i < n) {
			const c = this.s[this.i];
			if (c === "\\") {
				const d = this.s[this.i + 1] ?? "";
				this.i += 2;
				const map: Record<string, string> = {
					n: "\n",
					r: "\r",
					t: "\t",
					b: "\b",
					f: "\f",
					"(": "(",
					")": ")",
					"\\": "\\",
				};
				if (d in map) out += map[d];
				else if (d >= "0" && d <= "7") {
					let oct = d;
					while (
						oct.length < 3 &&
						this.s[this.i] >= "0" &&
						this.s[this.i] <= "7"
					) {
						oct += this.s[this.i];
						this.i += 1;
					}
					out += String.fromCharCode(Number.parseInt(oct, 8) & 0xff);
				} else if (d === "\r") {
					if (this.s[this.i] === "\n") this.i += 1;
				} else if (d !== "\n") out += d;
				continue;
			}
			if (c === "(") depth += 1;
			else if (c === ")") {
				if (depth === 0) {
					this.i += 1;
					break;
				}
				depth -= 1;
			}
			out += c;
			this.i += 1;
		}
		return { t: "str", v: out };
	}
	private hex(): Str {
		const end = this.s.indexOf(">", this.i + 1);
		const stop = end < 0 ? this.s.length : end;
		const digits = this.s.slice(this.i + 1, stop).replace(/[^0-9a-fA-F]/g, "");
		this.i = stop + 1;
		const padded = digits.length % 2 ? `${digits}0` : digits;
		let out = "";
		for (let k = 0; k < padded.length; k += 2)
			out += String.fromCharCode(Number.parseInt(padded.slice(k, k + 2), 16));
		return { t: "str", v: out };
	}
	private name(): Name {
		this.i += 1;
		const start = this.i;
		const n = this.s.length;
		while (this.i < n) {
			const c = this.code();
			if (WS.has(c) || DELIM.has(c)) break;
			this.i += 1;
		}
		const raw = this.s.slice(start, this.i);
		return {
			t: "name",
			v: raw.replace(/#([0-9a-fA-F]{2})/g, (_, h) =>
				String.fromCharCode(Number.parseInt(h, 16)),
			),
		};
	}
	private word(): Val {
		const start = this.i;
		const n = this.s.length;
		while (this.i < n) {
			const c = this.code();
			if (WS.has(c) || DELIM.has(c)) break;
			this.i += 1;
		}
		if (this.i === start) {
			// einzelnes unerwartetes Zeichen (z. B. „)“) überspringen
			this.i += 1;
			return { t: "kw", v: this.s[start] ?? "" };
		}
		const w = this.s.slice(start, this.i);
		if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) return Number(w);
		if (w === "null") return null;
		return { t: "kw", v: w };
	}
	// Wert mit Verschachtelung; „n g R“ wird zur Referenz
	value(depth = 0): Val | undefined {
		const tok = this.token();
		return this.fromToken(tok, depth);
	}
	private fromToken(
		tok: ReturnType<Lexer["token"]>,
		depth: number,
	): Val | undefined {
		if (tok === undefined) return undefined;
		if (depth > 64) return null;
		if (tok === "<<") {
			const d: Dict = new Map();
			for (;;) {
				const k = this.token();
				if (k === ">>" || k === undefined) break;
				if (!isName(k as Val)) continue;
				const v = this.value(depth + 1);
				if (v === undefined) break;
				d.set((k as Name).v, v);
			}
			return d;
		}
		if (tok === "[") {
			const arr: Val[] = [];
			for (;;) {
				const save = this.i;
				const t = this.token();
				if (t === "]" || t === undefined) break;
				if (t === ">>" || t === "}" || t === "{") continue;
				if (typeof t === "number" && this.refs) {
					const ref = this.tryRef(t);
					if (ref) {
						arr.push(ref);
						continue;
					}
				}
				this.i = save;
				const v = this.value(depth + 1);
				if (v === undefined) break;
				arr.push(v);
				if (arr.length > 1_000_000) break;
			}
			return arr;
		}
		if (tok === ">>" || tok === "]" || tok === "{" || tok === "}")
			return { t: "kw", v: tok };
		if (typeof tok === "number")
			return this.refs ? (this.tryRef(tok) ?? tok) : tok;
		return tok;
	}
	private tryRef(first: number): Ref | null {
		const save = this.i;
		const second = this.token();
		if (typeof second === "number") {
			const r = this.token();
			if (
				typeof r === "object" &&
				r !== null &&
				!Array.isArray(r) &&
				!isDict(r as Val) &&
				(r as Kw).t === "kw" &&
				(r as Kw).v === "R" &&
				Number.isInteger(first)
			)
				return { t: "ref", n: first };
		}
		this.i = save;
		return null;
	}
}

// ── Streams ──────────────────────────────────────────────────────────────

class Budget {
	inflated = 0;
	ops = 0;
}

function ascii85(s: string): Buffer {
	const out: number[] = [];
	let group: number[] = [];
	const body = s.replace(/\s+/g, "");
	const end = body.indexOf("~>");
	const data = end >= 0 ? body.slice(0, end) : body;
	for (const ch of data) {
		if (ch === "z" && group.length === 0) {
			out.push(0, 0, 0, 0);
			continue;
		}
		const c = ch.charCodeAt(0) - 33;
		if (c < 0 || c > 84) continue;
		group.push(c);
		if (group.length === 5) {
			let v = 0;
			for (const g of group) v = v * 85 + g;
			out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
			group = [];
		}
	}
	if (group.length > 1) {
		const n = group.length;
		while (group.length < 5) group.push(84);
		let v = 0;
		for (const g of group) v = v * 85 + g;
		const bytes = [
			(v >>> 24) & 255,
			(v >>> 16) & 255,
			(v >>> 8) & 255,
			v & 255,
		];
		out.push(...bytes.slice(0, n - 1));
	}
	return Buffer.from(out);
}

function decodeStream(st: Stream, budget: Budget): Buffer | null {
	const f = st.dict.get("Filter");
	const filters = (Array.isArray(f) ? f : f ? [f] : []).filter(isName);
	let data = st.raw;
	for (const flt of filters) {
		if (flt.v === "FlateDecode" || flt.v === "Fl") {
			const left = PDF_LIMITS.maxInflateTotal - budget.inflated;
			if (left <= 0) return null;
			try {
				data = inflateSync(data, {
					maxOutputLength: Math.min(PDF_LIMITS.maxStreamBytes, left),
					finishFlush: constants.Z_SYNC_FLUSH,
				});
			} catch {
				return null;
			}
			budget.inflated += data.length;
		} else if (flt.v === "ASCIIHexDecode" || flt.v === "AHx") {
			const hex = data.toString("latin1").replace(/[^0-9a-fA-F]/g, "");
			data = Buffer.from(hex.length % 2 ? `${hex}0` : hex, "hex");
		} else if (flt.v === "ASCII85Decode" || flt.v === "A85") {
			data = ascii85(data.toString("latin1"));
		} else return null; // LZW, Bilder-Filter: nicht für Text
	}
	return data;
}

// ── Datei lesen ──────────────────────────────────────────────────────────

class Doc {
	objects = new Map<number, Obj>();
	trailers: Dict[] = [];
	budget = new Budget();
	constructor(readonly buf: Buffer) {}

	load(): "ok" | "too_many" {
		const s = this.buf.toString("latin1");
		const re = /(\d+)\s+\d+\s+obj\b/g;
		let m = re.exec(s);
		while (m) {
			if (this.objects.size >= PDF_LIMITS.maxObjects) return "too_many";
			const lx = new Lexer(s);
			lx.i = m.index + m[0].length;
			const value = lx.value() ?? null;
			let stream: Stream | null = null;
			lx.skip();
			if (isDict(value) && s.startsWith("stream", lx.i)) {
				let start = lx.i + 6;
				if (s[start] === "\r") start += 1;
				if (s[start] === "\n") start += 1;
				const len = value.get("Length");
				let end = -1;
				if (typeof len === "number" && len >= 0) {
					const after = s.slice(start + len, start + len + 32);
					if (/^\s*endstream/.test(after)) end = start + len;
				}
				if (end < 0) {
					const e = s.indexOf("endstream", start);
					end = e < 0 ? s.length : e;
					while (end > start && (s[end - 1] === "\n" || s[end - 1] === "\r"))
						end -= 1;
				}
				stream = {
					dict: value,
					raw: this.buf.subarray(
						start,
						Math.min(end, start + PDF_LIMITS.maxStreamBytes),
					),
				};
				re.lastIndex = Math.max(re.lastIndex, end);
			} else re.lastIndex = Math.max(re.lastIndex, lx.i);
			this.objects.set(Number(m[1]), { value, stream });
			m = re.exec(s);
		}
		// klassische Trailer
		let t = s.indexOf("trailer");
		while (t >= 0) {
			const lx = new Lexer(s);
			lx.i = t + 7;
			const d = lx.value();
			if (isDict(d)) this.trailers.push(d);
			t = s.indexOf("trailer", t + 7);
		}
		// Objektströme (komprimierte Objekte, z. B. Word)
		for (const [, o] of [...this.objects]) {
			if (!o.stream || !isName(o.stream.dict.get("Type"))) continue;
			const type = (o.stream.dict.get("Type") as Name).v;
			if (type === "XRef") this.trailers.push(o.stream.dict);
			if (type !== "ObjStm") continue;
			const data = decodeStream(o.stream, this.budget);
			if (!data) continue;
			const text = data.toString("latin1");
			const n = o.stream.dict.get("N");
			const first = o.stream.dict.get("First");
			if (typeof n !== "number" || typeof first !== "number") continue;
			const head = new Lexer(text.slice(0, first));
			const pairs: [number, number][] = [];
			for (let k = 0; k < n && k < 100_000; k += 1) {
				const num = head.value();
				const off = head.value();
				if (typeof num !== "number" || typeof off !== "number") break;
				pairs.push([num, off]);
			}
			for (const [num, off] of pairs) {
				if (this.objects.size >= PDF_LIMITS.maxObjects) return "too_many";
				if (this.objects.has(num) && this.objects.get(num)?.value !== null)
					continue;
				const lx = new Lexer(text);
				lx.i = first + off;
				this.objects.set(num, { value: lx.value() ?? null, stream: null });
			}
		}
		return "ok";
	}

	resolve(v: Val | undefined, depth = 0): Val | undefined {
		let cur = v;
		let d = depth;
		while (isRef(cur) && d < 16) {
			cur = this.objects.get(cur.n)?.value ?? null;
			d += 1;
		}
		return cur;
	}

	streamOf(v: Val | undefined): Stream | null {
		if (isRef(v)) return this.objects.get(v.n)?.stream ?? null;
		return null;
	}

	encrypted(): boolean {
		return this.trailers.some((t) => t.has("Encrypt"));
	}

	root(): Dict | null {
		for (const t of [...this.trailers].reverse()) {
			const r = this.resolve(t.get("Root"));
			if (isDict(r)) return r;
		}
		for (const [, o] of this.objects) {
			const v = o.value;
			if (
				isDict(v) &&
				isName(v.get("Type")) &&
				(v.get("Type") as Name).v === "Catalog"
			)
				return v;
		}
		return null;
	}

	// Seiten in Lesereihenfolge mit geerbten Ressourcen
	pages(): { page: Dict; resources: Dict | null }[] {
		const root = this.root();
		const out: { page: Dict; resources: Dict | null }[] = [];
		const seen = new Set<Dict>();
		const walk = (
			node: Val | undefined,
			inherited: Dict | null,
			depth: number,
		) => {
			const n = this.resolve(node);
			if (!isDict(n) || seen.has(n) || depth > 64) return;
			if (out.length >= PDF_LIMITS.maxPages) return;
			seen.add(n);
			const res = this.resolve(n.get("Resources"));
			const resources = isDict(res) ? res : inherited;
			const kids = this.resolve(n.get("Kids"));
			if (Array.isArray(kids)) {
				for (const k of kids) walk(k, resources, depth + 1);
				return;
			}
			const type = n.get("Type");
			if (!isName(type) || type.v === "Page" || n.has("Contents"))
				out.push({ page: n, resources });
		};
		if (root) walk(root.get("Pages"), null, 0);
		return out;
	}
}

// ── Schriften ────────────────────────────────────────────────────────────

// Glyphennamen (Adobe Glyph List, Auszug) für /Differences
const ASCII_NAMES =
	"space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore grave a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde";
const LATIN1_NAMES =
	"nbspace exclamdown cent sterling currency yen brokenbar section dieresis copyright ordfeminine guillemotleft logicalnot sfthyphen registered macron degree plusminus twosuperior threesuperior acute mu paragraph periodcentered cedilla onesuperior ordmasculine guillemotright onequarter onehalf threequarters questiondown Agrave Aacute Acircumflex Atilde Adieresis Aring AE Ccedilla Egrave Eacute Ecircumflex Edieresis Igrave Iacute Icircumflex Idieresis Eth Ntilde Ograve Oacute Ocircumflex Otilde Odieresis multiply Oslash Ugrave Uacute Ucircumflex Udieresis Yacute Thorn germandbls agrave aacute acircumflex atilde adieresis aring ae ccedilla egrave eacute ecircumflex edieresis igrave iacute icircumflex idieresis eth ntilde ograve oacute ocircumflex otilde odieresis divide oslash ugrave uacute ucircumflex udieresis yacute thorn ydieresis";
const EXTRA_NAMES: Record<string, string> = {
	Euro: "€",
	quotesinglbase: "‚",
	florin: "ƒ",
	quotedblbase: "„",
	ellipsis: "…",
	dagger: "†",
	daggerdbl: "‡",
	circumflex: "ˆ",
	perthousand: "‰",
	Scaron: "Š",
	guilsinglleft: "‹",
	OE: "Œ",
	Zcaron: "Ž",
	quoteleft: "‘",
	quoteright: "’",
	quotedblleft: "“",
	quotedblright: "”",
	bullet: "•",
	endash: "–",
	emdash: "—",
	tilde: "˜",
	trademark: "™",
	scaron: "š",
	guilsinglright: "›",
	oe: "œ",
	zcaron: "ž",
	Ydieresis: "Ÿ",
	fi: "fi",
	fl: "fl",
	ff: "ff",
	ffi: "ffi",
	ffl: "ffl",
	minus: "−",
	space: " ",
	nbspace: " ",
	sfthyphen: "",
};
const GLYPHS: Map<string, string> = (() => {
	const m = new Map<string, string>();
	for (const [i, n] of ASCII_NAMES.split(" ").entries())
		m.set(n, String.fromCharCode(0x20 + i));
	for (const [i, n] of LATIN1_NAMES.split(" ").entries())
		m.set(n, String.fromCharCode(0xa0 + i));
	for (const [k, v] of Object.entries(EXTRA_NAMES)) m.set(k, v);
	return m;
})();

function glyphToText(name: string): string | null {
	const g = GLYPHS.get(name);
	if (g !== undefined) return g;
	const uni =
		/^uni([0-9A-Fa-f]{4,6})$/.exec(name) ?? /^u([0-9A-Fa-f]{4,6})$/.exec(name);
	if (uni) return String.fromCodePoint(Number.parseInt(uni[1] ?? "0", 16));
	const base = name.split(".")[0] ?? "";
	return base !== name ? glyphToText(base) : null;
}

// WinAnsi 0x80–0x9F (Rest Latin-1)
const WIN_ANSI_HIGH =
	"€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ";

function winAnsi(code: number): string {
	if (code >= 0x80 && code <= 0x9f) return WIN_ANSI_HIGH[code - 0x80] ?? "";
	return String.fromCharCode(code);
}

type Font = {
	bytes: 1 | 2;
	decode: (code: number) => string | null;
	width: (code: number) => number; // 1/1000 em
};

function parseCmap(text: string): { map: Map<number, string>; bytes: 1 | 2 } {
	const map = new Map<number, string>();
	let bytes: 1 | 2 = 1;
	const hexToStr = (h: string) => {
		let s = "";
		for (let k = 0; k + 4 <= h.length; k += 4)
			s += String.fromCharCode(Number.parseInt(h.slice(k, k + 4), 16));
		if (h.length % 4 === 2)
			s += String.fromCharCode(Number.parseInt(h.slice(-2), 16));
		return s;
	};
	const cs = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(text);
	if (cs) {
		const first = /<([0-9a-fA-F]+)>/.exec(cs[1] ?? "");
		if (first && (first[1]?.length ?? 0) >= 4) bytes = 2;
	}
	for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
		for (const m of (block[1] ?? "").matchAll(
			/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g,
		)) {
			if ((m[1]?.length ?? 0) >= 4) bytes = 2;
			map.set(Number.parseInt(m[1] ?? "0", 16), hexToStr(m[2] ?? ""));
			if (map.size > 200_000) return { map, bytes };
		}
	}
	for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
		const body = block[1] ?? "";
		const re =
			/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]*)>|\[([^\]]*)\])/g;
		for (const m of body.matchAll(re)) {
			const lo = Number.parseInt(m[1] ?? "0", 16);
			const hi = Number.parseInt(m[2] ?? "0", 16);
			if ((m[1]?.length ?? 0) >= 4) bytes = 2;
			if (hi < lo || hi - lo > 65_535) continue;
			if (m[3] !== undefined) {
				const base = hexToStr(m[3]);
				const last = base.charCodeAt(base.length - 1);
				for (let c = lo; c <= hi; c += 1)
					map.set(c, base.slice(0, -1) + String.fromCharCode(last + (c - lo)));
			} else {
				const items = [...(m[4] ?? "").matchAll(/<([0-9a-fA-F]*)>/g)];
				items.forEach((it, k) => {
					if (lo + k <= hi) map.set(lo + k, hexToStr(it[1] ?? ""));
				});
			}
			if (map.size > 200_000) return { map, bytes };
		}
	}
	return { map, bytes };
}

function loadFont(doc: Doc, ref: Val | undefined): Font {
	const f = doc.resolve(ref);
	const fallback: Font = {
		bytes: 1,
		decode: (c) => winAnsi(c),
		width: () => 500,
	};
	if (!isDict(f)) return fallback;
	const subtype = isName(f.get("Subtype")) ? (f.get("Subtype") as Name).v : "";
	const composite = subtype === "Type0";
	let cmap: Map<number, string> | null = null;
	const bytes: 1 | 2 = composite ? 2 : 1;
	const tu = doc.streamOf(f.get("ToUnicode"));
	if (tu) {
		const data = decodeStream(tu, doc.budget);
		if (data) {
			const parsed = parseCmap(data.toString("latin1"));
			cmap = parsed.map;
		}
	}
	// Breiten
	let width: (c: number) => number = () => 500;
	if (composite) {
		const desc = doc.resolve(f.get("DescendantFonts"));
		const d0 = Array.isArray(desc) ? doc.resolve(desc[0]) : null;
		if (isDict(d0)) {
			const dw = d0.get("DW");
			const def = typeof dw === "number" ? dw : 1000;
			const w = doc.resolve(d0.get("W"));
			const widths = new Map<number, number>();
			if (Array.isArray(w)) {
				for (let k = 0; k < w.length && widths.size < 100_000; ) {
					const a = w[k];
					const b = doc.resolve(w[k + 1]);
					if (typeof a !== "number") break;
					if (Array.isArray(b)) {
						b.forEach((x, j) => {
							if (typeof x === "number") widths.set(a + j, x);
						});
						k += 2;
					} else if (typeof b === "number" && typeof w[k + 2] === "number") {
						for (let c = a; c <= b && c - a < 65_536; c += 1)
							widths.set(c, w[k + 2] as number);
						k += 3;
					} else break;
				}
			}
			width = (c) => widths.get(c) ?? def;
		}
	} else {
		const first = f.get("FirstChar");
		const ws = doc.resolve(f.get("Widths"));
		if (typeof first === "number" && Array.isArray(ws))
			width = (c) => {
				const v = ws[c - first];
				return typeof v === "number" ? v : 500;
			};
	}
	// einfache Schriften: Encoding mit Differences
	let simple: (c: number) => string | null = (c) => winAnsi(c);
	if (!composite) {
		const enc = doc.resolve(f.get("Encoding"));
		if (isDict(enc)) {
			const diff = doc.resolve(enc.get("Differences"));
			const table = new Map<number, string>();
			if (Array.isArray(diff)) {
				let code = 0;
				for (const d of diff) {
					if (typeof d === "number") code = d;
					else if (isName(d)) {
						const g = glyphToText(d.v);
						if (g !== null) table.set(code, g);
						code += 1;
					}
				}
			}
			simple = (c) => table.get(c) ?? winAnsi(c);
		}
	}
	return {
		bytes,
		decode: (c) => {
			if (cmap) {
				const v = cmap.get(c);
				if (v !== undefined) return v;
				return composite ? null : simple(c);
			}
			return composite ? null : simple(c);
		},
		width,
	};
}

// ── Inhalte lesen ────────────────────────────────────────────────────────

type M = [number, number, number, number, number, number];
const ID: M = [1, 0, 0, 1, 0, 0];
const mul = (a: M, b: M): M => [
	a[0] * b[0] + a[1] * b[2],
	a[0] * b[1] + a[1] * b[3],
	a[2] * b[0] + a[3] * b[2],
	a[2] * b[1] + a[3] * b[3],
	a[4] * b[0] + a[5] * b[2] + b[4],
	a[4] * b[1] + a[5] * b[3] + b[5],
];

type Run = { x: number; y: number; end: number; size: number; text: string };

class Reader {
	runs: Run[] = [];
	shown = 0;
	mapped = 0;
	chars = 0;
	truncated = false;
	private fonts = new Map<Val, Font>();
	constructor(private readonly doc: Doc) {}

	private font(resources: Dict | null, name: string): Font {
		const fd = resources ? this.doc.resolve(resources.get("Font")) : null;
		const ref = isDict(fd) ? fd.get(name) : undefined;
		const key = ref ?? `missing:${name}`;
		let f = this.fonts.get(key as Val);
		if (!f) {
			f = loadFont(this.doc, ref);
			this.fonts.set(key as Val, f);
		}
		return f;
	}

	content(data: Buffer, resources: Dict | null, base: M, depth: number) {
		const lx = new Lexer(data.toString("latin1"));
		lx.refs = false;
		const ops: Val[] = [];
		let ctm: M = base;
		const stack: M[] = [];
		let tm: M = ID;
		let lm: M = ID;
		let font: Font | null = null;
		let size = 12;
		let leading = 0;
		let hscale = 1;
		let charSpace = 0;
		let wordSpace = 0;
		const show = (s: string) => {
			if (!font || this.truncated) return;
			const m = mul(tm, ctm);
			const scale = Math.hypot(m[2], m[3]) || 1;
			const eff = size * scale;
			let text = "";
			let adv = 0;
			const step = font.bytes;
			for (let k = 0; k + step <= s.length; k += step) {
				const code =
					step === 2
						? (s.charCodeAt(k) << 8) | s.charCodeAt(k + 1)
						: s.charCodeAt(k);
				const ch = font.decode(code);
				this.shown += 1;
				if (ch !== null) {
					this.mapped += 1;
					text += ch;
				}
				adv +=
					((font.width(code) / 1000) * size +
						charSpace +
						(code === 32 && step === 1 ? wordSpace : 0)) *
					hscale;
			}
			const x = m[4];
			const y = m[5];
			tm = mul([1, 0, 0, 1, adv, 0], tm);
			const end = mul(tm, ctm)[4];
			this.push({ x, y, end, size: eff, text });
		};
		for (;;) {
			const tok = lx.value();
			if (tok === undefined) break;
			if (++this.doc.budget.ops > PDF_LIMITS.maxOps) {
				this.truncated = true;
				break;
			}
			const op =
				typeof tok === "object" &&
				tok !== null &&
				!Array.isArray(tok) &&
				!isDict(tok) &&
				tok.t === "kw"
					? tok.v
					: null;
			if (op === null) {
				ops.push(tok);
				if (ops.length > 64) ops.shift();
				continue;
			}
			const n = (k: number) => {
				const v = ops[ops.length - k];
				return typeof v === "number" ? v : 0;
			};
			switch (op) {
				case "q":
					if (stack.length < 64) stack.push(ctm);
					break;
				case "Q":
					ctm = stack.pop() ?? base;
					break;
				case "cm":
					ctm = mul([n(6), n(5), n(4), n(3), n(2), n(1)], ctm);
					break;
				case "BT":
					tm = ID;
					lm = ID;
					break;
				case "Tf": {
					const nm = ops[ops.length - 2];
					font = isName(nm) ? this.font(resources, nm.v) : null;
					size = n(1);
					break;
				}
				case "Tz":
					hscale = n(1) / 100;
					break;
				case "Tc":
					charSpace = n(1);
					break;
				case "Tw":
					wordSpace = n(1);
					break;
				case "TL":
					leading = n(1);
					break;
				case "Td":
					lm = mul([1, 0, 0, 1, n(2), n(1)], lm);
					tm = lm;
					break;
				case "TD":
					leading = -n(1);
					lm = mul([1, 0, 0, 1, n(2), n(1)], lm);
					tm = lm;
					break;
				case "Tm":
					lm = [n(6), n(5), n(4), n(3), n(2), n(1)];
					tm = lm;
					break;
				case "T*":
					lm = mul([1, 0, 0, 1, 0, -leading], lm);
					tm = lm;
					break;
				case "Tj": {
					const s = ops[ops.length - 1];
					if (isStr(s)) show(s.v);
					break;
				}
				case "'":
				case '"': {
					lm = mul([1, 0, 0, 1, 0, -leading], lm);
					tm = lm;
					const s = ops[ops.length - 1];
					if (isStr(s)) show(s.v);
					break;
				}
				case "TJ": {
					const arr = ops[ops.length - 1];
					if (Array.isArray(arr))
						for (const it of arr) {
							if (isStr(it)) show(it.v);
							else if (typeof it === "number") {
								const dx = (-it / 1000) * size * hscale;
								tm = mul([1, 0, 0, 1, dx, 0], tm);
								if (it < -200 && this.runs.length > 0) {
									const last = this.runs[this.runs.length - 1];
									if (last && !last.text.endsWith(" ")) last.text += " ";
								}
							}
						}
					break;
				}
				case "Do": {
					const nm = ops[ops.length - 1];
					if (isName(nm) && depth < PDF_LIMITS.maxDepth)
						this.xobject(resources, nm.v, ctm, depth);
					break;
				}
				case "BI": {
					// Inline-Bild überspringen: bis „EI“ nach Leerraum
					const s = lx.s;
					let k = s.indexOf("ID", lx.i);
					if (k < 0) {
						lx.i = s.length;
						break;
					}
					k += 2;
					const ei = s.slice(k).search(/\sEI(\s|$)/);
					lx.i = ei < 0 ? s.length : k + ei + 3;
					break;
				}
				default:
					break;
			}
			ops.length = 0;
			if (this.truncated) break;
		}
	}

	private xobject(resources: Dict | null, name: string, ctm: M, depth: number) {
		const xd = resources ? this.doc.resolve(resources.get("XObject")) : null;
		if (!isDict(xd)) return;
		const st = this.doc.streamOf(xd.get(name));
		if (!st) return;
		const sub = st.dict.get("Subtype");
		if (!isName(sub) || sub.v !== "Form") return;
		const data = decodeStream(st, this.doc.budget);
		if (!data) return;
		const res = this.doc.resolve(st.dict.get("Resources"));
		const mx = this.doc.resolve(st.dict.get("Matrix"));
		const matrix: M =
			Array.isArray(mx) &&
			mx.length === 6 &&
			mx.every((v) => typeof v === "number")
				? (mx as M)
				: ID;
		this.content(
			data,
			isDict(res) ? res : resources,
			mul(matrix, ctm),
			depth + 1,
		);
	}

	private push(r: Run) {
		if (r.text.length === 0) return;
		this.chars += r.text.length;
		if (this.chars > PDF_LIMITS.maxChars) {
			this.truncated = true;
			return;
		}
		this.runs.push(r);
	}

	pageBreak() {
		this.runs.push({ x: 0, y: Number.NaN, end: 0, size: 0, text: "" });
	}
}

// Läufe → Zeilen → Absätze (ein Absatz je Zeile)
// Listenpunkt am Zeilenanfang (Aufzählungszeichen, „1.“, „a)“) beginnt
// einen eigenen Absatz
const BULLET = /^(?:[•◦▪▫■□●○·‣⁃–*-]\s|(?:\d{1,3}|[a-zA-Z])[.)]\s)/u;

export function assembleRuns(runs: readonly Run[]): string {
	// tab: Zeile mit großen Abständen zwischen Läufen (Tabellenzeile) — wird
	// nie mit Nachbarn zusammengefügt, Zellen getrennt durch „ | “
	type Line = { y: number; size: number; text: string; tab: boolean };
	const lines: Line[] = [];
	let cur: (Line & { end: number }) | null = null;
	for (const r of runs) {
		if (Number.isNaN(r.y)) {
			if (cur) lines.push(cur);
			cur = null;
			lines.push({ y: Number.NaN, size: 0, text: "", tab: false });
			continue;
		}
		if (
			cur &&
			Math.abs(r.y - cur.y) <=
				Math.max(1, 0.5 * Math.min(r.size, cur.size || r.size))
		) {
			const gap = r.x - cur.end;
			if (gap > 2 * r.size && cur.text.trim() && r.text.trim()) {
				cur.text = `${cur.text.trimEnd()} | ${r.text.trimStart()}`;
				cur.tab = true;
			} else {
				if (
					gap > 0.2 * r.size &&
					!cur.text.endsWith(" ") &&
					!r.text.startsWith(" ")
				)
					cur.text += " ";
				cur.text += r.text;
			}
			cur.end = r.end;
			cur.size = Math.max(cur.size, r.size);
			continue;
		}
		if (cur) lines.push(cur);
		cur = { y: r.y, size: r.size, text: r.text, end: r.end, tab: false };
	}
	if (cur) lines.push(cur);

	const paras: string[] = [];
	let para = "";
	let prev: Line | null = null;
	const flush = () => {
		const t = para.replace(/\s+/g, " ").trim();
		if (t) paras.push(t);
		para = "";
	};
	for (const l of lines) {
		if (Number.isNaN(l.y)) {
			flush();
			prev = null;
			continue;
		}
		const text = l.text.replace(/\s+/g, " ").trim();
		if (!text) continue;
		if (prev) {
			const gap = prev.y - l.y;
			const lh = Math.max(prev.size, l.size) * 1.2;
			const sizeJump =
				Math.abs(prev.size - l.size) > 0.1 * Math.max(prev.size, l.size);
			if (
				gap <= 0 ||
				gap > 1.5 * lh ||
				sizeJump ||
				l.tab ||
				prev.tab ||
				BULLET.test(text)
			)
				flush();
		}
		if (para) {
			const hy = /(\p{L})-$/u.exec(para);
			if (hy && /^\p{Ll}/u.test(text)) para = para.slice(0, -1) + text;
			else if (hy) para += text;
			else para += ` ${text}`;
		} else para = text;
		prev = l;
	}
	flush();
	return paras.join("\n");
}

export function pdfText(bytes: Uint8Array): PdfTextResult {
	const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (!buf.subarray(0, 1024).toString("latin1").includes("%PDF-"))
		return { status: "error", reason: "not_pdf" };
	const doc = new Doc(buf);
	try {
		if (doc.load() === "too_many")
			return { status: "error", reason: "too_many_objects" };
		if (doc.encrypted()) return { status: "unsupported", reason: "encrypted" };
		const pages = doc.pages();
		if (pages.length === 0) return { status: "error", reason: "no_pages" };
		const reader = new Reader(doc);
		for (const { page, resources } of pages) {
			const contents = page.get("Contents");
			const list = Array.isArray(doc.resolve(contents))
				? (doc.resolve(contents) as Val[])
				: [contents];
			const parts: Buffer[] = [];
			for (const c of list) {
				const st = doc.streamOf(c);
				const data = st ? decodeStream(st, doc.budget) : null;
				if (data) parts.push(data, Buffer.from("\n"));
			}
			if (parts.length > 0)
				reader.content(Buffer.concat(parts), resources, ID, 0);
			reader.pageBreak();
			if (reader.truncated) break;
		}
		if (reader.shown === 0) return { status: "no_text" };
		// Schrift ohne Zuordnung (Zeichensalat) ehrlich melden
		if (reader.mapped / reader.shown < 0.8)
			return { status: "error", reason: "unreadable" };
		const text = assembleRuns(reader.runs);
		if (!text.trim()) return { status: "no_text" };
		return {
			status: "ok",
			text: text.slice(0, PDF_LIMITS.maxChars),
			truncated: reader.truncated || text.length > PDF_LIMITS.maxChars,
		};
	} catch {
		return { status: "error", reason: "parse_failed" };
	}
}
