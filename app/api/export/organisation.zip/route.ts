import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import * as appSchema from "@/db/schema";
import { toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary, listOrgMembers } from "@/lib/auth/org";
import { decryptBytes, unpackEnvelope } from "@/lib/crypto/envelope";
import { loadOrgDek } from "@/lib/crypto/org-dek";
import { readOrg } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { evidenceAad } from "@/lib/evidence/aad";
import {
	decryptRows,
	type ExportRow,
	orgTablesFromSchema,
	redactSettings,
	safeFileName,
	toJson,
} from "@/lib/export/org-export";
import {
	auditExport,
	exportStepUpGuard,
	stamp,
	zipResponse,
} from "@/lib/export/respond";
import { buildZip, withManifest, type ZipEntry } from "@/lib/export/zip";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_FILE_BYTES = 400 * 1024 * 1024;

// Vollständiger Export der Organisation (Owner, Step-up): alle Org-Tabellen
// als JSON (RLS-gescopt, feldverschlüsselte Spalten entschlüsselt),
// Mitglieder, Nachweis-Dateien im Klartext (bis 400 MB), Manifest.
export async function GET(req: Request) {
	const ctx = await exportStepUpGuard(req);
	if (ctx instanceof NextResponse) return ctx;
	if (ctx.orgRole !== "owner") return new NextResponse(null, { status: 403 });
	const generatedAt = new Date();
	const org = await getOrgSummary(ctx.orgId);
	if (!org) return new NextResponse(null, { status: 404 });
	const members = await listOrgMembers(ctx.orgId);
	const tables = orgTablesFromSchema(appSchema);
	const e = env();
	const s3Ready = Boolean(
		e.S3_ENDPOINT && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY,
	);

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const { dek } = await loadOrgDek(tx, ctx.orgId);
		const files: ZipEntry[] = [];
		const summary: {
			table: string;
			rows: number;
			decrypted: number;
			failed: number;
		}[] = [];
		for (const t of tables) {
			const res = await tx.execute<ExportRow>(
				sql`select * from ${sql.identifier(t.name)} where organization_id = ${ctx.orgId}`,
			);
			const rows = [...res];
			const dec = await decryptRows(t.name, rows, dek);
			const out =
				t.name === "org_settings" ? dec.rows.map(redactSettings) : dec.rows;
			files.push({
				name: `daten/${t.name}.json`,
				data: toJson(out),
				mtime: generatedAt,
			});
			summary.push({
				table: t.name,
				rows: rows.length,
				decrypted: dec.decrypted,
				failed: dec.failed,
			});
		}
		const evidenceRows = (await tx.execute<{
			id: string;
			file_name: string | null;
			storage_key: string | null;
			sha256: string | null;
			size_bytes: number | null;
		}>(
			sql`select id, file_name, storage_key, sha256, size_bytes from evidence where organization_id = ${ctx.orgId} and storage_key is not null order by created_at`,
		)) as unknown as {
			id: string;
			file_name: string | null;
			storage_key: string | null;
			sha256: string | null;
			size_bytes: number | null;
		}[];
		return { dek, files, summary, evidenceRows: [...evidenceRows] };
	});

	const skipped: string[] = [];
	let bytes = 0;
	let included = 0;
	if (s3Ready) {
		const { getBytes } = await import("@/lib/storage/s3");
		for (const ev of data.evidenceRows) {
			if (!ev.storage_key) continue;
			if (bytes + (ev.size_bytes ?? 0) > MAX_FILE_BYTES) {
				skipped.push(`${ev.id} (${ev.file_name ?? "—"}, Größenlimit)`);
				continue;
			}
			try {
				const packed = await getBytes(ev.storage_key);
				const plain = await decryptBytes(
					unpackEnvelope(packed),
					data.dek,
					evidenceAad(ev.id),
				);
				data.files.push({
					name: `nachweise/${ev.id}__${safeFileName(ev.file_name, "nachweis")}`,
					data: new Uint8Array(plain),
					mtime: generatedAt,
				});
				bytes += plain.byteLength;
				included += 1;
			} catch {
				skipped.push(`${ev.id} (${ev.file_name ?? "—"}, nicht lesbar)`);
			}
		}
	} else {
		for (const ev of data.evidenceRows)
			skipped.push(
				`${ev.id} (${ev.file_name ?? "—"}, Objektspeicher nicht konfiguriert)`,
			);
	}

	data.files.unshift(
		{
			name: "organisation.json",
			data: toJson({
				id: org.id,
				name: org.name,
				slug: org.slug,
				exportedAt: generatedAt.toISOString(),
				exportedBy: ctx.email,
			}),
			mtime: generatedAt,
		},
		{
			name: "mitglieder.json",
			data: toJson(
				members.map((m) => ({
					userId: m.userId,
					name: m.name,
					email: m.email,
					role: m.role,
					twoFactorEnabled: m.twoFactorEnabled,
					createdAt: m.createdAt,
					accessUntil: m.accessUntil,
					grants: m.grants,
				})),
			),
			mtime: generatedAt,
		},
	);
	const totalRows = data.summary.reduce((s, t) => s + t.rows, 0);
	const failed = data.summary.reduce((s, t) => s + t.failed, 0);
	data.files.unshift({
		name: "README.md",
		mtime: generatedAt,
		data: [
			`# Vollständiger Export — ${org.name}`,
			"",
			`Erstellt ${generatedAt.toISOString()} durch ${ctx.email} · ${tables.length} Tabellen · ${totalRows} Zeilen · ${included} Nachweis-Dateien (${Math.round(bytes / 1024 / 1024)} MB)`,
			"",
			"- `organisation.json`, `mitglieder.json` — Stammdaten und Mitglieder (Better Auth)",
			"- `daten/<tabelle>.json` — jede Tabelle mit organization_id, Spaltennamen wie in Postgres (snake_case); feldverschlüsselte Spalten (enc1:) sind entschlüsselt",
			"- `nachweise/<id>__<datei>` — Nachweis-Dateien im Klartext; Index in `daten/evidence.json` (sha256 zum Abgleich)",
			"- `MANIFEST.json`, `SHA256SUMS` — Prüfsummen",
			"",
			`Schlüsselmaterial (org_settings.encrypted_dek) ist nicht enthalten.${failed ? ` ${failed} Felder konnten nicht entschlüsselt werden und stehen als Ciphertext (__nicht_entschluesselbar).` : ""}`,
			"",
			...(skipped.length > 0
				? [
						"## Nicht enthaltene Dateien",
						"",
						...skipped.map((s) => `- ${s}`),
						"",
					]
				: []),
			"## Tabellen",
			"",
			"| Tabelle | Zeilen | entschlüsselte Felder |",
			"|---|---|---|",
			...data.summary.map((t) => `| ${t.table} | ${t.rows} | ${t.decrypted} |`),
			"",
			"_Format für Exit und Migration (DORA Art. 30(2)(d)); Aufbewahrungspflichten liegen bei der Organisation._",
			"",
		].join("\n"),
	});

	const { entries, manifest } = withManifest(data.files, {
		title: "Vollständiger Export",
		generatedAt,
		organization: { id: org.id, name: org.name },
		extra: {
			tables: tables.length,
			rows: totalRows,
			files: included,
			skipped: skipped.length,
		},
	});
	const zip = buildZip(entries);
	await auditExport(ctx, "org_full_zip", totalRows, {
		entries: manifest.files.length,
		tables: tables.length,
		files: included,
		skipped: skipped.length,
		bytes: zip.byteLength,
	});
	return zipResponse(`export-${org.slug}-${stamp()}.zip`, zip);
}
