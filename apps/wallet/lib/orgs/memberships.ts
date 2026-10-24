import { members, orgs } from "@wallet/db/schema";
import type { MemberRole } from "@wallet/db/schema/enums";
import { withUser } from "@wallet/lib/db/with-org";
import { asc, eq } from "drizzle-orm";

// Mitgliedschaften einer Person — nur über app.user_id (RLS members_self,
// orgs_member), ohne Org-Kontext.

export type Membership = {
	orgId: string;
	name: string;
	slug: string;
	role: MemberRole;
	memberId: string;
};

export async function listMemberships(userId: string): Promise<Membership[]> {
	return withUser(userId, (tx) =>
		tx
			.select({
				orgId: orgs.id,
				name: orgs.name,
				slug: orgs.slug,
				role: members.role,
				memberId: members.id,
			})
			.from(members)
			.innerJoin(orgs, eq(orgs.id, members.organizationId))
			.where(eq(members.userId, userId))
			.orderBy(asc(members.createdAt)),
	);
}

export async function firstMembership(userId: string): Promise<string | null> {
	return (await listMemberships(userId))[0]?.orgId ?? null;
}
