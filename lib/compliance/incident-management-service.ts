import { eq } from "drizzle-orm";
import { incidents } from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import { functionRecipients } from "@/lib/compliance/function-holders-service";
import { TOP_MANAGEMENT_FUNCTION } from "@/lib/compliance/top-management";
import type { OrgTx } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";

// Geschäftsleitung über einen meldepflichtigen Vorfall bzw. eine abgegebene
// Meldung informieren (Sofort-Mail, lib/compliance/incident-management.ts).
// Gehört die handelnde Person selbst zur Geschäftsleitung, gilt ihre
// Handlung als Kenntnisnahme.
export async function informManagement(
	tx: OrgTx,
	actor: { orgId: string; userId: string },
	inc: {
		id: string;
		code: string;
		title: string;
		managementAcknowledgedAt: Date | null;
	},
	message: { title: string; body: string },
): Promise<AuditInput[]> {
	const managers = await functionRecipients(
		tx,
		actor.orgId,
		TOP_MANAGEMENT_FUNCTION,
	);
	await notify(tx, {
		orgId: actor.orgId,
		recipients: managers,
		actorUserId: actor.userId,
		kind: "management_info",
		title: message.title,
		body: message.body,
		link: `/vorfaelle/${inc.id}`,
		payload: { incidentId: inc.id },
	});
	const audit: AuditInput[] = [
		{
			action: "incident.management_informed",
			target: `incident:${inc.id}`,
			after: { recipients: managers.length, title: message.title },
		},
	];
	if (!inc.managementAcknowledgedAt && managers.includes(actor.userId)) {
		const at = new Date();
		await tx
			.update(incidents)
			.set({
				managementAcknowledgedAt: at,
				managementAcknowledgedBy: actor.userId,
			})
			.where(eq(incidents.id, inc.id));
		audit.push({
			action: "incident.management_acknowledged",
			target: `incident:${inc.id}`,
			after: { at, via: "own_action" },
		});
	}
	return audit;
}
