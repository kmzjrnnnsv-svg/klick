import { and, eq, isNull, ne } from "drizzle-orm";
import {
	auditFindings,
	audits,
	controls,
	nonconformities,
	tasks,
} from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import type { OrgTx } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import {
	findingNeedsNonconformity,
	type NonconformityDraft,
	nextNonconformityCode,
	nonconformityFromFinding,
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
	const assignee = draft.assigneeUserId ?? owner;
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
			assigneeUserId: assignee,
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
			assigneeUserId: assignee,
			createdByUserId: ctx.userId,
			dueAt: draft.dueAt,
			priority: "high",
			entityType: "nonconformity",
			entityId: row.id,
			sourceKind: "remediation",
		})
		.returning({ id: tasks.id });
	if (owner || assignee) {
		await notify(tx, {
			orgId: ctx.orgId,
			recipients: [owner, assignee],
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

// Audit-Finding → Abweichung (C1): automatisch beim Erfassen ab „leicht“,
// per Knopf je Finding oder gesammelt im Audit-Cockpit. Höchstens eine
// Abweichung je Finding; das Finding geht in „in Behebung“.
export async function nonconformityForFinding(
	tx: OrgTx,
	ctx: { orgId: string; userId: string | null },
	findingId: string,
): Promise<{ id: string; code: string; audit: AuditInput[] } | null> {
	const [f] = await tx
		.select({
			f: auditFindings,
			auditOwner: audits.ownerUserId,
			controlCode: controls.code,
		})
		.from(auditFindings)
		.innerJoin(audits, eq(audits.id, auditFindings.auditId))
		.leftJoin(controls, eq(controls.id, auditFindings.controlId))
		.where(
			and(
				eq(auditFindings.id, findingId),
				eq(auditFindings.organizationId, ctx.orgId),
			),
		)
		.limit(1);
	if (!f || f.f.nonconformityId) return null;
	const nc = await createNonconformity(
		tx,
		ctx,
		nonconformityFromFinding({
			id: f.f.id,
			title: f.controlCode ? `${f.controlCode}: ${f.f.title}` : f.f.title,
			description: f.f.description,
			severity: f.f.severity,
			ownerUserId: f.auditOwner,
		}),
	);
	await tx
		.update(auditFindings)
		.set({
			nonconformityId: nc.id,
			status: f.f.status === "open" ? "in_remediation" : f.f.status,
		})
		.where(eq(auditFindings.id, f.f.id));
	return {
		id: nc.id,
		code: nc.code,
		audit: [
			nc.audit,
			{
				action: "audit_finding.to_nonconformity",
				target: `audit_finding:${f.f.id}`,
				after: { nonconformityId: nc.id, code: nc.code },
			},
		],
	};
}

// Offene Findings eines Audits ohne Abweichung (Bestand vor C1)
export async function openFindingsWithoutNc(
	tx: OrgTx,
	orgId: string,
	auditId: string,
): Promise<{ id: string; severity: string }[]> {
	const rows = await tx
		.select({ id: auditFindings.id, severity: auditFindings.severity })
		.from(auditFindings)
		.where(
			and(
				eq(auditFindings.organizationId, orgId),
				eq(auditFindings.auditId, auditId),
				isNull(auditFindings.nonconformityId),
				ne(auditFindings.status, "closed"),
			),
		);
	return rows.filter((r) => findingNeedsNonconformity(r.severity));
}
