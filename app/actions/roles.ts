"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { member } from "@/db/auth-schema";
import { orgRoles, roleAssignments } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { governanceModeOf } from "@/lib/approvals/governance-mode";
import { AuthError, requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import {
	canHoldOwnRole,
	sanitizePermissions,
} from "@/lib/auth/permission-catalog";
import { normalizeRole } from "@/lib/auth/session-rules";
import { ownRoleKey } from "@/lib/compliance/function-key";
import { ownerRefsOf } from "@/lib/compliance/function-owners";
import { mutateOrg } from "@/lib/db/with-org";
import { setOwnRoleAssignments } from "@/lib/org/own-role-service";
import { listOrgRoles, workflowsUsingRole } from "@/lib/org/roles";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	deleteOrgRoleSchema,
	memberRolesSchema,
	orgRoleSchema,
} from "@/lib/validation/org";

// Eigene Rollen (ADR-020, ADR-024): nur Inhaber:innen, mit frischer
// Bestätigung. Rechte zusätzlich zur Grundrolle; der Katalog begrenzt, was
// vergeben werden kann (sanitizePermissions). Eigene Rollen sind Funktionen:
// wer sie trägt, schlägt der Editor (bzw. Team, Einladung) vor und die
// Geschäftsleitung bestellt; die Rechte folgen der Bestellung
// (syncMemberRoles). Rollen anlegen, ändern und löschen nur im
// individuellen Modus. Audit mit before/after.

const GOVERNANCE_LOCKED = "governance_standard";

async function stepUp(perm: Parameters<typeof requireStepUp>[0]) {
	try {
		return await requireStepUp(perm);
	} catch (e) {
		if (e instanceof AuthError && e.code === "step_up_required") return null;
		throw e;
	}
}

// Nur interne Mitglieder tragen eigene Rollen (Externe nie, ADR-018)
async function internalMembers(
	tx: Parameters<Parameters<typeof mutateOrg>[1]>[0],
	orgId: string,
	memberIds: readonly string[],
) {
	if (memberIds.length === 0) return [];
	const rows = await tx
		.select({ id: member.id, userId: member.userId, role: member.role })
		.from(member)
		.where(
			and(eq(member.organizationId, orgId), inArray(member.id, [...memberIds])),
		);
	return rows.filter((r) => canHoldOwnRole(normalizeRole(r.role)));
}

async function saveOrgRoleImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; waiting: number }>> {
	const c = await stepUp({ settings: ["update"] });
	if (!c) return { ok: false, error: "step_up_required" };
	const parsed = orgRoleSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const permissions = sanitizePermissions(d.permissions);
	const res = await mutateOrg<ActionResult<{ id: string; waiting: number }>>(
		toOrgCtx(c),
		async (tx) => {
			if ((await governanceModeOf(tx, c.orgId)) === "standard")
				return { result: { ok: false, error: GOVERNANCE_LOCKED }, audit: [] };
			const roles = await listOrgRoles(tx, c.orgId);
			const before = d.id ? roles.find((r) => r.id === d.id) : undefined;
			if (d.id && !before)
				return { result: { ok: false, error: "notFound" }, audit: [] };
			const clash = roles.find(
				(r) => r.id !== d.id && r.name.toLowerCase() === d.name.toLowerCase(),
			);
			if (clash)
				return { result: { ok: false, error: "roleNameTaken" }, audit: [] };

			const tasks = d.tasks === undefined ? undefined : d.tasks || null;
			let id = d.id;
			if (id) {
				await tx
					.update(orgRoles)
					.set({
						name: d.name,
						description: d.description || null,
						permissions,
						...(tasks === undefined ? {} : { tasks }),
					})
					.where(
						and(eq(orgRoles.id, id), eq(orgRoles.organizationId, c.orgId)),
					);
			} else {
				const [row] = await tx
					.insert(orgRoles)
					.values({
						organizationId: c.orgId,
						name: d.name,
						description: d.description || null,
						permissions,
						tasks: tasks ?? null,
						createdByUserId: c.userId,
					})
					.returning({ id: orgRoles.id });
				if (!row) throw new Error("insert failed");
				id = row.id;
			}

			// Besetzung über die Bestellung (nur interne Mitglieder)
			let waiting = 0;
			const changes = [];
			if (d.memberIds) {
				const wanted = await internalMembers(tx, c.orgId, d.memberIds);
				const out = await setOwnRoleAssignments(
					tx,
					{ orgId: c.orgId, userId: c.userId, name: c.name },
					wanted.map((w) => ({ roleId: id, holder: { userId: w.userId } })),
					{ roleIds: [id] },
					"roles_panel",
				);
				waiting = out.waiting;
				changes.push(...out.audit);
			}
			// Rechte geändert: bestehende Inhaber:innen behalten die Rolle, ihre
			// Rechte gelten sofort (die Rolle ist bestellt, nicht die Rechte)
			return {
				result: { ok: true, data: { id, waiting } },
				audit: [
					{
						action: before ? "role.update" : "role.create",
						target: `org_role:${id}`,
						before: before
							? {
									name: before.name,
									description: before.description,
									permissions: before.permissions,
								}
							: undefined,
						after: {
							name: d.name,
							description: d.description || null,
							permissions,
							...(tasks === undefined ? {} : { tasks }),
						},
					},
					...changes,
				],
			};
		},
	);
	revalidatePath("/einstellungen");
	revalidatePath("/team");
	revalidatePath("/organisation");
	return res;
}

// Löschen nur, wenn niemand die Rolle trägt (auch kein offener Vorschlag),
// kein Ablauf sie nutzt und kein Eintrag sie als Verantwortlich führt
async function deleteOrgRoleImpl(input: unknown): Promise<ActionResult> {
	const c = await stepUp({ settings: ["update"] });
	if (!c) return { ok: false, error: "step_up_required" };
	const parsed = deleteOrgRoleSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		if ((await governanceModeOf(tx, c.orgId)) === "standard")
			return { result: { ok: false, error: GOVERNANCE_LOCKED }, audit: [] };
		const roles = await listOrgRoles(tx, c.orgId);
		const role = roles.find((r) => r.id === parsed.data.id);
		if (!role) return { result: { ok: false, error: "notFound" }, audit: [] };
		const used = await workflowsUsingRole(tx, c.orgId, role.id);
		if (used.length > 0)
			return {
				result: {
					ok: false,
					error: "roleInUse",
					fieldErrors: { workflows: used },
				},
				audit: [],
			};
		const holders = await tx
			.select({ id: roleAssignments.id })
			.from(roleAssignments)
			.where(
				and(
					eq(roleAssignments.organizationId, c.orgId),
					eq(roleAssignments.orgRoleId, role.id),
					ne(roleAssignments.status, "revoked"),
					ne(roleAssignments.status, "rejected"),
				),
			)
			.limit(1);
		if (holders.length > 0)
			return { result: { ok: false, error: "roleHasHolders" }, audit: [] };
		if ((await ownerRefsOf(tx, c.orgId, ownRoleKey(role.id))) > 0)
			return { result: { ok: false, error: "roleIsResponsible" }, audit: [] };
		await tx
			.delete(orgRoles)
			.where(
				and(eq(orgRoles.id, role.id), eq(orgRoles.organizationId, c.orgId)),
			);
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "role.delete",
				target: `org_role:${role.id}`,
				before: {
					name: role.name,
					permissions: role.permissions,
					members: role.members.length,
				},
			},
		};
	});
	revalidatePath("/einstellungen");
	revalidatePath("/team");
	return res;
}

// Rollen einer Person (Team-Seite): vorschlagen bzw. abberufen über die
// Bestellung — in beiden Modi, die GL entscheidet
async function setMemberRolesImpl(
	input: unknown,
): Promise<ActionResult<{ waiting: number }>> {
	const c = await stepUp({ member: ["update"] });
	if (!c) return { ok: false, error: "step_up_required" };
	const parsed = memberRolesSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<ActionResult<{ waiting: number }>>(
		toOrgCtx(c),
		async (tx) => {
			const [m] = await internalMembers(tx, c.orgId, [d.memberId]);
			if (!m)
				return { result: { ok: false, error: "rolesNotAllowed" }, audit: [] };
			const roles = await listOrgRoles(tx, c.orgId);
			const valid = d.roleIds.filter((id) => roles.some((r) => r.id === id));
			const out = await setOwnRoleAssignments(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name },
				valid.map((roleId) => ({ roleId, holder: { userId: m.userId } })),
				{ holder: { userId: m.userId } },
				"team",
			);
			return {
				result: { ok: true, data: { waiting: out.waiting } },
				audit: [
					{
						action: "member.roles_set",
						target: `member:${m.id}`,
						after: { roleIds: valid },
					},
					...out.audit,
				],
			};
		},
	);
	revalidatePath("/team");
	revalidatePath("/einstellungen");
	revalidatePath("/organisation");
	return res;
}

export const saveOrgRole = safeAction("saveOrgRole", saveOrgRoleImpl);
export const deleteOrgRole = safeAction("deleteOrgRole", deleteOrgRoleImpl);
export const setMemberRoles = safeAction("setMemberRoles", setMemberRolesImpl);
