import { eq } from "drizzle-orm";
import { nonconformities, tasks } from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import type { OrgTx } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import {
	type NonconformityDraft,
	nextNonconformityCode,
} from "./nonconformity";

// Abweichung anlegen (aus Vorfall, Test, Finding oder manuell) inklusive
// Bearbeitungsaufgabe und Benachrichtigung. Wird innerhalb einer
// mutateOrg-Transaktion aufgerufen; der Audit-Eintrag geht an den Aufrufer
// zurück, damit er als letzte Anweisung geschrieben wird.
export async function createNonconformity(
	tx: OrgTx,
	ctx: { orgId: string; userId: string | null },
	draft: NonconformityDraft,
	now = new Date(),
): Promise<{ id: string; code: string; audit: AuditInput }> {
	const existing = await tx
		.select({ code: nonconformities.code })
		.from(nonconformities)
		.where(eq(nonconformities.organizationId, ctx.orgId));
	const code = nextNonconformityCode(
		existing.map((x) => x.code),
		now,
	);
	const owner = draft.ownerUserId ?? ctx.userId;
	const [row] = await tx
		.insert(nonconformities)
		.values({
			organizationId: ctx.orgId,
			code,
			source: draft.source,
			sourceRefId: draft.sourceRefId,
			title: draft.title,
			description: draft.description,
			rootCause: draft.rootCause,
			ownerUserId: owner,
			assigneeUserId: owner,
			dueAt: draft.dueAt,
			effectivenessCheckAt: draft.effectivenessCheckAt,
			status: "open",
		})
		.returning({ id: nonconformities.id });
	if (!row) throw new Error("insert failed");
	const [task] = await tx
		.insert(tasks)
		.values({
			organizationId: ctx.orgId,
			title: `${code}: Abweichung bearbeiten — ${draft.title}`,
			description:
				"Ursache analysieren, Korrektur und Korrekturmaßnahme festlegen, Wirksamkeitsprüfung terminieren.",
			assigneeUserId: owner,
			createdByUserId: ctx.userId,
			dueAt: draft.dueAt,
			priority: "high",
			entityType: "nonconformity",
			entityId: row.id,
			sourceKind: "remediation",
		})
		.returning({ id: tasks.id });
	if (owner) {
		await notify(tx, {
			orgId: ctx.orgId,
			recipients: [owner],
			actorUserId: ctx.userId,
			kind: "task_assigned",
			title: `${code}: ${draft.title}`,
			link: `/abweichungen/${row.id}`,
			payload: { taskId: task?.id, source: draft.source },
		});
	}
	return {
		id: row.id,
		code,
		audit: {
			action: "nonconformity.create",
			target: `nonconformity:${row.id}`,
			after: {
				code,
				source: draft.source,
				sourceRefId: draft.sourceRefId,
				title: draft.title,
				dueAt: draft.dueAt,
			},
		},
	};
}
