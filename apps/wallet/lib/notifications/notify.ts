import { members, notifications } from "@wallet/db/schema";
import type { MemberRole, NotificationKind } from "@wallet/db/schema/enums";
import type { OrgTx } from "@wallet/lib/db/with-org";
import { and, eq, inArray, ne } from "drizzle-orm";

// Benachrichtigungen in der Org-Transaktion — nie an die handelnde Person.
// Sofort per Mail gehen nur IMMEDIATE_MAIL_KINDS (Job notification-mail).

export const IMMEDIATE_MAIL_KINDS: readonly NotificationKind[] = [
	"security_alert",
	"signer",
];

export async function notify(
	tx: OrgTx,
	input: {
		orgId: string;
		actorUserId: string | null;
		kind: NotificationKind;
		title: string;
		body?: string;
		link?: string;
		payload?: Record<string, unknown>;
		// Empfänger: Rollen der Org (Standard: alle) oder feste Personen
		roles?: readonly MemberRole[];
		userIds?: readonly string[];
	},
): Promise<number> {
	let to = input.userIds ? [...input.userIds] : [];
	if (!input.userIds) {
		const rows = await tx
			.select({ userId: members.userId })
			.from(members)
			.where(
				and(
					eq(members.organizationId, input.orgId),
					input.roles ? inArray(members.role, [...input.roles]) : undefined,
					input.actorUserId ? ne(members.userId, input.actorUserId) : undefined,
				),
			);
		to = rows.map((r) => r.userId);
	}
	to = [...new Set(to)].filter((u) => u !== input.actorUserId);
	if (to.length === 0) return 0;
	await tx.insert(notifications).values(
		to.map((userId) => ({
			organizationId: input.orgId,
			userId,
			kind: input.kind,
			title: input.title,
			body: input.body ?? null,
			link: input.link ?? null,
			payload: input.payload ?? null,
		})),
	);
	return to.length;
}
