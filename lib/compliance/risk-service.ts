import { eq } from "drizzle-orm";
import { risks, riskTreatments, tasks } from "@/db/schema";
import type { RiskMethod } from "@/db/schema/platform";
import { requestApproval } from "@/lib/approvals/service";
import type { OrgTx } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { assessRisk, type RiskLike } from "./risk";

// Gemeinsame Schritte für Risiko-Actions (Schnellanlage, Assistent, Status):
// Maßnahme = Aufgabe + risk_treatments-Zeile; Akzeptanz je Zone (akzeptabel
// direkt, tolerierbar mit Begründung, nicht tolerierbar per Freigabe
// risk_acceptance). Aufrufer laufen in mutateOrg und schreiben das Audit.

type Actor = { orgId: string; userId: string; name: string };

export async function insertTreatment(
	tx: OrgTx,
	c: Actor,
	input: {
		riskId: string;
		riskCode: string;
		title: string;
		description?: string | null;
		ownerUserId?: string | null;
		dueAt?: string | null;
		costEur?: number | null;
	},
): Promise<{ treatmentId: string; taskId: string | null }> {
	const owner = input.ownerUserId ?? c.userId;
	const [task] = await tx
		.insert(tasks)
		.values({
			organizationId: c.orgId,
			title: `${input.riskCode}: ${input.title}`,
			description: input.description ?? null,
			assigneeUserId: owner,
			createdByUserId: c.userId,
			dueAt: input.dueAt ?? null,
			entityType: "risk",
			entityId: input.riskId,
			sourceKind: "treatment",
		})
		.returning({ id: tasks.id });
	const [row] = await tx
		.insert(riskTreatments)
		.values({
			organizationId: c.orgId,
			riskId: input.riskId,
			title: input.title,
			description: input.description ?? null,
			ownerUserId: owner,
			dueAt: input.dueAt ?? null,
			costEur: input.costEur ?? null,
			taskId: task?.id ?? null,
		})
		.returning({ id: riskTreatments.id });
	if (!row) throw new Error("insert failed");
	await notify(tx, {
		orgId: c.orgId,
		recipients: [owner],
		actorUserId: c.userId,
		kind: "task_assigned",
		title: `Maßnahme: ${input.title}`,
		link: `/risiken/${input.riskId}`,
	});
	return { treatmentId: row.id, taskId: task?.id ?? null };
}

export type AcceptanceResult =
	| { status: "accepted"; selfApproved: boolean; requestId?: string }
	| { status: "pending"; requestId: string }
	| { status: "failed"; error: string };

export async function acceptRisk(
	tx: OrgTx,
	c: Actor,
	risk: RiskLike & {
		code: string;
		title: string;
		ownerUserId: string | null;
	},
	method: RiskMethod,
	opts: { selfApprovalReason?: string } = {},
): Promise<AcceptanceResult> {
	const a = assessRisk(risk, method);
	if (a.aboveAppetite) {
		const r = await requestApproval(tx, c, {
			kind: "risk_acceptance",
			entityType: "risk",
			entityId: risk.id,
			entityOwnerUserId: risk.ownerUserId,
			title: `${risk.code} · ${risk.title}`,
			link: `/risiken/${risk.id}`,
			selfApprovalReason: opts.selfApprovalReason,
		});
		if (!r.ok) return { status: "failed", error: r.error };
		if (r.status === "pending")
			return { status: "pending", requestId: r.requestId };
		await tx
			.update(risks)
			.set({
				status: "accepted",
				acceptedByUserId: c.userId,
				acceptedAt: new Date(),
			})
			.where(eq(risks.id, risk.id));
		return {
			status: "accepted",
			selfApproved: r.selfApproved,
			requestId: r.requestId,
		};
	}
	await tx
		.update(risks)
		.set({
			status: "accepted",
			acceptedByUserId: c.userId,
			acceptedAt: new Date(),
		})
		.where(eq(risks.id, risk.id));
	return { status: "accepted", selfApproved: false };
}

export async function notifyAboveAppetite(
	tx: OrgTx,
	c: Actor,
	risk: { id: string; code: string; ownerUserId: string | null },
	effective: { score: number; label: string },
	actorUserId: string | null = c.userId,
) {
	await notify(tx, {
		orgId: c.orgId,
		recipients: [risk.ownerUserId ?? c.userId],
		actorUserId,
		kind: "risk_above_appetite",
		title: `${risk.code} liegt über dem Risikoappetit (${effective.label}, Wert ${effective.score})`,
		link: `/risiken/${risk.id}`,
	});
}

export function plusMonths(months: number, from = new Date()): string {
	const d = new Date(from);
	d.setMonth(d.getMonth() + months);
	return d.toISOString().slice(0, 10);
}
