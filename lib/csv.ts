// CSV — reine Helfer für Import (Register) und Export (Routen unter
// /api/export). Trenner ; , oder Tab (automatisch, oder per „sep=“-Zeile),
// Anführungszeichen nach RFC 4180, BOM wird ignoriert. Import ignoriert jede Spalte organization_id (Mandanten-
// trennung); Export entschärft Formel-Injektion in Tabellenkalkulationen.

export type CsvTable = {
	sep: string;
	header: string[];
	// Schlüssel = normalisierter Spaltenname (headerKey): „Titel“ → "titel",
	// „Kritikalität“ → "kritikalitaet", "isLegacy" → "islegacy"
	rows: Record<string, string>[];
	// Zeilennummer in der Datei je Eintrag in rows (für Fehlermeldungen)
	lines: number[];
};

// Spaltennamen tolerant vergleichen: Groß/Klein, Umlaute, Leer-/Sonderzeichen.
export function headerKey(h: string): string {
	return h
		.trim()
		.toLowerCase()
		.replaceAll("ä", "ae")
		.replaceAll("ö", "oe")
		.replaceAll("ü", "ue")
		.replaceAll("ß", "ss")
		.replace(/[^a-z0-9]/g, "");
}

// Erster Wert unter einem der Spaltennamen (Aliase deutsch/englisch).
export function field(
	row: Record<string, string>,
	...names: string[]
): string | undefined {
	for (const n of names) {
		const v = row[headerKey(n)];
		if (v !== undefined && v !== "") return v;
	}
	return undefined;
}

function detectSep(line: string): string {
	const counts = [";", ",", "\t"].map((c) => ({
		c,
		n: line.split(c).length - 1,
	}));
	counts.sort((a, b) => b.n - a.n);
	return counts[0] && counts[0].n > 0 ? counts[0].c : ";";
}

export function parseCsv(text: string): CsvTable {
	let clean = text.replace(/^\uFEFF/, "");
	let lineOffset = 0;
	// Excel schreibt gelegentlich „sep=;“ als erste Zeile.
	const sepLine = clean.match(/^sep=(.)\r?\n/i);
	let sep: string;
	if (sepLine?.[1]) {
		sep = sepLine[1];
		clean = clean.slice(sepLine[0].length);
		lineOffset = 1;
	} else {
		sep = detectSep(clean.split(/\r?\n/, 1)[0] ?? "");
	}
	const records = splitRecords(clean, sep);
	const header = (records[0]?.cells ?? []).map((h) => h.trim());
	const keys = header.map(headerKey);
	const rows: Record<string, string>[] = [];
	const lines: number[] = [];
	for (const rec of records.slice(1)) {
		if (rec.cells.every((c) => c.trim() === "")) continue;
		const row: Record<string, string> = {};
		keys.forEach((k, i) => {
			if (!k || k === "organizationid") return;
			row[k] = (rec.cells[i] ?? "").trim();
		});
		rows.push(row);
		lines.push(rec.line + lineOffset);
	}
	return {
		sep,
		header: header.filter((h) => headerKey(h) !== "organizationid"),
		rows,
		lines,
	};
}

// RFC 4180: Anführungszeichen öffnen nur am Zellanfang; ein einzelnes " mitten
// in einer Zelle bleibt Text (sonst verschluckt es den Rest der Datei).
function splitRecords(
	text: string,
	sep: string,
): { line: number; cells: string[] }[] {
	const out: { line: number; cells: string[] }[] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;
	let line = 1;
	let recordLine = 1;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i] as string;
		if (quoted) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					cell += '"';
					i++;
				} else quoted = false;
			} else {
				if (ch === "\n") line++;
				cell += ch;
			}
			continue;
		}
		if (ch === '"' && cell === "") quoted = true;
		else if (ch === sep) {
			row.push(cell);
			cell = "";
		} else if (ch === "\n" || ch === "\r") {
			if (ch === "\r" && text[i + 1] === "\n") i++;
			row.push(cell);
			out.push({ line: recordLine, cells: row });
			row = [];
			cell = "";
			line++;
			recordLine = line;
		} else cell += ch;
	}
	if (cell.length > 0 || row.length > 0) {
		row.push(cell);
		out.push({ line: recordLine, cells: row });
	}
	return out;
}

// Datum aus Tabellen: 31.12.2026, 31.12.26, 2026-12-31 → ISO; sonst unverändert
// (dann meldet das Schema den Fehler).
export function toIsoDate(v: string | undefined): string | undefined {
	if (v === undefined) return undefined;
	const s = v.trim();
	if (s === "") return undefined;
	const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
	if (de) {
		const [, d, m, y] = de;
		const year = y && y.length === 2 ? `20${y}` : y;
		return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
	}
	return s;
}

export function csvCell(v: unknown): string {
	if (v === null || v === undefined) return "";
	const s =
		v instanceof Date
			? v.toISOString()
			: typeof v === "object"
				? JSON.stringify(v)
				: String(v);
	const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
	return /[",\n\r;]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(
	header: readonly string[],
	rows: readonly unknown[][],
): string {
	const lines = [
		header.join(";"),
		...rows.map((r) => r.map(csvCell).join(";")),
	];
	// BOM für Excel, Semikolon für DE-Locale
	return `﻿${lines.join("\r\n")}\r\n`;
}

export function toBool(v: string | undefined, fallback = false): boolean {
	if (v === undefined || v === "") return fallback;
	return ["1", "true", "ja", "yes", "x", "wahr"].includes(
		v.trim().toLowerCase(),
	);
}
