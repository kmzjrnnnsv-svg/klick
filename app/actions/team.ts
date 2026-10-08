"use server";

import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { memberAccess } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import {
	AuthError,
	requireOrg,
	requireStepUp,
	toOrgCtx,
} from "@/lib/auth/guards";
import { auth } from "@/lib/auth/server";
import { mutateOrg } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import { memberAccessSchema } from "@/lib/validation/governance";
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

async function inviteMemberImpl(
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

async function cancelInvitationImpl(
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

async function updateMemberRoleImpl(input: unknown): Promise<ActionResult> {
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

async function removeMemberImpl(memberId: string): Promise<ActionResult> {
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

// Zeitlich begrenzter Zugang (Prüfer:innen) und Grants für sensible Register.
// Step-up-pflichtig; Ablauf setzt der Guard durch (access_expired).
async function setMemberAccessImpl(input: unknown): Promise<ActionResult> {
	let c: Awaited<ReturnType<typeof requireStepUp>>;
	try {
		c = await requireStepUp({ member: ["update"] });
	} catch (e) {
		if (e instanceof AuthError && e.code === "step_up_required")
			return { ok: false, error: "step_up_required" };
		throw e;
	}
	const parsed = memberAccessSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { memberId, accessUntil, grants } = parsed.data;
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select({
				accessUntil: memberAccess.accessUntil,
				grants: memberAccess.grants,
			})
			.from(memberAccess)
			.where(eq(memberAccess.memberId, memberId))
			.limit(1);
		await tx
			.insert(memberAccess)
			.values({
				memberId,
				organizationId: c.orgId,
				accessUntil,
				grants,
				createdByUserId: c.userId,
			})
			.onConflictDoUpdate({
				target: memberAccess.memberId,
				set: { accessUntil, grants },
			});
		return {
			result: null,
			audit: {
				action: "member.access",
				target: `member:${memberId}`,
				before: before ?? null,
				after: { accessUntil, grants },
			},
		};
	});
	revalidatePath("/team");
	return { ok: true, data: undefined };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const inviteMember = safeAction("inviteMember", inviteMemberImpl);
export const cancelInvitation = safeAction(
	"cancelInvitation",
	cancelInvitationImpl,
);
export const updateMemberRole = safeAction(
	"updateMemberRole",
	updateMemberRoleImpl,
);
export const removeMember = safeAction("removeMember", removeMemberImpl);
export const setMemberAccess = safeAction(
	"setMemberAccess",
	setMemberAccessImpl,
);
