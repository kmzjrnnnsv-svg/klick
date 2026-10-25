import { eq } from "drizzle-orm";
import { suspiciousReports } from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import { nextSuspiciousRef } from "@/lib/compliance/aml";
import { functionResponsible } from "@/lib/compliance/function-holders-service";
import { encryptJson, fieldAad } from "@/lib/crypto/org-dek";
import type { OrgTx } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { orgOwnerIds } from "@/lib/org/queries";

// Verdachtsfälle (§ 43 GwG, goAML) und STOR (Art. 92 MiCAR) anlegen — aus der
// Oberfläche und ohne Sitzung (Export aus both.money). Kein PII-Feld; die
// Entscheidungsnotiz ist feldverschlüsselt. Ohne handelnde Person ist die
// zuständige Funktion verantwortlich, sonst die erste Inhaber:in.

export type NewSuspiciousReport = {
	kind: "gwg_sar" | "micar_stor";
	detectedAt: Date;
	category?: string | null;
	incidentId?: string | null;
	ownerUserId?: string | null;
	decisionNote?: string | null;
};

export async function createSuspiciousReport(
	tx: OrgTx,
	ctx: { orgId: string; userId: string | null },
	d: NewSuspiciousReport,
	opts: { source?: string } = {},
): Promise<{
	id: string;
	internalRef: string;
	ownerUserId: string | null;
	audit: AuditInput;
}> {
	const existing = await tx
		.select({ ref: suspiciousReports.internalRef })
		.from(suspiciousReports)
		.where(eq(suspiciousReports.organizationId, ctx.orgId));
	const internalRef = nextSuspiciousRef(
		existing.map((e) => e.ref),
		d.kind,
	);
	const owner =
		d.ownerUserId ??
		(await functionResponsible(
			tx,
			ctx.orgId,
			d.kind === "micar_stor" ? "compliance" : "aml_officer",
		)) ??
		ctx.userId ??
		(await orgOwnerIds(tx, ctx.orgId))[0] ??
		null;
	const [row] = await tx
		.insert(suspiciousReports)
		.values({
			organizationId: ctx.orgId,
			kind: d.kind,
			internalRef,
			detectedAt: d.detectedAt,
			category: d.category ?? null,
			incidentId: d.incidentId ?? null,
			ownerUserId: owner,
		})
		.returning({ id: suspiciousReports.id });
	if (!row) throw new Error("insert failed");
	if (d.decisionNote)
		await tx
			.update(suspiciousReports)
			.set({
				decisionNote: await encryptJson(
					tx,
					ctx.orgId,
					d.decisionNote,
					fieldAad("suspicious_reports", row.id, "decision_note"),
				),
			})
			.where(eq(suspiciousReports.id, row.id));
	await notify(tx, {
		orgId: ctx.orgId,
		recipients: [owner],
		actorUserId: ctx.userId,
		kind: "task_assigned",
		title: `${internalRef}: ${d.kind === "micar_stor" ? "STOR" : "Verdachtsfall"} zur Prüfung`,
		body: "Entscheidung über Meldung dokumentieren — Durchführungsverbot und Tipping-off beachten.",
		link: "/aml?tab=verdacht",
	});
	return {
		id: row.id,
		internalRef,
		ownerUserId: owner,
		audit: {
			action: "suspicious_report.create",
			target: `suspicious_report:${row.id}`,
			after: {
				internalRef,
				kind: d.kind,
				category: d.category ?? null,
				...(opts.source ? { source: opts.source } : {}),
			},
		},
	};
}
