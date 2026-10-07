import { notifications } from "@/db/schema";
import type { NotificationKind } from "@/db/schema/enums";
import type { OrgTx } from "@/lib/db/with-org";

// Benachrichtigung je Empfänger anlegen (innerhalb der Org-Transaktion).
// Sofort-Mail nur für task_assigned, mentioned, approval_requested,
// incident_deadline, risk_above_appetite — Versand übernimmt der Digest/Tick
// (emailedAt), damit kein Mailversand in der Transaktion hängt.
// Nie für eigene Aktionen.

export const IMMEDIATE_MAIL_KINDS: ReadonlySet<NotificationKind> = new Set([
	"task_assigned",
	"mentioned",
	"approval_requested",
	"incident_deadline",
	"risk_above_appetite",
	"security_alert",
]);

export async function notify(
	tx: OrgTx,
	input: {
		orgId: string;
		recipients: readonly (string | null | undefined)[];
		actorUserId: string | null;
		kind: NotificationKind;
		title: string;
		body?: string;
		link?: string;
		payload?: Record<string, unknown>;
	},
): Promise<number> {
	const targets = [
		...new Set(
			input.recipients.filter(
				(r): r is string => Boolean(r) && r !== input.actorUserId,
			),
		),
	];
	if (targets.length === 0) return 0;
	await tx.insert(notifications).values(
		targets.map((userId) => ({
			organizationId: input.orgId,
			userId,
			kind: input.kind,
			title: input.title,
			body: input.body ?? null,
			link: input.link ?? null,
			payload: input.payload ?? null,
		})),
	);
	return targets.length;
}
