import { and, eq } from "drizzle-orm";
import { controlImplementations, controls, products } from "@/db/schema";
import type {
	Classification,
	EvidenceDlp,
	EvidenceSource,
	SbomSummary,
} from "@/db/schema/enums";
import type { Product } from "@/db/schema/products";
import type { AuditInput } from "@/lib/audit";
import type { OrgTx } from "@/lib/db/with-org";
import {
	linkEvidenceToControl,
	storeEncryptedEvidence,
} from "@/lib/evidence/store";

// SBOM am Produkt ablegen — gemeinsam für Upload im Produkt und API-Ingest
// (/api/ingest/sbom). Die Datei landet verschlüsselt als Nachweis am Control
// CC-PRD-03 (ohne Dateiablage nur die Zusammenfassung), das Produkt bekommt
// die geprüfte Zusammenfassung.

export async function storeSbom(
	tx: OrgTx,
	ctx: { orgId: string; userId: string | null },
	input: {
		product: Pick<
			Product,
			"id" | "code" | "name" | "version" | "sbomEvidenceId"
		>;
		summary: SbomSummary;
		file: {
			bytes: Uint8Array;
			safeName: string;
			mime: string;
			classification: Classification;
			dlp?: EvidenceDlp | null;
			source: EvidenceSource;
		} | null;
		via?: "api_token";
	},
): Promise<{ evidenceId: string | null; audit: AuditInput }> {
	const { product: p, summary } = input;
	let evidenceId: string | null = null;
	if (input.file) {
		const stored = await storeEncryptedEvidence(tx, {
			orgId: ctx.orgId,
			bytes: input.file.bytes,
			safeName: input.file.safeName,
			mime: input.file.mime,
			title: `SBOM ${p.code} ${p.name}${p.version ? ` ${p.version}` : ""}`,
			description: `${summary.format === "cyclonedx" ? "CycloneDX" : "SPDX"} ${summary.specVersion ?? ""} · ${summary.components} Komponenten`,
			type: "config_export",
			classification: input.file.classification,
			createdByUserId: ctx.userId,
			dlp: input.file.dlp,
			source: input.file.source,
		});
		evidenceId = stored.id;
		const [impl] = await tx
			.select({ id: controlImplementations.id })
			.from(controlImplementations)
			.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
			.where(
				and(
					eq(controlImplementations.organizationId, ctx.orgId),
					eq(controls.code, "CC-PRD-03"),
				),
			)
			.limit(1);
		if (impl) await linkEvidenceToControl(tx, ctx.orgId, impl.id, stored.id);
	}
	await tx
		.update(products)
		.set({
			sbomSummary: summary,
			...(evidenceId ? { sbomEvidenceId: evidenceId } : {}),
		})
		.where(eq(products.id, p.id));
	return {
		evidenceId,
		audit: {
			action: "product.sbom_uploaded",
			target: `product:${p.id}`,
			before: { sbomEvidenceId: p.sbomEvidenceId },
			after: {
				sbomEvidenceId: evidenceId ?? p.sbomEvidenceId,
				format: summary.format,
				components: summary.components,
				ok: summary.ok,
				via: input.via,
			},
		},
	};
}
