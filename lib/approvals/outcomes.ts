import { and, eq } from "drizzle-orm";
import {
	documents,
	documentVersions,
	exceptions,
	incidents,
	risks,
} from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import type { DecideResult } from "./service";

// Wendet den Ausgang einer Freigabe auf die Entität an. Wird vom Entscheiden
// (approvals.ts) aufgerufen; die Entitäts-Actions setzen beim Anfragen den
// Zwischenzustand (z. B. document in_review, risk bleibt in_treatment).
export async function applyApprovalOutcome(
	tx: OrgTx,
	ctx: { orgId: string; userId: string },
	r: Extract<DecideResult, { ok: true }>,
): Promise<void> {
	const approved = r.status === "approved";
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
			if (!doc) return;
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
			return;
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
			return;
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
			return;
		}
		case "incident": {
			if (approved) {
				await tx
					.update(incidents)
					.set({ status: "closed" })
					.where(
						and(
							eq(incidents.id, r.entityId),
							eq(incidents.organizationId, ctx.orgId),
						),
					);
			}
			return;
		}
		default:
			return;
	}
}
