import { eq } from "drizzle-orm";
import { resolutions } from "@/db/schema";
import type { EntityKind } from "@/db/schema/enums";
import { requestApproval } from "@/lib/approvals/service";
import type { AuditInput } from "@/lib/audit";
import { nextResolutionNumber } from "@/lib/compliance/catalog/resolutions-required";
import type { OrgTx } from "@/lib/db/with-org";

export type ResolutionDraft = {
	subject: string;
	decisionText: string;
	body: "management" | "supervisory" | "shareholders";
	date: string;
	legalBasis?: string | null;
	requiredCode?: string | null;
	linkedEntityType?: EntityKind | null;
	linkedEntityId?: string | null;
	attendeeUserIds?: string[];
	minutesEvidenceId?: string | null;
	requestApproval: boolean;
	selfApprovalReason?: string;
};

export type ResolutionCreated = {
	id: string;
	number: string;
	approval: "none" | "pending" | "approved";
	approvalSkipped?: "no_approver";
};

// Beschluss erfassen (Register, Nummernkreis, Freigabe management_approval).
// Aufgerufen aus dem Beschlussregister und aus der Managementbewertung;
// der Audit-Eintrag geht an den Aufrufer (letzte Anweisung der Transaktion).
export async function insertResolution(
	tx: OrgTx,
	actor: { orgId: string; userId: string; name: string },
	d: ResolutionDraft,
): Promise<
	| { ok: true; data: ResolutionCreated; audit: AuditInput }
	| { ok: false; error: string }
> {
	const existing = await tx
		.select({ n: resolutions.resolutionNumber })
		.from(resolutions)
		.where(eq(resolutions.organizationId, actor.orgId));
	const number = nextResolutionNumber(existing.map((x) => x.n));
	const [row] = await tx
		.insert(resolutions)
		.values({
			organizationId: actor.orgId,
			resolutionNumber: number,
			date: d.date,
			body: d.body,
			subject: d.subject,
			decisionText: d.decisionText,
			legalBasis: d.legalBasis ?? null,
			requiredCode: d.requiredCode ?? null,
			linkedEntityType: d.linkedEntityType ?? null,
			linkedEntityId: d.linkedEntityId ?? null,
			attendeeUserIds: d.attendeeUserIds ?? [],
			minutesEvidenceId: d.minutesEvidenceId ?? null,
			createdByUserId: actor.userId,
		})
		.returning({ id: resolutions.id });
	if (!row) throw new Error("insert failed");
	let approval: ResolutionCreated["approval"] = "none";
	let approvalSkipped: ResolutionCreated["approvalSkipped"];
	if (d.requestApproval) {
		const r = await requestApproval(tx, actor, {
			kind: "management_approval",
			entityType: "resolution",
			entityId: row.id,
			title: `${number} · ${d.subject}`,
			link: "/beschluesse",
			selfApprovalReason: d.selfApprovalReason,
		});
		if (r.ok) {
			await tx
				.update(resolutions)
				.set({ approvalRequestId: r.requestId })
				.where(eq(resolutions.id, row.id));
			approval = r.status === "approved" ? "approved" : "pending";
		} else if (r.error === "no_approver") {
			// Niemand hält die Pflichtfunktion (z. B. frische Organisation):
			// der Beschluss wird trotzdem erfasst — die Leitung dokumentiert
			// selbst —, die Oberfläche weist auf die unbesetzte Funktion hin.
			approvalSkipped = "no_approver";
		} else if (r.error !== "workflow_disabled") {
			return { ok: false, error: r.error };
		}
	}
	return {
		ok: true,
		data: { id: row.id, number, approval, approvalSkipped },
		audit: {
			action: "resolution.create",
			target: `resolution:${row.id}`,
			after: {
				number,
				subject: d.subject,
				body: d.body,
				date: d.date,
				requiredCode: d.requiredCode ?? null,
				linked: d.linkedEntityType
					? `${d.linkedEntityType}:${d.linkedEntityId}`
					: null,
				approval,
			},
		},
	};
}
