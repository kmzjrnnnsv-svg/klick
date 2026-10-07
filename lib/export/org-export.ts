import { is } from "drizzle-orm";
import { CasingCache } from "drizzle-orm/casing";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { decryptField, isEncryptedField } from "@/lib/crypto/fields";
import { fieldAad } from "@/lib/crypto/org-dek";

// Vollständiger Org-Export (DSGVO Art. 20, DORA Art. 30(2)(d), Exit): jede
// Tabelle mit organization_id als JSON, feldverschlüsselte Spalten mit dem
// Org-DEK entschlüsselt, Nachweise im Klartext. Reine Helfer; die Route lädt.

export type OrgTable = { name: string };

// Alle Tabellen mit organization_id aus dem Drizzle-Schema (Reflexion, wie
// db/rls.ts) — neue Tabellen landen automatisch im Export.
export function orgTablesFromSchema(
	tables: Record<string, unknown>,
	exclude: ReadonlySet<string> = new Set(),
): OrgTable[] {
	const casing = new CasingCache("snake_case");
	const out: OrgTable[] = [];
	for (const value of Object.values(tables)) {
		if (!is(value, PgTable)) continue;
		const cfg = getTableConfig(value);
		if (exclude.has(cfg.name)) continue;
		const hasOrg = cfg.columns.some(
			(c) => casing.getColumnCasing(c) === "organization_id",
		);
		if (hasOrg) out.push({ name: cfg.name });
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

export type ExportRow = Record<string, unknown>;

// Feldverschlüsselte Werte (enc1:) entschlüsseln; AAD = tabelle:id:spalte wie
// beim Schreiben (app/actions/*). Nicht entschlüsselbare Felder bleiben als
// Ciphertext stehen und werden in __nicht_entschluesselbar genannt.
export async function decryptRows(
	table: string,
	rows: readonly ExportRow[],
	dek: Uint8Array,
): Promise<{ rows: ExportRow[]; decrypted: number; failed: number }> {
	let decrypted = 0;
	let failed = 0;
	const out: ExportRow[] = [];
	for (const row of rows) {
		const copy: ExportRow = { ...row };
		const problems: string[] = [];
		for (const [col, val] of Object.entries(row)) {
			if (!isEncryptedField(val)) continue;
			try {
				copy[col] = await decryptField(
					val,
					dek,
					fieldAad(table, String(row.id), col),
				);
				decrypted += 1;
			} catch {
				failed += 1;
				problems.push(col);
			}
		}
		if (problems.length > 0) copy.__nicht_entschluesselbar = problems;
		out.push(copy);
	}
	return { rows: out, decrypted, failed };
}

// org_settings ohne Schlüsselmaterial.
export function redactSettings(row: ExportRow): ExportRow {
	const { encrypted_dek: _dek, encryptedDek: _dek2, ...rest } = row;
	return { ...rest, encrypted_dek: "[nicht exportiert]" };
}

// JSON mit bigint (audit_log.seq) und Date stabil serialisieren.
export function toJson(value: unknown): string {
	return `${JSON.stringify(
		value,
		(_k, v) => (typeof v === "bigint" ? v.toString() : v),
		2,
	)}\n`;
}

export function safeFileName(
	name: string | null | undefined,
	fallback: string,
): string {
	const base = (name ?? fallback)
		.normalize("NFKD")
		.replaceAll(/[^\w.-]+/g, "_");
	return base.length === 0 ? fallback : base.slice(0, 120);
}
