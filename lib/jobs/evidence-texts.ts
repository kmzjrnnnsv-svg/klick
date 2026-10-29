import { and, desc, eq, inArray, isNotNull, notExists, sql } from "drizzle-orm";
import { globalDb } from "@/db";
import { organization } from "@/db/auth-schema";
import { evidence, evidenceTexts } from "@/db/schema";
import { readOrg, withOrg } from "@/lib/db/with-org";
import { decryptEvidenceObject } from "@/lib/evidence/read";
import { evidenceFileFor } from "@/lib/evidence/serve";
import { extractedFrom, storeEvidenceText } from "@/lib/evidence/text";
import { logger } from "@/lib/log";
import { parseIsolated, screenResultSchema } from "@/lib/parse/client";

// Job evidence-texts (alle 15 min): liest den Text hochgeladener Dateien,
// die vor dem Fassungsvergleich hochgeladen wurden (Bestand), im isolierten
// Parser und speichert ihn verschlüsselt (lib/evidence/text.ts). Neue
// Uploads bringen ihren Text selbst mit (screenUpload withText). Je Lauf
// höchstens maxFiles Dateien bzw. maxBytes; Fehler werden als „error“
// vermerkt, damit nichts endlos wiederholt wird.

// Dateien mit Text (Uploads und Dateien von Dokumentfassungen)
export const TEXT_SOURCES = ["manual", "document"] as const;
export const TEXT_MIMES = [
	"application/pdf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"text/plain",
	"text/csv",
] as const;

export async function runEvidenceTexts(
	opts: { maxFiles?: number; maxBytes?: number; orgIds?: string[] } = {},
): Promise<{ read: number; failed: number }> {
	const maxFiles = opts.maxFiles ?? 20;
	let bytesLeft = opts.maxBytes ?? 100 * 1024 * 1024;
	let read = 0;
	let failed = 0;
	const orgIds =
		opts.orgIds ??
		(await globalDb.select({ id: organization.id }).from(organization)).map(
			(o) => o.id,
		);
	for (const orgId of orgIds) {
		if (read + failed >= maxFiles || bytesLeft <= 0) break;
		const ctx = { orgId, userId: null };
		const todo = await readOrg(ctx, (tx) =>
			tx
				.select({
					id: evidence.id,
					fileName: evidence.fileName,
					mimeType: evidence.mimeType,
					sizeBytes: evidence.sizeBytes,
				})
				// evidence:any-version — auch ersetzte Fassungen werden verglichen
				.from(evidence)
				.where(
					and(
						eq(evidence.organizationId, orgId),
						isNotNull(evidence.storageKey),
						inArray(evidence.source, [...TEXT_SOURCES]),
						inArray(evidence.mimeType, [...TEXT_MIMES]),
						notExists(
							tx
								.select({ one: sql`1` })
								.from(evidenceTexts)
								.where(eq(evidenceTexts.id, evidence.id)),
						),
					),
				)
				.orderBy(desc(evidence.createdAt))
				.limit(maxFiles - read - failed),
		);
		for (const e of todo) {
			if (bytesLeft <= 0) break;
			bytesLeft -= e.sizeBytes ?? 0;
			try {
				const file = await readOrg(ctx, (tx) =>
					evidenceFileFor(tx, orgId, e.id),
				);
				if (!file) continue;
				const bytes = await decryptEvidenceObject(file);
				const parsed = await parseIsolated(
					{
						op: "screen",
						name: e.fileName ?? "datei",
						declaredMime: e.mimeType ?? undefined,
						withText: true,
					},
					bytes,
					screenResultSchema,
				);
				const text = parsed.ok
					? parsed.data.validation.ok
						? extractedFrom(parsed.data.extraction, parsed.data.text)
						: ({ status: "error" } as const)
					: null;
				// Parser nicht erreichbar: nächster Lauf versucht es wieder
				if (!text) {
					failed += 1;
					continue;
				}
				await withOrg(ctx, (tx) => storeEvidenceText(tx, orgId, e.id, text));
				if (text.status === "error") failed += 1;
				else read += 1;
			} catch (err) {
				failed += 1;
				logger.warn(
					{ err, orgId, evidenceId: e.id },
					"evidence-texts: Datei nicht lesbar",
				);
				await withOrg(ctx, (tx) =>
					storeEvidenceText(tx, orgId, e.id, { status: "error" }),
				).catch(() => {});
			}
		}
	}
	if (read + failed > 0)
		logger.info({ read, failed }, "evidence-texts: Dateitexte gelesen");
	return { read, failed };
}
