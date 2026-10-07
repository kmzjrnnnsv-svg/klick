// CSV — reine Helfer für Import (Register) und Export (Routen unter
// /api/export). Trenner ; oder , (automatisch), Anführungszeichen nach RFC 4180,
// BOM wird ignoriert. Import ignoriert jede Spalte organization_id (Mandanten-
// trennung); Export entschärft Formel-Injektion in Tabellenkalkulationen.

export type CsvTable = {
	sep: string;
	header: string[];
	rows: Record<string, string>[];
};

export function parseCsv(text: string): CsvTable {
	const clean = text.replace(/^﻿/, "");
	const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
	const sep =
		(firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0)
			? ";"
			: ",";
	const records = splitRecords(clean, sep);
	const header = (records[0] ?? []).map((h) => h.trim());
	const rows: Record<string, string>[] = [];
	for (const rec of records.slice(1)) {
		if (rec.every((c) => c.trim() === "")) continue;
		const row: Record<string, string> = {};
		header.forEach((h, i) => {
			if (!h || h.toLowerCase() === "organization_id") return;
			row[h] = (rec[i] ?? "").trim();
		});
		rows.push(row);
	}
	return {
		sep,
		header: header.filter((h) => h.toLowerCase() !== "organization_id"),
		rows,
	};
}

function splitRecords(text: string, sep: string): string[][] {
	const out: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i] as string;
		if (quoted) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					cell += '"';
					i++;
				} else quoted = false;
			} else cell += ch;
			continue;
		}
		if (ch === '"') quoted = true;
		else if (ch === sep) {
			row.push(cell);
			cell = "";
		} else if (ch === "\n" || ch === "\r") {
			if (ch === "\r" && text[i + 1] === "\n") i++;
			row.push(cell);
			out.push(row);
			row = [];
			cell = "";
		} else cell += ch;
	}
	if (cell.length > 0 || row.length > 0) {
		row.push(cell);
		out.push(row);
	}
	return out;
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
