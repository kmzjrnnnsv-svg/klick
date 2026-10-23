"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { managementReports, roleAssignments } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { REPORT_KIND_BY_KEY } from "@/lib/compliance/catalog/management-reports";
import { reportFigures } from "@/lib/compliance/management-report-figures";
import { mutateOrg } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	managementReportIdSchema,
	managementReportSchema,
} from "@/lib/validation/management-reports";

// Berichte an die Geschäftsleitung (N3): Entwurf anlegen und bearbeiten,
// vorlegen (Kennzahlen als Schnappschuss, Geschäftsleitung benachrichtigt),
// Entwurf löschen. Die Kenntnisnahme ist eine Unterschrift unter dem
// erzeugten Nachweis NW-GL-BERICHT.

const PATH = "/berichte";

async function saveManagementReportImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ management_review: ["create"] });
	const parsed = managementReportSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, ...d } = parsed.data;
	const values = {
		kind: d.kind,
		title: d.title,
		periodFrom: d.periodFrom,
		periodTo: d.periodTo,
		summary: d.summary?.trim() || null,
		measures: d.measures?.trim() || null,
	};
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			if (id) {
				const [before] = await tx
					.select()
					.from(managementReports)
					.where(
						and(
							eq(managementReports.id, id),
							eq(managementReports.organizationId, c.orgId),
						),
					)
					.limit(1);
				if (!before)
					return { result: { ok: false, error: "notFound" }, audit: [] };
				// vorgelegte Berichte bleiben, wie sie sind
				if (before.status !== "draft")
					return { result: { ok: false, error: "locked" }, audit: [] };
				await tx
					.update(managementReports)
					.set({ ...values, updatedAt: new Date() })
					.where(eq(managementReports.id, id));
				return {
					result: { ok: true, data: { id } },
					audit: {
						action: "management_report.updated",
						target: `management_report:${id}`,
						before: { ...before, figures: undefined },
						after: values,
					},
				};
			}
			const [row] = await tx
				.insert(managementReports)
				.values({
					organizationId: c.orgId,
					...values,
					authorFunction: REPORT_KIND_BY_KEY.get(d.kind)?.author ?? null,
					authorUserId: c.userId,
				})
				.returning({ id: managementReports.id });
			if (!row) return { result: { ok: false, error: "error" }, audit: [] };
			return {
				result: { ok: true, data: { id: row.id } },
				audit: {
					action: "management_report.created",
					target: `management_report:${row.id}`,
					after: values,
				},
			};
		},
	);
	revalidatePath(PATH);
	return res;
}

async function submitManagementReportImpl(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ management_review: ["update"] });
	const parsed = managementReportIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const [r] = await tx
			.select()
			.from(managementReports)
			.where(
				and(
					eq(managementReports.id, parsed.data.id),
					eq(managementReports.organizationId, c.orgId),
				),
			)
			.limit(1);
		const kind = r ? REPORT_KIND_BY_KEY.get(r.kind) : undefined;
		if (!r || !kind)
			return { result: { ok: false, error: "notFound" }, audit: [] };
		if (r.status !== "draft")
			return { result: { ok: false, error: "locked" }, audit: [] };
		const figures = await reportFigures(tx, c.orgId, kind, {
			from: r.periodFrom,
			to: r.periodTo,
		});
		const now = new Date();
		await tx
			.update(managementReports)
			.set({
				status: "submitted",
				submittedAt: now,
				figures: figures as unknown as Record<string, unknown>,
				updatedAt: now,
			})
			.where(eq(managementReports.id, r.id));
		const gl = await tx
			.select({ userId: roleAssignments.userId })
			.from(roleAssignments)
			.where(
				and(
					eq(roleAssignments.organizationId, c.orgId),
					eq(roleAssignments.function, "management_body"),
				),
			);
		await notify(tx, {
			orgId: c.orgId,
			recipients: gl.map((g) => g.userId),
			actorUserId: c.userId,
			kind: "acknowledgement_due",
			title: `Bericht zur Kenntnisnahme: ${r.title}`,
			link: PATH,
		});
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "management_report.submitted",
				target: `management_report:${r.id}`,
				after: {
					kind: r.kind,
					periodFrom: r.periodFrom,
					periodTo: r.periodTo,
					sections: figures.sections.map((s) => s.key),
				},
			},
		};
	});
	revalidatePath(PATH);
	return res;
}

async function deleteManagementReportImpl(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ management_review: ["update"] });
	const parsed = managementReportIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const [r] = await tx
			.select()
			.from(managementReports)
			.where(
				and(
					eq(managementReports.id, parsed.data.id),
					eq(managementReports.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!r) return { result: { ok: false, error: "notFound" }, audit: [] };
		if (r.status !== "draft")
			return { result: { ok: false, error: "locked" }, audit: [] };
		await tx.delete(managementReports).where(eq(managementReports.id, r.id));
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "management_report.deleted",
				target: `management_report:${r.id}`,
				before: { kind: r.kind, title: r.title },
			},
		};
	});
	revalidatePath(PATH);
	return res;
}

export const saveManagementReport = safeAction(
	"saveManagementReport",
	saveManagementReportImpl,
);
export const submitManagementReport = safeAction(
	"submitManagementReport",
	submitManagementReportImpl,
);
export const deleteManagementReport = safeAction(
	"deleteManagementReport",
	deleteManagementReportImpl,
);
