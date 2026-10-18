"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { member } from "@/db/auth-schema";
import { memberRoles, orgRoles } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { AuthError, requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import {
	canHoldCustomRoles,
	sanitizePermissions,
} from "@/lib/auth/permission-catalog";
import { normalizeRole } from "@/lib/auth/session-rules";
import { mutateOrg } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { listOrgRoles, workflowsUsingRole } from "@/lib/org/roles";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	deleteOrgRoleSchema,
	memberRolesSchema,
	orgRoleSchema,
} from "@/lib/validation/org";

// Eigene Rollen (ADR-020): nur Inhaber:innen, mit frischer Bestätigung.
// Rechte zusätzlich zur Grundrolle; der Katalog begrenzt, was vergeben
// werden kann (sanitizePermissions). Audit mit before/after.

async function stepUp(perm: Parameters<typeof requireStepUp>[0]) {
	try {
		return await requireStepUp(perm);
	} catch (e) {
		if (e instanceof AuthError && e.code === "step_up_required") return null;
		throw e;
	}
}

// Nur interne Mitglieder (bearbeitend/lesend) tragen eigene Rollen
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
	return rows.filter((r) => canHoldCustomRoles(normalizeRole(r.role)));
}

async function saveOrgRoleImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await stepUp({ settings: ["update"] });
	if (!c) return { ok: false, error: "step_up_required" };
	const parsed = orgRoleSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const permissions = sanitizePermissions(d.permissions);
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const roles = await listOrgRoles(tx, c.orgId);
			const before = d.id ? roles.find((r) => r.id === d.id) : undefined;
			if (d.id && !before)
				return { result: { ok: false, error: "notFound" }, audit: [] };
			const clash = roles.find(
				(r) => r.id !== d.id && r.name.toLowerCase() === d.name.toLowerCase(),
			);
			if (clash)
				return { result: { ok: false, error: "roleNameTaken" }, audit: [] };

			let id = d.id;
			if (id) {
				await tx
					.update(orgRoles)
					.set({
						name: d.name,
						description: d.description || null,
						permissions,
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
						createdByUserId: c.userId,
					})
					.returning({ id: orgRoles.id });
				if (!row) throw new Error("insert failed");
				id = row.id;
			}

			// Mitglieder abgleichen (nur interne; Externe/Inhaber:innen nie)
			let added: string[] = [];
			let removed: string[] = [];
			if (d.memberIds) {
				const wanted = await internalMembers(tx, c.orgId, d.memberIds);
				const current = (before?.members ?? [])
					.map((m) => m.memberId)
					.filter((x): x is string => Boolean(x));
				added = wanted.map((w) => w.id).filter((mid) => !current.includes(mid));
				removed = current.filter((mid) => !wanted.some((w) => w.id === mid));
				if (removed.length > 0)
					await tx
						.delete(memberRoles)
						.where(
							and(
								eq(memberRoles.organizationId, c.orgId),
								eq(memberRoles.roleId, id),
								inArray(memberRoles.memberId, removed),
							),
						);
				for (const w of wanted.filter((w) => added.includes(w.id))) {
					await tx.insert(memberRoles).values({
						organizationId: c.orgId,
						roleId: id,
						memberId: w.id,
						userId: w.userId,
						createdByUserId: c.userId,
					});
				}
				const touched = wanted
					.filter((w) => added.includes(w.id))
					.map((w) => w.userId);
				if (touched.length > 0)
					await notify(tx, {
						orgId: c.orgId,
						recipients: touched,
						actorUserId: c.userId,
						kind: "entity_changed",
						title: `Neue Rolle in Klick: ${d.name}`,
						body: "Deine Rechte wurden erweitert.",
						link: "/heute",
					});
			}
			return {
				result: { ok: true, data: { id } },
				audit: {
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
						membersAdded: added,
						membersRemoved: removed,
					},
				},
			};
		},
	);
	revalidatePath("/einstellungen");
	revalidatePath("/team");
	return res;
}

async function deleteOrgRoleImpl(input: unknown): Promise<ActionResult> {
	const c = await stepUp({ settings: ["update"] });
	if (!c) return { ok: false, error: "step_up_required" };
	const parsed = deleteOrgRoleSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
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

// Rollen einer Person (Team-Seite)
async function setMemberRolesImpl(input: unknown): Promise<ActionResult> {
	const c = await stepUp({ member: ["update"] });
	if (!c) return { ok: false, error: "step_up_required" };
	const parsed = memberRolesSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const [m] = await internalMembers(tx, c.orgId, [d.memberId]);
		if (!m)
			return { result: { ok: false, error: "rolesNotAllowed" }, audit: [] };
		const roles = await listOrgRoles(tx, c.orgId);
		const valid = d.roleIds.filter((id) => roles.some((r) => r.id === id));
		const before = roles
			.filter((r) => r.members.some((x) => x.memberId === m.id))
			.map((r) => r.id);
		await tx
			.delete(memberRoles)
			.where(
				and(
					eq(memberRoles.organizationId, c.orgId),
					eq(memberRoles.memberId, m.id),
				),
			);
		for (const roleId of valid)
			await tx.insert(memberRoles).values({
				organizationId: c.orgId,
				roleId,
				memberId: m.id,
				userId: m.userId,
				createdByUserId: c.userId,
			});
		const names = roles
			.filter((r) => valid.includes(r.id))
			.map((r) => r.name)
			.join(", ");
		await notify(tx, {
			orgId: c.orgId,
			recipients: [m.userId],
			actorUserId: c.userId,
			kind: "entity_changed",
			title: "Deine Rollen in Klick wurden geändert",
			body: names ? `Rollen: ${names}` : "Keine eigenen Rollen mehr.",
			link: "/heute",
		});
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "member.roles_set",
				target: `member:${m.id}`,
				before: { roleIds: before },
				after: { roleIds: valid },
			},
		};
	});
	revalidatePath("/team");
	revalidatePath("/einstellungen");
	return res;
}

export const saveOrgRole = safeAction("saveOrgRole", saveOrgRoleImpl);
export const deleteOrgRole = safeAction("deleteOrgRole", deleteOrgRoleImpl);
export const setMemberRoles = safeAction("setMemberRoles", setMemberRolesImpl);
