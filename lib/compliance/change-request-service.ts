import { and, eq } from "drizzle-orm";
import { changeRequests, tasks } from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import type { OrgTx } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";

// Wirkung der Freigabe eines Änderungsantrags (change.request): freigegeben
// → Umsetzung als Aufgabe offen; abgelehnt → Aufgabe abgeschlossen ohne
// Umsetzung. Die anfragende Person erfährt das Ergebnis.
export async function applyChangeDecision(
	tx: OrgTx,
	ctx: { orgId: string; userId: string },
	changeId: string,
	approved: boolean,
): Promise<AuditInput[]> {
	const [row] = await tx
		.update(changeRequests)
		.set({ status: approved ? "approved" : "rejected", decidedAt: new Date() })
		.where(
			and(
				eq(changeRequests.id, changeId),
				eq(changeRequests.organizationId, ctx.orgId),
				eq(changeRequests.status, "pending"),
			),
		)
		.returning();
	if (!row) return [];
	if (row.taskId)
		await tx
			.update(tasks)
			.set(
				approved
					? { status: "todo" }
					: { status: "done", completedAt: new Date() },
			)
			.where(eq(tasks.id, row.taskId));
	await notify(tx, {
		orgId: ctx.orgId,
		recipients: [row.requestedByUserId],
		actorUserId: ctx.userId,
		kind: "approval_decided",
		title: `${row.code} ${approved ? "freigegeben" : "abgelehnt"}: ${row.title}`,
		link: "/aenderungen",
	});
	return [
		{
			action: approved ? "change_request.approved" : "change_request.rejected",
			target: `change_request:${row.id}`,
			before: { status: "pending" },
			after: { status: row.status },
		},
	];
}
