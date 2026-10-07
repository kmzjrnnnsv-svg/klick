"use server";

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireOrg } from "@/lib/auth/guards";
import { auth } from "@/lib/auth/server";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	inviteMemberSchema,
	updateMemberRoleSchema,
} from "@/lib/validation/org";

// Mitgliederverwaltung über die Better-Auth-API (Berechtigungen prüft das
// organization-Plugin zusätzlich mit unserem Access-Control-Modell).
// Audit: organizationHooks in lib/auth/server.ts.

function mapError(e: unknown): ActionResult<never> {
	if (e instanceof APIError) return { ok: false, error: e.message };
	throw e;
}

export async function inviteMember(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ member: ["create"] });
	const parsed = inviteMemberSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	try {
		const inv = await auth.api.createInvitation({
			body: {
				email: parsed.data.email,
				role: parsed.data.role,
				organizationId: c.orgId,
			},
			headers: await headers(),
		});
		revalidatePath("/team");
		return { ok: true, data: { id: inv.id } };
	} catch (e) {
		return mapError(e);
	}
}

export async function cancelInvitation(
	invitationId: string,
): Promise<ActionResult> {
	await requireOrg({ member: ["create"] });
	try {
		await auth.api.cancelInvitation({
			body: { invitationId },
			headers: await headers(),
		});
		revalidatePath("/team");
		return { ok: true, data: undefined };
	} catch (e) {
		return mapError(e);
	}
}

export async function updateMemberRole(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ member: ["update"] });
	const parsed = updateMemberRoleSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	try {
		await auth.api.updateMemberRole({
			body: {
				memberId: parsed.data.memberId,
				role: parsed.data.role,
				organizationId: c.orgId,
			},
			headers: await headers(),
		});
		revalidatePath("/team");
		return { ok: true, data: undefined };
	} catch (e) {
		return mapError(e);
	}
}

export async function removeMember(memberId: string): Promise<ActionResult> {
	const c = await requireOrg({ member: ["delete"] });
	try {
		await auth.api.removeMember({
			body: { memberIdOrEmail: memberId, organizationId: c.orgId },
			headers: await headers(),
		});
		revalidatePath("/team");
		return { ok: true, data: undefined };
	} catch (e) {
		return mapError(e);
	}
}
