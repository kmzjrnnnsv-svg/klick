"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	complaints,
	roleAssignments,
	whistleblowingReports,
} from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import {
	complaintDeadlines,
	nextCaseCode,
	whistleblowingDeadlines,
} from "@/lib/compliance/complaints";
import { encryptJson, fieldAad } from "@/lib/crypto/org-dek";
import { mutateOrg } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	complaintSchema,
	complaintTransitionSchema,
	whistleblowingSchema,
	whistleblowingTransitionSchema,
} from "@/lib/validation/governance";

const PATH = "/beschwerden";

// ── Beschwerden (MiCAR Art. 71, ZAG § 62) ──────────────────────────────────

async function upsertComplaintImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; code: string }>> {
	const c = await requireOrg({ complaint: ["create", "update"] });
	const parsed = complaintSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, complainantRef, ...d } = parsed.data;
	const res = await mutateOrg<{ id: string; code: string } | null>(
		toOrgCtx(c),
		async (tx) => {
			if (id) {
				const [before] = await tx
					.select()
					.from(complaints)
					.where(
						and(eq(complaints.id, id), eq(complaints.organizationId, c.orgId)),
					)
					.limit(1);
				if (!before) return { result: null, audit: [] };
				const enc =
					complainantRef === undefined
						? before.complainantRef
						: complainantRef
							? await encryptJson(
									tx,
									c.orgId,
									complainantRef,
									fieldAad("complaints", id, "complainant_ref"),
								)
							: null;
				await tx
					.update(complaints)
					.set({
						channel: d.channel ?? before.channel,
						category: d.category ?? before.category,
						description: d.description ?? before.description,
						complainantRef: enc,
						ownerUserId: d.ownerUserId ?? before.ownerUserId,
						outcome: d.outcome ?? before.outcome,
						escalatedToRegulator:
							d.escalatedToRegulator ?? before.escalatedToRegulator,
					})
					.where(eq(complaints.id, id));
				return {
					result: { id, code: before.code },
					audit: {
						action: "complaint.update",
						target: `complaint:${id}`,
						before: {
							category: before.category,
							ownerUserId: before.ownerUserId,
							escalated: before.escalatedToRegulator,
						},
						after: {
							category: d.category ?? before.category,
							ownerUserId: d.ownerUserId ?? before.ownerUserId,
							escalated: d.escalatedToRegulator ?? before.escalatedToRegulator,
						},
					},
				};
			}
			const existing = await tx
				.select({ code: complaints.code })
				.from(complaints)
				.where(eq(complaints.organizationId, c.orgId));
			const code = nextCaseCode(
				existing.map((x) => x.code),
				"BES",
			);
			const dl = complaintDeadlines(d.receivedAt);
			const [owner] = await tx
				.select({ userId: roleAssignments.userId })
				.from(roleAssignments)
				.where(
					and(
						eq(roleAssignments.organizationId, c.orgId),
						eq(roleAssignments.function, "compliance"),
					),
				)
				.limit(1);
			const ownerUserId = d.ownerUserId ?? owner?.userId ?? c.userId;
			const [row] = await tx
				.insert(complaints)
				.values({
					organizationId: c.orgId,
					code,
					receivedAt: d.receivedAt,
					channel: d.channel ?? null,
					category: d.category ?? null,
					description: d.description ?? null,
					ackDueAt: dl.ackDueAt,
					responseDueAt: dl.responseDueAt,
					ownerUserId,
					escalatedToRegulator: d.escalatedToRegulator ?? false,
				})
				.returning({ id: complaints.id });
			if (!row) throw new Error("insert failed");
			if (complainantRef)
				await tx
					.update(complaints)
					.set({
						complainantRef: await encryptJson(
							tx,
							c.orgId,
							complainantRef,
							fieldAad("complaints", row.id, "complainant_ref"),
						),
					})
					.where(eq(complaints.id, row.id));
			await notify(tx, {
				orgId: c.orgId,
				recipients: [ownerUserId],
				actorUserId: c.userId,
				kind: "task_assigned",
				title: `Beschwerde ${code} eingegangen`,
				body: `Eingangsbestätigung bis ${dl.ackDueAt.toLocaleDateString("de-DE")}, Antwort bis ${dl.responseDueAt.toLocaleDateString("de-DE")}.`,
				link: PATH,
			});
			return {
				result: { id: row.id, code },
				audit: {
					action: "complaint.create",
					target: `complaint:${row.id}`,
					after: {
						code,
						category: d.category ?? null,
						channel: d.channel ?? null,
						receivedAt: d.receivedAt,
					},
				},
			};
		},
	);
	revalidatePath(PATH);
	return res ? { ok: true, data: res } : { ok: false, error: "notFound" };
}

async function transitionComplaintImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ complaint: ["update"] });
	const parsed = complaintTransitionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, to, note } = parsed.data;
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select()
			.from(complaints)
			.where(and(eq(complaints.id, id), eq(complaints.organizationId, c.orgId)))
			.limit(1);
		if (!row) return { result: false, audit: [] };
		const now = new Date();
		await tx
			.update(complaints)
			.set({
				status: to,
				acknowledgedAt:
					to === "acknowledged"
						? (row.acknowledgedAt ?? now)
						: row.acknowledgedAt,
				resolvedAt:
					to === "resolved" || to === "closed"
						? (row.resolvedAt ?? now)
						: to === "open"
							? null
							: row.resolvedAt,
				outcome: note
					? `${row.outcome ? `${row.outcome}\n` : ""}${note}`
					: row.outcome,
			})
			.where(eq(complaints.id, id));
		return {
			result: true,
			audit: {
				action: "complaint.status",
				target: `complaint:${id}`,
				before: { status: row.status },
				after: { status: to, note: note ?? null },
			},
		};
	});
	revalidatePath(PATH);
	return ok ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
}

// ── Hinweisgebermeldungen (HinSchG, MiCAR Art. 116, GwG § 6 Abs. 5) ────────

async function upsertWhistleblowingReportImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; ref: string }>> {
	const c = await requireOrg({ whistleblowing: ["create", "update"] });
	const parsed = whistleblowingSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, summary, ...d } = parsed.data;
	const res = await mutateOrg<{ id: string; ref: string } | null>(
		toOrgCtx(c),
		async (tx) => {
			if (id) {
				const [before] = await tx
					.select()
					.from(whistleblowingReports)
					.where(
						and(
							eq(whistleblowingReports.id, id),
							eq(whistleblowingReports.organizationId, c.orgId),
						),
					)
					.limit(1);
				if (!before) return { result: null, audit: [] };
				await tx
					.update(whistleblowingReports)
					.set({
						channel: d.channel ?? before.channel,
						category: d.category ?? before.category,
						ownerFunction: d.ownerFunction,
						summary:
							summary === undefined
								? before.summary
								: summary
									? await encryptJson(
											tx,
											c.orgId,
											summary,
											fieldAad("whistleblowing_reports", id, "summary"),
										)
									: null,
					})
					.where(eq(whistleblowingReports.id, id));
				return {
					result: { id, ref: before.internalRef },
					audit: {
						action: "whistleblowing.update",
						target: `whistleblowing_report:${id}`,
						before: {
							category: before.category,
							ownerFunction: before.ownerFunction,
						},
						after: {
							category: d.category ?? before.category,
							ownerFunction: d.ownerFunction,
						},
					},
				};
			}
			const existing = await tx
				.select({ ref: whistleblowingReports.internalRef })
				.from(whistleblowingReports)
				.where(eq(whistleblowingReports.organizationId, c.orgId));
			const ref = nextCaseCode(
				existing.map((x) => x.ref),
				"HIN",
			);
			const dl = whistleblowingDeadlines(d.receivedAt);
			const [row] = await tx
				.insert(whistleblowingReports)
				.values({
					organizationId: c.orgId,
					internalRef: ref,
					receivedAt: d.receivedAt,
					channel: d.channel ?? null,
					category: d.category ?? null,
					ackDueAt: dl.ackDueAt,
					feedbackDueAt: dl.feedbackDueAt,
					ownerFunction: d.ownerFunction,
				})
				.returning({ id: whistleblowingReports.id });
			if (!row) throw new Error("insert failed");
			if (summary)
				await tx
					.update(whistleblowingReports)
					.set({
						summary: await encryptJson(
							tx,
							c.orgId,
							summary,
							fieldAad("whistleblowing_reports", row.id, "summary"),
						),
					})
					.where(eq(whistleblowingReports.id, row.id));
			// Benachrichtigung an die zuständige Funktion (ohne Inhalt)
			const holders = await tx
				.select({ userId: roleAssignments.userId })
				.from(roleAssignments)
				.where(
					and(
						eq(roleAssignments.organizationId, c.orgId),
						eq(roleAssignments.function, d.ownerFunction),
					),
				);
			await notify(tx, {
				orgId: c.orgId,
				recipients: holders.map((h) => h.userId),
				actorUserId: c.userId,
				kind: "task_assigned",
				title: `Hinweis ${ref} eingegangen`,
				body: `Bestätigung bis ${dl.ackDueAt.toLocaleDateString("de-DE")}, Rückmeldung bis ${dl.feedbackDueAt.toLocaleDateString("de-DE")}.`,
				link: `${PATH}?tab=hinweise`,
			});
			return {
				result: { id: row.id, ref },
				audit: {
					action: "whistleblowing.create",
					target: `whistleblowing_report:${row.id}`,
					// bewusst ohne Inhalt: nur Referenz und Fristen
					after: {
						ref,
						receivedAt: d.receivedAt,
						ownerFunction: d.ownerFunction,
					},
				},
			};
		},
	);
	revalidatePath(PATH);
	return res ? { ok: true, data: res } : { ok: false, error: "notFound" };
}

async function transitionWhistleblowingReportImpl(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ whistleblowing: ["update"] });
	const parsed = whistleblowingTransitionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, to } = parsed.data;
	const ok = await mutateOrg<boolean>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select()
			.from(whistleblowingReports)
			.where(
				and(
					eq(whistleblowingReports.id, id),
					eq(whistleblowingReports.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!row) return { result: false, audit: [] };
		const now = new Date();
		await tx
			.update(whistleblowingReports)
			.set({
				status: to,
				acknowledgedAt:
					to === "acknowledged"
						? (row.acknowledgedAt ?? now)
						: row.acknowledgedAt,
				feedbackAt: to === "closed" ? (row.feedbackAt ?? now) : row.feedbackAt,
			})
			.where(eq(whistleblowingReports.id, id));
		return {
			result: true,
			audit: {
				action: "whistleblowing.status",
				target: `whistleblowing_report:${id}`,
				before: { status: row.status },
				after: { status: to },
			},
		};
	});
	revalidatePath(PATH);
	return ok ? { ok: true, data: undefined } : { ok: false, error: "notFound" };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const upsertComplaint = safeAction(
	"upsertComplaint",
	upsertComplaintImpl,
);
export const transitionComplaint = safeAction(
	"transitionComplaint",
	transitionComplaintImpl,
);
export const upsertWhistleblowingReport = safeAction(
	"upsertWhistleblowingReport",
	upsertWhistleblowingReportImpl,
);
export const transitionWhistleblowingReport = safeAction(
	"transitionWhistleblowingReport",
	transitionWhistleblowingReportImpl,
);
