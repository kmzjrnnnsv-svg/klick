"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { resolutions } from "@/db/schema";
import type { EntityKind } from "@/db/schema/enums";
import { requestApproval } from "@/lib/approvals/service";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { nextResolutionNumber } from "@/lib/compliance/catalog/resolutions-required";
import { mutateOrg } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import { resolutionSchema } from "@/lib/validation/governance";

// Beschlussregister (DORA Art. 5, MiCAR Art. 68, ZAG-MaRisk AT 4.2, GwG § 5):
// Jeder Beschluss ist ein Datensatz; standardmäßig läuft er durch den
// Workflow management_approval (Genehmigung durch das Leitungsorgan). Ohne
// aktiven Workflow gilt der Beschluss sofort — die Leitung dokumentiert selbst.
export async function createResolution(input: unknown): Promise<
	ActionResult<{
		id: string;
		number: string;
		approval: "none" | "pending" | "approved";
	}>
> {
	const c = await requireOrg({ resolution: ["create"] });
	const parsed = resolutionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<
		ActionResult<{
			id: string;
			number: string;
			approval: "none" | "pending" | "approved";
		}>
	>(toOrgCtx(c), async (tx) => {
		const existing = await tx
			.select({ n: resolutions.resolutionNumber })
			.from(resolutions)
			.where(eq(resolutions.organizationId, c.orgId));
		const number = nextResolutionNumber(existing.map((x) => x.n));
		const [row] = await tx
			.insert(resolutions)
			.values({
				organizationId: c.orgId,
				resolutionNumber: number,
				date: d.date,
				body: d.body,
				subject: d.subject,
				decisionText: d.decisionText,
				legalBasis: d.legalBasis ?? null,
				requiredCode: d.requiredCode ?? null,
				linkedEntityType: (d.linkedEntityType as EntityKind | null) ?? null,
				linkedEntityId: d.linkedEntityId ?? null,
				attendeeUserIds: d.attendeeUserIds ?? [],
				minutesEvidenceId: d.minutesEvidenceId ?? null,
				createdByUserId: c.userId,
			})
			.returning({ id: resolutions.id });
		if (!row) throw new Error("insert failed");
		let approval: "none" | "pending" | "approved" = "none";
		if (d.requestApproval) {
			const r = await requestApproval(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name },
				{
					kind: "management_approval",
					entityType: "resolution",
					entityId: row.id,
					title: `${number} · ${d.subject}`,
					link: "/beschluesse",
					selfApprovalReason: d.selfApprovalReason,
				},
			);
			if (r.ok) {
				await tx
					.update(resolutions)
					.set({ approvalRequestId: r.requestId })
					.where(eq(resolutions.id, row.id));
				approval = r.status === "approved" ? "approved" : "pending";
			} else if (r.error !== "workflow_disabled") {
				return { result: { ok: false, error: r.error }, audit: [] };
			}
		}
		return {
			result: { ok: true, data: { id: row.id, number, approval } },
			audit: {
				action: "resolution.create",
				target: `resolution:${row.id}`,
				after: {
					number,
					subject: d.subject,
					body: d.body,
					date: d.date,
					requiredCode: d.requiredCode ?? null,
					approval,
				},
			},
		};
	});
	revalidatePath("/beschluesse");
	revalidatePath("/ueberblick");
	return res;
}
