import { and, eq } from "drizzle-orm";
import {
	documents,
	documentVersions,
	exceptions,
	incidents,
	risks,
	scopes,
} from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import { nonconformityFromIncident } from "@/lib/compliance/nonconformity";
import { createNonconformity } from "@/lib/compliance/nonconformity-service";
import type { OrgTx } from "@/lib/db/with-org";
import type { DecideResult } from "./service";

// Wendet den Ausgang einer Freigabe auf die Entität an. Wird vom Entscheiden
// (approvals.ts) aufgerufen; die Entitäts-Actions setzen beim Anfragen den
// Zwischenzustand (z. B. document in_review, risk bleibt in_treatment).
export async function applyApprovalOutcome(
	tx: OrgTx,
	ctx: { orgId: string; userId: string },
	r: Extract<DecideResult, { ok: true }>,
): Promise<AuditInput[]> {
	const approved = r.status === "approved";
	const extra: AuditInput[] = [];
	switch (r.entityType) {
		case "document": {
			const [doc] = await tx
				.select({
					id: documents.id,
					status: documents.status,
					version: documents.version,
				})
				.from(documents)
				.where(
					and(
						eq(documents.id, r.entityId),
						eq(documents.organizationId, ctx.orgId),
					),
				)
				.limit(1);
			if (!doc) return extra;
			if (approved) {
				await tx
					.update(documents)
					.set({ status: "approved" })
					.where(eq(documents.id, doc.id));
				await tx
					.update(documentVersions)
					.set({ approvedByUserId: ctx.userId, approvedAt: new Date() })
					.where(
						and(
							eq(documentVersions.documentId, doc.id),
							eq(documentVersions.version, doc.version),
						),
					);
			} else {
				await tx
					.update(documents)
					.set({ status: "draft" })
					.where(eq(documents.id, doc.id));
			}
			return extra;
		}
		case "risk": {
			if (approved) {
				await tx
					.update(risks)
					.set({
						status: "accepted",
						acceptedByUserId: ctx.userId,
						acceptedAt: new Date(),
					})
					.where(
						and(eq(risks.id, r.entityId), eq(risks.organizationId, ctx.orgId)),
					);
			}
			return extra;
		}
		case "exception": {
			await tx
				.update(exceptions)
				.set({ status: approved ? "approved" : "revoked" })
				.where(
					and(
						eq(exceptions.id, r.entityId),
						eq(exceptions.organizationId, ctx.orgId),
					),
				);
			return extra;
		}
		case "incident": {
			if (approved) {
				const [inc] = await tx
					.select()
					.from(incidents)
					.where(
						and(
							eq(incidents.id, r.entityId),
							eq(incidents.organizationId, ctx.orgId),
						),
					)
					.limit(1);
				if (!inc) return extra;
				await tx
					.update(incidents)
					.set({ status: "closed" })
					.where(eq(incidents.id, inc.id));
				// DORA Art. 13: schwerwiegender Vorfall → Abweichung (Lessons Learned)
				const draft = nonconformityFromIncident(inc);
				if (draft) {
					const nc = await createNonconformity(
						tx,
						{ orgId: ctx.orgId, userId: ctx.userId },
						draft,
					);
					extra.push(nc.audit);
				}
			}
			return extra;
		}
		case "scope": {
			await tx
				.update(scopes)
				.set(
					approved
						? {
								status: "approved",
								approvedByUserId: ctx.userId,
								approvedAt: new Date(),
							}
						: { status: "draft" },
				)
				.where(
					and(eq(scopes.id, r.entityId), eq(scopes.organizationId, ctx.orgId)),
				);
			return extra;
		}
		default:
			return extra;
	}
}
