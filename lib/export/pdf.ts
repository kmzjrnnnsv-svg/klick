import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import type { DocBlock, DocModel } from "./doc-model";
import { BASE_FONT, type PdfFontKey, textWidth, toWinAnsi } from "./pdf-fonts";

// PDF-Writer ohne Abhängigkeit (PDF 1.7): A4, Helvetica mit WinAnsi
// (Umlaute, „“, –, €), Zeilenumbruch nach AFM-Breiten, Tabellen mit
// wiederholtem Kopf über Seitenumbrüche, Kopf- und Fußzeile mit
// „Seite x von y“, Inhalte per Flate komprimiert, Dateianhänge
// (/EmbeddedFiles, z. B. signaturen.json). Kein JavaScript, keine Formulare,
// keine externen Verweise — das PDF ist reines Dokument.

const PAGE = { w: 595.28, h: 841.89 };
const M = { top: 66, bottom: 58, left: 56, right: 56 };
const CONTENT_W = PAGE.w - M.left - M.right;
const FONT_ID: Record<PdfFontKey, string> = {
	regular: "F1",
	bold: "F2",
	italic: "F3",
};

export type PdfAttachment = {
	name: string;
	data: Uint8Array | string;
	mime: string;
	description?: string;
};

const num = (v: number) => String(Math.round(v * 100) / 100);

function pdfString(codes: readonly number[]): string {
	let s = "(";
	for (const c of codes) {
		if (c === 0x28 || c === 0x29 || c === 0x5c)
			s += `\\${String.fromCharCode(c)}`;
		else if (c < 32 || c > 126) s += `\\${c.toString(8).padStart(3, "0")}`;
		else s += String.fromCharCode(c);
	}
	return `${s})`;
}

// Text-String für das Info-Verzeichnis: UTF-16BE mit BOM
function pdfTextString(s: string): string {
	const hex = ["FEFF"];
	for (let i = 0; i < s.length; i += 1)
		hex.push(s.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase());
	return `<${hex.join("")}>`;
}

// Umbruch nach Breite; überlange Wörter werden hart getrennt
export function wrapText(
	text: string,
	font: PdfFontKey,
	size: number,
	maxWidth: number,
): number[][] {
	const lines: number[][] = [];
	const space = toWinAnsi(" ");
	const spaceW = textWidth(space, font, size);
	for (const para of text.split(/\r?\n/)) {
		const words = para.split(/ +/).filter((w) => w.length > 0);
		let line: number[] = [];
		let lineW = 0;
		const flush = () => {
			lines.push(line);
			line = [];
			lineW = 0;
		};
		for (const word of words) {
			let codes = toWinAnsi(word);
			let w = textWidth(codes, font, size);
			if (line.length > 0 && lineW + spaceW + w <= maxWidth) {
				line.push(...space, ...codes);
				lineW += spaceW + w;
				continue;
			}
			if (line.length > 0) flush();
			// Wort länger als die Zeile → in Stücke
			while (w > maxWidth && codes.length > 1) {
				let cut = codes.length - 1;
				while (cut > 1 && textWidth(codes.slice(0, cut), font, size) > maxWidth)
					cut -= 1;
				lines.push(codes.slice(0, cut));
				codes = codes.slice(cut);
				w = textWidth(codes, font, size);
			}
			line = codes;
			lineW = w;
		}
		flush();
	}
	return lines;
}

class Layout {
	pages: string[][] = [];
	ops: string[] = [];
	y = 0;

	constructor() {
		this.newPage();
	}

	newPage() {
		this.ops = [];
		this.pages.push(this.ops);
		this.y = PAGE.h - M.top;
	}

	// Platz für h Punkt sicherstellen; true = neue Seite begonnen
	ensure(h: number): boolean {
		if (this.y - h >= M.bottom) return false;
		this.newPage();
		return true;
	}

	text(
		codes: readonly number[],
		x: number,
		y: number,
		font: PdfFontKey,
		size: number,
		gray = 0,
	) {
		if (codes.length === 0) return;
		this.ops.push(
			`BT /${FONT_ID[font]} ${num(size)} Tf ${num(gray)} g ${num(x)} ${num(y)} Td ${pdfString(codes)} Tj ET`,
		);
	}

	line(x1: number, y1: number, x2: number, y2: number, gray = 0.8, w = 0.5) {
		this.ops.push(
			`${num(gray)} G ${num(w)} w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`,
		);
	}

	fill(x: number, y: number, w: number, h: number, gray: number) {
		this.ops.push(
			`${num(gray)} g ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`,
		);
	}

	stroke(x: number, y: number, w: number, h: number, gray = 0.8) {
		this.ops.push(
			`${num(gray)} G 0.5 w ${num(x)} ${num(y)} ${num(w)} ${num(h)} re S`,
		);
	}

	// Absatz in einer Spalte; gibt die verbrauchte Höhe nicht zurück — y läuft
	paragraph(
		text: string,
		opts: {
			font?: PdfFontKey;
			size?: number;
			gray?: number;
			x?: number;
			width?: number;
			leading?: number;
		} = {},
	) {
		const font = opts.font ?? "regular";
		const size = opts.size ?? 9.5;
		const leading = opts.leading ?? size * 1.42;
		const x = opts.x ?? M.left;
		for (const l of wrapText(text, font, size, opts.width ?? CONTENT_W)) {
			this.ensure(leading);
			this.y -= leading;
			this.text(l, x, this.y + (leading - size) * 0.35, font, size, opts.gray);
		}
	}
}

function titleBlock(lay: Layout, doc: DocModel) {
	lay.paragraph(doc.title, { font: "bold", size: 18, leading: 23 });
	if (doc.subtitle)
		lay.paragraph(doc.subtitle, { size: 10.5, gray: 0.3, leading: 15 });
	lay.y -= 8;
	const rows: [string, string][] = [["Organisation", doc.org], ...doc.meta];
	for (const [k, v] of rows) {
		const lines = wrapText(v, "regular", 8.5, CONTENT_W - 120);
		const h = Math.max(1, lines.length) * 12;
		lay.ensure(h);
		lay.text(toWinAnsi(k), M.left, lay.y - 9, "bold", 8.5, 0.35);
		lines.forEach((l, i) => {
			lay.text(l, M.left + 120, lay.y - 9 - i * 12, "regular", 8.5);
		});
		lay.y -= h;
	}
	lay.y -= 8;
	lay.line(M.left, lay.y, PAGE.w - M.right, lay.y, 0.75, 0.6);
	lay.y -= 6;
}

function table(lay: Layout, b: Extract<DocBlock, { type: "table" }>) {
	if (b.rows.length === 0) {
		lay.paragraph(b.empty ?? "Keine Einträge.", { font: "italic", gray: 0.4 });
		lay.y -= 4;
		return;
	}
	const size = 8.3;
	const leading = 10.8;
	const pad = 3.5;
	// Spaltenbreiten: Gewicht nach Angabe oder Textlänge, dann normalisiert
	const weights = b.columns.map((c, i) => {
		if (c.width) return c.width;
		const lens = [c.label, ...b.rows.map((r) => r[i] ?? "")].map(
			(s) => s.length,
		);
		const avg = lens.reduce((a, x) => a + x, 0) / lens.length;
		return Math.min(42, Math.max(6, avg * 0.7 + Math.max(...lens) * 0.3));
	});
	const total = weights.reduce((a, w) => a + w, 0);
	const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0);
	// Mindestbreite = längstes Wort der Spalte, damit nichts mitten im Wort
	// bricht; Rest nach Gewicht, zu breite Spalten geben zuerst ab
	const mins = b.columns.map((c, i) => {
		const word = (s: string, font: PdfFontKey) =>
			Math.max(
				0,
				...s.split(/\s+/).map((w) => textWidth(toWinAnsi(w), font, size)),
			);
		const longest = Math.max(
			word(c.label, "bold"),
			...b.rows.map((r) => word(r[i] ?? "", "regular")),
		);
		return Math.min(longest + 2 * pad + 1, CONTENT_W * 0.4);
	});
	// passen die Mindestbreiten nicht, werden nur die breitesten gekappt
	// (ein langes Wort bricht, alle anderen Spalten bleiben ganz)
	if (sum(mins) > CONTENT_W) {
		let lo = 0;
		let hi = Math.max(...mins);
		for (let k = 0; k < 40; k += 1) {
			const cap = (lo + hi) / 2;
			if (sum(mins.map((m) => Math.min(m, cap))) > CONTENT_W) hi = cap;
			else lo = cap;
		}
		for (const [i, m] of mins.entries()) mins[i] = Math.min(m, lo);
	}
	let widths = weights.map((w, i) =>
		Math.max((w / total) * CONTENT_W, mins[i] ?? 0),
	);
	const over = sum(widths) - CONTENT_W;
	if (over > 0) {
		const excess = widths.map((w, i) => w - (mins[i] ?? 0));
		const spare = sum(excess);
		widths = widths.map((w, i) =>
			spare > 0 ? w - ((excess[i] ?? 0) * over) / spare : w,
		);
	}
	const xs = widths.map((_, i) =>
		widths.slice(0, i).reduce((a, w) => a + w, M.left),
	);
	const maxRowH = PAGE.h - M.top - M.bottom - 40;
	const cellLines = (cells: string[], font: PdfFontKey) => {
		let lines = cells.map((c, i) =>
			wrapText(c || "—", font, size, (widths[i] ?? 40) - 2 * pad),
		);
		const maxLines = Math.floor((maxRowH - 2 * pad) / leading);
		lines = lines.map((ls) =>
			ls.length > maxLines
				? [...ls.slice(0, maxLines - 1), toWinAnsi("…")]
				: ls,
		);
		return lines;
	};
	const header = cellLines(
		b.columns.map((c) => c.label),
		"bold",
	);
	const headerH = Math.max(...header.map((l) => l.length)) * leading + 2 * pad;
	const drawRow = (lines: number[][][], h: number, head: boolean) => {
		const top = lay.y;
		if (head) lay.fill(M.left, top - h, CONTENT_W, h, 0.93);
		lines.forEach((ls, i) => {
			ls.forEach((l, k) => {
				lay.text(
					l,
					(xs[i] ?? M.left) + pad,
					top - pad - (k + 1) * leading + 2.6,
					head ? "bold" : "regular",
					size,
					head ? 0.15 : 0,
				);
			});
		});
		lay.line(M.left, top - h, PAGE.w - M.right, top - h, 0.82, 0.4);
		lay.y -= h;
	};
	const drawHeader = () => {
		lay.line(M.left, lay.y, PAGE.w - M.right, lay.y, 0.6, 0.6);
		drawRow(header, headerH, true);
	};
	lay.ensure(headerH + 2 * leading + 2 * pad);
	drawHeader();
	for (const r of b.rows) {
		const lines = cellLines(
			b.columns.map((_, i) => r[i] ?? ""),
			"regular",
		);
		const h = Math.max(...lines.map((l) => l.length)) * leading + 2 * pad;
		if (lay.ensure(h)) drawHeader();
		drawRow(lines, h, false);
	}
	lay.y -= 8;
}

function signatures(lay: Layout, b: Extract<DocBlock, { type: "signatures" }>) {
	const gap = 14;
	const boxW = (CONTENT_W - gap) / 2;
	const boxH = 62;
	for (let i = 0; i < b.signers.length; i += 2) {
		lay.ensure(boxH + 8);
		const top = lay.y;
		for (const [k, s] of b.signers.slice(i, i + 2).entries()) {
			const x = M.left + k * (boxW + gap);
			lay.stroke(x, top - boxH, boxW, boxH, 0.7);
			lay.text(toWinAnsi(s.role), x + 8, top - 15, "bold", 8.5, 0.2);
			lay.text(toWinAnsi(s.name ?? ""), x + 8, top - 28, "regular", 9);
			if (s.signedAt) {
				const lines = wrapText(
					`Unterschrieben am ${s.signedAt}${s.method ? ` · ${s.method}` : ""}`,
					"regular",
					7.6,
					boxW - 16,
				).slice(0, 2);
				lines.forEach((l, n) => {
					lay.text(
						l,
						x + 8,
						top - boxH + 9 + (lines.length - 1 - n) * 9.5,
						"regular",
						7.6,
						0.25,
					);
				});
			} else {
				lay.line(x + 8, top - boxH + 18, x + boxW - 8, top - boxH + 18, 0.5);
				lay.text(
					toWinAnsi("Datum, Unterschrift"),
					x + 8,
					top - boxH + 8,
					"regular",
					7,
					0.45,
				);
			}
		}
		lay.y -= boxH + 8;
	}
	lay.y -= 4;
}

function block(lay: Layout, b: DocBlock) {
	switch (b.type) {
		case "heading": {
			const size = b.level === 1 ? 13.5 : b.level === 2 ? 11.2 : 10;
			// Überschrift nicht allein am Seitenende
			lay.ensure(size * 1.4 + (b.level === 1 ? 14 : 8) + 36);
			lay.y -= b.level === 1 ? 12 : 7;
			lay.paragraph(b.text, { font: "bold", size, leading: size * 1.35 });
			lay.y -= 3;
			return;
		}
		case "paragraph":
			lay.paragraph(b.text, {
				gray: b.muted ? 0.4 : 0,
				font: b.muted ? "italic" : "regular",
			});
			lay.y -= 5;
			return;
		case "list":
			for (const item of b.items) {
				const lines = wrapText(item, "regular", 9.5, CONTENT_W - 14);
				lines.forEach((l, i) => {
					lay.ensure(13.5);
					lay.y -= 13.5;
					if (i === 0)
						lay.text(toWinAnsi("•"), M.left + 2, lay.y + 2.8, "regular", 9.5);
					lay.text(l, M.left + 14, lay.y + 2.8, "regular", 9.5);
				});
			}
			lay.y -= 5;
			return;
		case "keyValue":
			for (const [k, v] of b.items) {
				const ks = wrapText(k, "bold", 9, 140);
				const vs = wrapText(v || "—", "regular", 9, CONTENT_W - 156);
				const h = Math.max(ks.length, vs.length) * 12.6 + 2;
				lay.ensure(h);
				ks.forEach((l, i) => {
					lay.text(l, M.left, lay.y - 10 - i * 12.6, "bold", 9, 0.2);
				});
				vs.forEach((l, i) => {
					lay.text(l, M.left + 156, lay.y - 10 - i * 12.6, "regular", 9);
				});
				lay.y -= h;
			}
			lay.y -= 5;
			return;
		case "table":
			table(lay, b);
			return;
		case "signatures":
			signatures(lay, b);
			return;
	}
}

function pdfDate(d: Date): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

export function renderPdf(
	doc: DocModel,
	opts: { now?: Date; attachments?: readonly PdfAttachment[] } = {},
): Uint8Array {
	const now = opts.now ?? new Date();
	const lay = new Layout();
	titleBlock(lay, doc);
	for (const b of doc.blocks) block(lay, b);

	// Kopf (ab Seite 2) und Fuß je Seite, jetzt mit Seitenzahl
	const total = lay.pages.length;
	const headLine = toWinAnsi(`${doc.org} · ${doc.title}`);
	lay.pages.forEach((ops, i) => {
		if (i > 0) {
			ops.push(
				`BT /F1 7.5 Tf 0.45 g ${num(M.left)} ${num(PAGE.h - 38)} Td ${pdfString(headLine.slice(0, 120))} Tj ET`,
				`0.85 G 0.4 w ${num(M.left)} ${num(PAGE.h - 44)} m ${num(PAGE.w - M.right)} ${num(PAGE.h - 44)} l S`,
			);
		}
		const pageNo = toWinAnsi(`Seite ${i + 1} von ${total}`);
		const footer = toWinAnsi(doc.footer ?? "");
		ops.push(
			`0.85 G 0.4 w ${num(M.left)} 44 m ${num(PAGE.w - M.right)} 44 l S`,
			`BT /F1 7 Tf 0.45 g ${num(M.left)} 32 Td ${pdfString(footer.slice(0, 140))} Tj ET`,
			`BT /F1 7 Tf 0.45 g ${num(PAGE.w - M.right - textWidth(pageNo, "regular", 7))} 32 Td ${pdfString(pageNo)} Tj ET`,
		);
	});

	// Objekte: 1 Katalog, 2 Seiten, 3–5 Schriften, 6 Info, dann Seiten,
	// Inhalte, Anhänge
	const objects: (string | Uint8Array)[] = [];
	const add = (o: string | Uint8Array) => {
		objects.push(o);
		return objects.length;
	};
	const stream = (dict: string, data: Uint8Array): Uint8Array => {
		const head = Buffer.from(
			`<< ${dict} /Length ${data.length} /Filter /FlateDecode >>\nstream\n`,
			"latin1",
		);
		return Buffer.concat([head, data, Buffer.from("\nendstream", "latin1")]);
	};
	add(""); // Katalog, unten gesetzt
	add(""); // Seitenbaum, unten gesetzt
	const fontRefs = (["regular", "bold", "italic"] as const).map((k) =>
		add(
			`<< /Type /Font /Subtype /Type1 /BaseFont /${BASE_FONT[k]} /Encoding /WinAnsiEncoding >>`,
		),
	);
	const info = add(
		`<< /Title ${pdfTextString(doc.title)} /Author ${pdfTextString(doc.org)} /Producer (Klick) /Creator (Klick) /CreationDate (${pdfDate(now)}) /ModDate (${pdfDate(now)}) >>`,
	);
	const resources = `<< /Font << /F1 ${fontRefs[0]} 0 R /F2 ${fontRefs[1]} 0 R /F3 ${fontRefs[2]} 0 R >> >>`;
	const pageRefs: number[] = [];
	for (const ops of lay.pages) {
		const content = add(
			stream("", deflateSync(Buffer.from(ops.join("\n"), "latin1"))),
		);
		pageRefs.push(
			add(
				`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE.w)} ${num(PAGE.h)}] /Resources ${resources} /Contents ${content} 0 R >>`,
			),
		);
	}
	const files: { name: string; ref: number }[] = [];
	for (const a of opts.attachments ?? []) {
		const raw =
			typeof a.data === "string"
				? Buffer.from(a.data, "utf8")
				: Buffer.from(a.data);
		const md5 = createHash("md5").update(raw).digest("hex");
		const ef = add(
			stream(
				`/Type /EmbeddedFile /Subtype /${a.mime.replace("/", "#2F")} /Params << /Size ${raw.length} /CheckSum <${md5}> /ModDate (${pdfDate(now)}) >>`,
				deflateSync(raw),
			),
		);
		const ascii = a.name.replace(/[^\x20-\x7e]/g, "_").replace(/[()\\]/g, "_");
		files.push({
			name: ascii,
			ref: add(
				`<< /Type /Filespec /F (${ascii}) /UF ${pdfTextString(a.name)} /EF << /F ${ef} 0 R >>${a.description ? ` /Desc ${pdfTextString(a.description)}` : ""} /AFRelationship /Supplement >>`,
			),
		});
	}
	const names =
		files.length > 0
			? ` /Names << /EmbeddedFiles << /Names [${files.map((f) => `(${f.name}) ${f.ref} 0 R`).join(" ")}] >> >> /AF [${files.map((f) => `${f.ref} 0 R`).join(" ")}]`
			: "";
	objects[0] = `<< /Type /Catalog /Pages 2 0 R /Lang (de-DE)${names} >>`;
	objects[1] = `<< /Type /Pages /Kids [${pageRefs.map((r) => `${r} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;

	// Datei zusammensetzen, Offsets für die Querverweistabelle merken
	const parts: Buffer[] = [
		Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "latin1"),
	];
	let offset = parts[0]?.length ?? 0;
	const offsets: number[] = [];
	objects.forEach((o, i) => {
		const body =
			typeof o === "string" ? Buffer.from(o, "latin1") : Buffer.from(o);
		const chunk = Buffer.concat([
			Buffer.from(`${i + 1} 0 obj\n`, "latin1"),
			body,
			Buffer.from("\nendobj\n", "latin1"),
		]);
		offsets.push(offset);
		parts.push(chunk);
		offset += chunk.length;
	});
	const id = createHash("sha256")
		.update(Buffer.concat(parts))
		.digest("hex")
		.slice(0, 32);
	const xref = [
		"xref",
		`0 ${objects.length + 1}`,
		"0000000000 65535 f ",
		...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n `),
		"trailer",
		`<< /Size ${objects.length + 1} /Root 1 0 R /Info ${info} 0 R /ID [<${id}> <${id}>] >>`,
		"startxref",
		String(offset),
		"%%EOF",
		"",
	].join("\n");
	parts.push(Buffer.from(xref, "latin1"));
	return new Uint8Array(Buffer.concat(parts));
}
