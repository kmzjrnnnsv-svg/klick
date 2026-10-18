"use server";

import { APIError } from "better-auth/api";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { memberAccess, memberRoles, orgRoles } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { auditPlatform } from "@/lib/audit";
import {
	AuthError,
	requireOrg,
	requireStepUp,
	toOrgCtx,
} from "@/lib/auth/guards";
import { membershipAllowed, ownerMayReset } from "@/lib/auth/memberships";
import { listPendingInvitations, rolesElsewhere } from "@/lib/auth/org";
import { canHoldCustomRoles } from "@/lib/auth/permission-catalog";
import { findResetTarget, resetUserAccess } from "@/lib/auth/recover";
import {
	type InviteDelivery,
	inviteDelivery,
	issueRegistrationLink,
	revokeRegistrationLinks,
} from "@/lib/auth/registration-link";
import { auth } from "@/lib/auth/server";
import { mutateOrg } from "@/lib/db/with-org";
import { syncTrainingAssignments } from "@/lib/trainings/assignments";
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

// Einladung mit Passkey-Link (ADR-019): Der Link entsteht in
// sendInvitationEmail (lib/auth/server.ts) und kommt über inviteDelivery
// zurück — zum Kopieren, falls die Mail nicht ankommt oder nicht gewollt ist.
async function inviteMemberImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; url: string; mailed: boolean | null }>> {
	const c = await requireOrg({ member: ["create"] });
	const parsed = inviteMemberSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const delivery: InviteDelivery = { mail: parsed.data.sendMail };
	try {
		const inv = await inviteDelivery.run(delivery, async () =>
			auth.api.createInvitation({
				body: {
					email: parsed.data.email,
					role: parsed.data.role,
					organizationId: c.orgId,
				},
				headers: await headers(),
			}),
		);
		// Eigene Rollen vormerken (ADR-020) — verknüpft beim Annehmen
		const roleIds = canHoldCustomRoles(parsed.data.role)
			? parsed.data.roleIds
			: [];
		if (roleIds.length > 0) {
			const email = parsed.data.email.toLowerCase();
			await mutateOrg(toOrgCtx(c), async (tx) => {
				const valid = await tx
					.select({ id: orgRoles.id })
					.from(orgRoles)
					.where(
						and(
							eq(orgRoles.organizationId, c.orgId),
							inArray(orgRoles.id, roleIds),
						),
					);
				await tx
					.delete(memberRoles)
					.where(
						and(
							eq(memberRoles.organizationId, c.orgId),
							eq(memberRoles.pendingEmail, email),
						),
					);
				for (const r of valid)
					await tx.insert(memberRoles).values({
						organizationId: c.orgId,
						roleId: r.id,
						pendingEmail: email,
						createdByUserId: c.userId,
					});
				return {
					result: valid.length,
					audit: {
						action: "member.roles_pending",
						target: `invitation:${inv.id}`,
						after: { roleIds: valid.map((r) => r.id) },
					},
				};
			});
		}
		revalidatePath("/team");
		if (!delivery.url) return { ok: false, error: "error" };
		return {
			ok: true,
			data: {
				id: inv.id,
				url: delivery.url,
				mailed: delivery.mail ? Boolean(delivery.mailed) : null,
			},
		};
	} catch (e) {
		return mapError(e);
	}
}

// Neuer Link für eine offene Einladung (der alte wird ungültig) — der Token
// ist nur gehasht gespeichert und lässt sich nicht erneut anzeigen.
async function invitationLinkImpl(
	invitationId: string,
): Promise<ActionResult<{ url: string }>> {
	const c = await requireOrg({ member: ["create"] });
	const [inv] = (await listPendingInvitations(c.orgId)).filter(
		(i) => i.id === invitationId,
	);
	if (!inv || inv.expiresAt.getTime() < Date.now())
		return { ok: false, error: "not_found" };
	const { url } = await issueRegistrationLink(
		{
			kind: "invite",
			invitationId: inv.id,
			email: inv.email,
			organizationId: c.orgId,
		},
		inv.expiresAt,
	);
	await auditPlatform(
		{ userId: c.userId, ip: c.ip, userAgent: c.userAgent },
		{
			action: "org.invitation_link",
			target: `invitation:${inv.id}`,
			organizationId: c.orgId,
		},
	);
	return { ok: true, data: { url } };
}

// Zugang eines Mitglieds zurücksetzen (Passkey verloren; ADR-019): nur für
// Konten, die ausschließlich zu dieser Org gehören (ownerMayReset).
async function resetMemberAccessImpl(
	userId: string,
): Promise<ActionResult<{ url: string }>> {
	const c = await requireStepUp({ member: ["update"] });
	const target = await findResetTarget(userId);
	if (!target) return { ok: false, error: "not_found" };
	const may = ownerMayReset({ actorUserId: c.userId, orgId: c.orgId, target });
	if (!may.ok) return { ok: false, error: `reset_${may.reason}` };
	const { url } = await resetUserAccess({
		target,
		actor: {
			userId: c.userId,
			label: c.name || c.email,
			ip: c.ip,
			userAgent: c.userAgent,
		},
		organizationId: c.orgId,
		via: "owner",
	});
	revalidatePath("/team");
	return { ok: true, data: { url } };
}

async function cancelInvitationImpl(
	invitationId: string,
): Promise<ActionResult> {
	const c = await requireOrg({ member: ["create"] });
	try {
		const inv = (await listPendingInvitations(c.orgId)).find(
			(i) => i.id === invitationId,
		);
		await auth.api.cancelInvitation({
			body: { invitationId },
			headers: await headers(),
		});
		await revokeRegistrationLinks({ invitationId });
		// vorgemerkte eigene Rollen der Einladung verwerfen (ADR-020)
		if (inv)
			await mutateOrg(toOrgCtx(c), async (tx) => {
				const gone = await tx
					.delete(memberRoles)
					.where(
						and(
							eq(memberRoles.organizationId, c.orgId),
							eq(memberRoles.pendingEmail, inv.email.toLowerCase()),
						),
					)
					.returning({ id: memberRoles.id });
				return {
					result: gone.length,
					audit: gone.length
						? {
								action: "member.roles_pending_cleared",
								target: `invitation:${invitationId}`,
								after: { removed: gone.length },
							}
						: [],
				};
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
	// Eine eigene Organisation je Konto (ADR-018): wer anderswo schon Mitglied
	// ist, bleibt hier Berater:in.
	const elsewhere = await rolesElsewhere(parsed.data.memberId, c.orgId);
	if (!elsewhere) return { ok: false, error: "Mitglied nicht gefunden" };
	if (!membershipAllowed(elsewhere, parsed.data.role).ok)
		return {
			ok: false,
			error:
				"Diese Person gehört schon zu einer anderen Organisation und kann hier nur Berater:in (extern) sein.",
		};
	try {
		await auth.api.updateMemberRole({
			body: {
				memberId: parsed.data.memberId,
				role: parsed.data.role,
				organizationId: c.orgId,
			},
			headers: await headers(),
		});
		// Neue Rolle → Pflichtschulungen dieser Rolle zuweisen.
		await mutateOrg(toOrgCtx(c), async (tx) => {
			// Externe und Inhaber:innen tragen keine eigenen Rollen (ADR-020)
			if (!canHoldCustomRoles(parsed.data.role))
				await tx
					.delete(memberRoles)
					.where(
						and(
							eq(memberRoles.organizationId, c.orgId),
							eq(memberRoles.memberId, parsed.data.memberId),
						),
					);
			const n = await syncTrainingAssignments(tx, c.orgId);
			return {
				result: n,
				audit: n
					? {
							action: "training.assignments_synced",
							target: `member:${parsed.data.memberId}`,
							after: { assignments: n },
						}
					: [],
			};
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
export const invitationLink = safeAction("invitationLink", invitationLinkImpl);
export const resetMemberAccess = safeAction(
	"resetMemberAccess",
	resetMemberAccessImpl,
);
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
