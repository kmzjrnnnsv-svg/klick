"use server";

import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { member } from "@/db/auth-schema";
import {
	controlImplementations,
	controls,
	orgRoles,
	orgSettings,
	roleAssignments,
} from "@/db/schema";
import type { FunctionKey } from "@/db/schema/enums";
import { safeAction } from "@/lib/actions/safe";
import { AuthError, requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { canHoldOwnRole } from "@/lib/auth/permission-catalog";
import { normalizeRole } from "@/lib/auth/session-rules";
import { proposeAssignment } from "@/lib/compliance/appointment-service";
import { areaOf } from "@/lib/compliance/catalog/domain-functions";
import { loadAssignments } from "@/lib/compliance/function-holders-service";
import {
	assignmentColumns,
	functionKeyOf,
	ownRoleIdOf,
} from "@/lib/compliance/function-key";
import { syncOwnersAndNotify } from "@/lib/compliance/function-owners";
import { wouldCycle } from "@/lib/compliance/org-chart";
import { mutateOrg } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	assignAreaSchema,
	boardAssignSchema,
	reportsToSchema,
} from "@/lib/validation/role-board";

// Rollen-Tafel, Bereiche und Organigramm (ADR-024, individueller Modus).
// Ziehen und das Menü „Zuordnen zu …“ rufen dieselben Aktionen. Besetzen
// läuft immer über die Bestellung durch die Geschäftsleitung; Bereiche und
// Berichtswege wirken sofort (wie unter /organisation). Alles mit Step-up.

const PATH = "/organisation";

async function stepUp(perm: Parameters<typeof requireStepUp>[0]) {
	try {
		return await requireStepUp(perm);
	} catch (e) {
		if (e instanceof AuthError && e.code === "step_up_required") return null;
		throw e;
	}
}

type Placed = {
	id: string;
	status: string;
	waiting: null | "approval" | "no_management";
};

async function boardAssignImpl(input: unknown): Promise<ActionResult<Placed>> {
	const c = await stepUp({ role_assignment: ["update"] });
	if (!c) return { ok: false, error: "step_up_required" };
	const parsed = boardAssignSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<ActionResult<Placed>>(toOrgCtx(c), async (tx) => {
		const cols = assignmentColumns(d.fn);
		if (cols.orgRoleId) {
			const [role] = await tx
				.select({ id: orgRoles.id })
				.from(orgRoles)
				.where(
					and(
						eq(orgRoles.organizationId, c.orgId),
						eq(orgRoles.id, cols.orgRoleId),
					),
				)
				.limit(1);
			if (!role) return { result: { ok: false, error: "notFound" }, audit: [] };
		}
		if (d.userId) {
			const [m] = await tx
				.select({ role: member.role })
				.from(member)
				.where(
					and(eq(member.organizationId, c.orgId), eq(member.userId, d.userId)),
				)
				.limit(1);
			if (!m) return { result: { ok: false, error: "notFound" }, audit: [] };
			// eigene Rollen nie für Externe (ADR-018)
			if (cols.orgRoleId && !canHoldOwnRole(normalizeRole(m.role)))
				return {
					result: { ok: false, error: "rolesNotAllowed" },
					audit: [],
				};
		}
		// schon besetzt oder vorgeschlagen: nichts zu tun
		const rows = await tx
			.select({
				id: roleAssignments.id,
				function: roleAssignments.function,
				orgRoleId: roleAssignments.orgRoleId,
				userId: roleAssignments.userId,
				pendingEmail: roleAssignments.pendingEmail,
				status: roleAssignments.status,
			})
			.from(roleAssignments)
			.where(
				and(
					eq(roleAssignments.organizationId, c.orgId),
					ne(roleAssignments.status, "revoked"),
					ne(roleAssignments.status, "rejected"),
				),
			);
		const email = d.pendingEmail?.toLowerCase() ?? null;
		const same = rows.find(
			(r) =>
				functionKeyOf(r) === d.fn &&
				(d.userId ? r.userId === d.userId : r.pendingEmail === email),
		);
		if (same)
			return {
				result: {
					ok: true,
					data: { id: same.id, status: same.status, waiting: null },
				},
				audit: [],
			};
		const from = d.fromId ? rows.find((r) => r.id === d.fromId) : undefined;
		if (d.fromId && !from)
			return { result: { ok: false, error: "notFound" }, audit: [] };
		const out = await proposeAssignment(
			tx,
			{ orgId: c.orgId, userId: c.userId, name: c.name },
			{
				...cols,
				userId: d.userId ?? null,
				pendingEmail: email,
				// aus einer anderen Rolle gezogen: die bisherige endet mit der
				// Bestellung der neuen
				replacesAssignmentId: from?.id ?? null,
			},
			"board",
		);
		return {
			result: {
				ok: true,
				data: { id: out.id, status: out.status, waiting: out.waiting },
			},
			audit: out.audit,
		};
	});
	revalidatePath(PATH);
	revalidatePath("/ueberblick");
	return res;
}

async function assignAreaImpl(
	input: unknown,
): Promise<ActionResult<{ count: number }>> {
	const c = await stepUp({ control: ["assign"] });
	if (!c) return { ok: false, error: "step_up_required" };
	const parsed = assignAreaSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<ActionResult<{ count: number }>>(
		toOrgCtx(c),
		async (tx) => {
			// nur besetzte Funktionen: sonst bliebe niemand verantwortlich
			const held = new Set(
				(await loadAssignments(tx, c.orgId)).map((a) => a.function),
			);
			if (!held.has(d.fn))
				return { result: { ok: false, error: "vacant" }, audit: [] };
			const [cur] = await tx
				.select({ areaFunctions: orgSettings.areaFunctions })
				.from(orgSettings)
				.where(eq(orgSettings.organizationId, c.orgId))
				.limit(1);
			await tx
				.update(orgSettings)
				.set({
					areaFunctions: { ...(cur?.areaFunctions ?? {}), [d.area]: d.fn },
				})
				.where(eq(orgSettings.organizationId, c.orgId));
			const rows = await tx
				.select({
					id: controlImplementations.id,
					code: controls.code,
					domain: controls.domain,
				})
				.from(controlImplementations)
				.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
				.where(
					and(
						eq(controlImplementations.organizationId, c.orgId),
						d.all ? undefined : isNull(controlImplementations.ownerFunction),
					),
				);
			const ids = rows.filter((r) => areaOf(r) === d.area).map((r) => r.id);
			if (ids.length > 0)
				await tx
					.update(controlImplementations)
					.set({ ownerFunction: d.fn })
					.where(inArray(controlImplementations.id, ids));
			await syncOwnersAndNotify(tx, c.orgId, c.userId);
			return {
				result: { ok: true, data: { count: ids.length } },
				audit: {
					action: "control.owner_areas_assigned",
					target: `org:${c.orgId}`,
					before: { area: d.area, fn: cur?.areaFunctions?.[d.area] ?? null },
					after: {
						area: d.area,
						fn: d.fn,
						all: d.all,
						count: ids.length,
						via: "board",
					},
				},
			};
		},
	);
	revalidatePath(PATH);
	revalidatePath("/controls");
	return res;
}

async function setReportsToImpl(input: unknown): Promise<ActionResult> {
	const c = await stepUp({ role_assignment: ["update"] });
	if (!c) return { ok: false, error: "step_up_required" };
	const parsed = reportsToSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	if (d.fn === "management_body") return { ok: false, error: "managementTop" };
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		// derzeitiger Baum: Katalog aus den Besetzungen, eigene Rollen aus
		// org_roles; ohne Angabe direkt an die Geschäftsleitung
		const rows = await tx
			.select({
				function: roleAssignments.function,
				orgRoleId: roleAssignments.orgRoleId,
				reportsTo: roleAssignments.reportsToFunction,
			})
			.from(roleAssignments)
			.where(
				and(
					eq(roleAssignments.organizationId, c.orgId),
					ne(roleAssignments.status, "revoked"),
					ne(roleAssignments.status, "rejected"),
				),
			);
		const roles = await tx
			.select({ id: orgRoles.id, reportsTo: orgRoles.reportsTo })
			.from(orgRoles)
			.where(eq(orgRoles.organizationId, c.orgId));
		const parents = new Map<FunctionKey, FunctionKey | null>();
		for (const r of rows) {
			if (r.orgRoleId) continue;
			const key = functionKeyOf(r);
			if (!parents.get(key)) parents.set(key, r.reportsTo ?? null);
		}
		for (const r of roles)
			parents.set(`role:${r.id}`, (r.reportsTo as FunctionKey | null) ?? null);
		if (wouldCycle(parents, d.fn, d.parent))
			return { result: { ok: false, error: "cycle" }, audit: [] };
		const before = parents.get(d.fn) ?? null;
		const roleId = ownRoleIdOf(d.fn);
		if (roleId)
			await tx
				.update(orgRoles)
				.set({ reportsTo: d.parent })
				.where(
					and(eq(orgRoles.organizationId, c.orgId), eq(orgRoles.id, roleId)),
				);
		else
			await tx
				.update(roleAssignments)
				.set({ reportsToFunction: d.parent })
				.where(
					and(
						eq(roleAssignments.organizationId, c.orgId),
						isNull(roleAssignments.orgRoleId),
						eq(
							roleAssignments.function,
							d.fn as (typeof roleAssignments.function.enumValues)[number],
						),
						ne(roleAssignments.status, "revoked"),
					),
				);
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "org_chart.reports_to",
				target: `function:${d.fn}`,
				before: { parent: before },
				after: { parent: d.parent },
			},
		};
	});
	revalidatePath(PATH);
	return res;
}

export const boardAssign = safeAction("boardAssign", boardAssignImpl);
export const assignArea = safeAction("assignArea", assignAreaImpl);
export const setReportsTo = safeAction("setReportsTo", setReportsToImpl);
