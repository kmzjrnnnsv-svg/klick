import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { evidence, orgSettings } from "@/db/schema";
import { SIGN_ORIGIN, SIGN_RP_ID } from "@/lib/auth/passkey-sign";
import type { OrgTx } from "@/lib/db/with-org";
import { isDbStorageKey } from "@/lib/evidence/aad";
import { dbEnvelope, decryptEvidenceObject } from "@/lib/evidence/read";
import { s3Configured } from "@/lib/evidence/store";
import { signaturesJson } from "@/lib/signatures/report";
import { signaturesFor } from "@/lib/signatures/service";
import type { ZipEntry } from "./zip";

// Prüfungspaket (N8): der jeweils neueste erzeugte Nachweis je Nachweisart
// (je Datensatz bei Auditbericht/Managementbewertung) als PDF, dazu seine
// Unterschriften als signaturen.json — prüfbar ohne Klick.

const DIR = "07-nachweise-aus-klick";

export async function loadGeneratedEvidence(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select({
			id: evidence.id,
			title: evidence.title,
			fileName: evidence.fileName,
			sha256: evidence.sha256,
			storageKey: evidence.storageKey,
			kindCode: evidence.kindCode,
			entityId: sql<string | null>`${evidence.snapshot}->>'entityId'`,
		})
		.from(evidence)
		.where(
			and(eq(evidence.organizationId, orgId), isNotNull(evidence.kindCode)),
		)
		.orderBy(desc(evidence.createdAt));
	const latest = new Map<string, (typeof rows)[number]>();
	for (const r of rows) {
		const key = `${r.kindCode}:${r.entityId ?? ""}`;
		if (!latest.has(key)) latest.set(key, r);
	}
	// ohne Objektspeicher nur, was in der Datenbank liegt
	const picked = [...latest.values()].filter(
		(r) => !r.storageKey || isDbStorageKey(r.storageKey) || s3Configured(),
	);
	const packed = new Map<string, Uint8Array>();
	for (const r of picked) {
		const env = await dbEnvelope(tx, orgId, r.id, r.storageKey);
		if (env) packed.set(r.id, env);
	}
	const [s] = await tx
		.select({
			wrapped: orgSettings.encryptedDek,
			keyVersion: orgSettings.keyVersion,
		})
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	return {
		items: picked,
		signatures: await signaturesFor(
			tx,
			orgId,
			picked.map((p) => p.id),
		),
		dek: s ?? null,
		packed,
	};
}

export async function generatedEvidenceEntries(
	data: Awaited<ReturnType<typeof loadGeneratedEvidence>>,
): Promise<ZipEntry[]> {
	if (!data.dek || data.items.length === 0) return [];
	const out: ZipEntry[] = [];
	const lines: string[] = [];
	for (const item of data.items) {
		if (!item.storageKey || !item.fileName) continue;
		const bytes = await decryptEvidenceObject({
			evidenceId: item.id,
			storageKey: item.storageKey,
			dek: data.dek,
			packed: data.packed.get(item.id),
		});
		// je Datensatz eigener Name (gleiche Version am selben Tag sonst doppelt)
		const fileName = item.entityId
			? item.fileName.replace(/\.pdf$/, `-${item.entityId.slice(0, 8)}.pdf`)
			: item.fileName;
		out.push({ name: `${DIR}/${fileName}`, data: bytes });
		const sigs = data.signatures.filter((x) => x.evidenceId === item.id);
		if (sigs.length > 0)
			out.push({
				name: `${DIR}/${fileName.replace(/\.pdf$/, "")}.signaturen.json`,
				data: JSON.stringify(
					signaturesJson({
						evidence: {
							id: item.id,
							title: item.title,
							fileName: item.fileName,
							sha256: item.sha256,
						},
						rows: sigs,
						env: { origin: SIGN_ORIGIN, rpId: SIGN_RP_ID },
					}),
					null,
					2,
				),
			});
		lines.push(
			`| ${item.kindCode} | ${item.title.replace(/\|/g, "/")} | ${fileName} | ${sigs.length} |`,
		);
	}
	out.unshift({
		name: `${DIR}/LIESMICH.md`,
		data: [
			"# Nachweise aus Klick",
			"",
			"Je Nachweisart der neueste aus den Registern erzeugte Nachweis (PDF). Im PDF hängen der Schnappschuss der Registerdaten (nachweis.json) und eine Markdown-Fassung; die Prüfsumme im Kopf ist SHA-256 über den kanonischen Schnappschuss.",
			"",
			"Unterschriften per Passkey stehen je Nachweis in <datei>.signaturen.json mit allen Prüfschritten (WebAuthn-Assertion, öffentlicher Schlüssel, bei Sammelunterschriften der Pfad zur Merkle-Wurzel).",
			"",
			"| Art | Titel | Datei | Unterschriften |",
			"| --- | --- | --- | --- |",
			...lines,
			"",
		].join("\n"),
	});
	return out;
}
