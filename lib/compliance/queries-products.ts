import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
	assessments,
	documents,
	evidence,
	incidents,
	products,
} from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import type { ProductForCra } from "./cra";
import { userNames } from "./queries";

// Org-gescopte Lesezugriffe für das Produktregister (CRA) — immer in
// readOrg/withOrg.

export async function listProducts(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(products)
		.where(eq(products.organizationId, orgId))
		.orderBy(asc(products.code));
	const names = await userNames(
		tx,
		rows.map((r) => r.ownerUserId),
	);
	return rows.map((r) => ({
		...r,
		ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
	}));
}

// Schmale Form für Anwendbarkeit (Produktrollen) und Prüfungsreife.
export async function listProductsForCra(
	tx: OrgTx,
	orgId: string,
): Promise<ProductForCra[]> {
	return tx
		.select({
			id: products.id,
			code: products.code,
			name: products.name,
			role: products.role,
			craInScope: products.craInScope,
			craClass: products.craClass,
			classReason: products.classReason,
			isFoss: products.isFoss,
			harmonisedStandards: products.harmonisedStandards,
			placedOnMarketAt: products.placedOnMarketAt,
			supportUntil: products.supportUntil,
			supportReason: products.supportReason,
			vulnContact: products.vulnContact,
			sbomSummary: products.sbomSummary,
			riskDocumentId: products.riskDocumentId,
			techDocDocumentId: products.techDocDocumentId,
			declarationAt: products.declarationAt,
			ceMarked: products.ceMarked,
			notifiedBody: products.notifiedBody,
			status: products.status,
		})
		.from(products)
		.where(eq(products.organizationId, orgId))
		.orderBy(asc(products.code));
}

export async function getProductDetail(
	tx: OrgTx,
	orgId: string,
	productId: string,
) {
	const [row] = await tx
		.select()
		.from(products)
		.where(and(eq(products.id, productId), eq(products.organizationId, orgId)))
		.limit(1);
	if (!row) return null;
	const docIds = [row.riskDocumentId, row.techDocDocumentId].filter(
		(x): x is string => Boolean(x),
	);
	const [docs, sbom, checklists, linkedIncidents, names] = await Promise.all([
		docIds.length > 0
			? tx
					.select({
						id: documents.id,
						docNumber: documents.docNumber,
						title: documents.title,
						status: documents.status,
					})
					.from(documents)
					.where(
						and(
							eq(documents.organizationId, orgId),
							inArray(documents.id, docIds),
						),
					)
			: Promise.resolve([]),
		row.sbomEvidenceId
			? tx
					.select({
						id: evidence.id,
						title: evidence.title,
						fileName: evidence.fileName,
						createdAt: evidence.createdAt,
					})
					.from(evidence)
					.where(
						and(
							eq(evidence.organizationId, orgId),
							eq(evidence.id, row.sbomEvidenceId),
						),
					)
					.limit(1)
			: Promise.resolve([]),
		tx
			.select({
				id: assessments.id,
				code: assessments.code,
				title: assessments.title,
				status: assessments.status,
				score: assessments.score,
				rating: assessments.rating,
				createdAt: assessments.createdAt,
			})
			.from(assessments)
			.where(
				and(
					eq(assessments.organizationId, orgId),
					eq(assessments.subjectType, "product"),
					eq(assessments.subjectId, productId),
				),
			)
			.orderBy(desc(assessments.createdAt)),
		tx
			.select({
				id: incidents.id,
				code: incidents.code,
				title: incidents.title,
				status: incidents.status,
				regimes: incidents.regimes,
				awareAt: incidents.awareAt,
				finalDueAt: incidents.finalDueAt,
				mitigationAvailableAt: incidents.mitigationAvailableAt,
			})
			.from(incidents)
			.where(
				and(
					eq(incidents.organizationId, orgId),
					eq(incidents.productId, productId),
				),
			)
			.orderBy(desc(incidents.awareAt)),
		userNames(tx, [row.ownerUserId, row.assigneeUserId]),
	]);
	return {
		product: row,
		documents: new Map(docs.map((d) => [d.id, d])),
		sbomEvidence: sbom[0] ?? null,
		checklists,
		incidents: linkedIncidents,
		names,
	};
}

// Auswahl für Formulare (Vorfall → Produkt, Dokument → Produkt).
export async function listProductOptions(tx: OrgTx, orgId: string) {
	return tx
		.select({ id: products.id, code: products.code, name: products.name })
		.from(products)
		.where(eq(products.organizationId, orgId))
		.orderBy(asc(products.code));
}
