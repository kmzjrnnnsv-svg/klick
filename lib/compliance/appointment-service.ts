import { and, desc, eq, inArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import {
	approvalDecisions,
	approvalRequests,
	orgSettings,
	roleAssignments,
	tasks,
} from "@/db/schema";
import type { AppointmentStatus } from "@/db/schema/enums";
import { ensureOrgWorkflows, gateApproval } from "@/lib/approvals/service";
import type { AuditInput } from "@/lib/audit";
import { effectiveAssignment } from "@/lib/compliance/appointments";
import { noticesFor } from "@/lib/compliance/catalog/appointment-notices";
import { appointable } from "@/lib/compliance/catalog/appointment-templates";
import { recipientsOf } from "@/lib/compliance/function-holders";
import { loadAssignments } from "@/lib/compliance/function-holders-service";
import { syncOwnersAndNotify } from "@/lib/compliance/function-owners";
import { userNames } from "@/lib/compliance/queries";
import type { OrgTx } from "@/lib/db/with-org";
import { berlinToday } from "@/lib/evidence-studio/queries";
import { logger } from "@/lib/log";
import { notify } from "@/lib/notifications/notify";
import { listOrgFrameworks } from "@/lib/org/queries";
import { syncTrainingAssignments } from "@/lib/trainings/assignments";

// Bestellung durch die Geschäftsleitung (Teil 1): Funktionen werden
// vorgeschlagen und wirken erst mit der Bestellung. Alle Eintragswege
// (Einrichtung, /organisation, Onboarding, Einladung) laufen hierüber.
//
//   vorschlagen → role.appoint (alle Mitglieder der GL) → bestellt
//   bestellt    → role.revoke  (alle außer der abberufenen Person) → abberufen
//
// Sonderfälle: der erste GL-Eintrag gilt direkt (sonst könnte niemand
// bestätigen); ist kein Ablauf aktiv (individueller Modus), wirkt der
// Eintrag wie früher sofort. Wirkung: Verantwortung neu rechnen, Schulungen,
// Bestellungsschreiben, Anzeigen an Behörden (Aufgaben), Benachrichtigung.

type Actor = { orgId: string; userId: string; name: string };
type Row = typeof roleAssignments.$inferSelect;

export type AppointmentValues = Omit<
	typeof roleAssignments.$inferInsert,
	"id" | "organizationId" | "status" | "proposedByUserId"
>;

export type AppointmentOutcome = {
	id: string;
	status: AppointmentStatus;
	// warum der Vorschlag noch nicht wirkt
	waiting: null | "approval" | "no_management";
	audit: AuditInput[];
};

const LINK = "/organisation?tab=rollen";

async function loadRow(tx: OrgTx, orgId: string, id: string) {
	const [row] = await tx
		.select()
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.id, id),
				eq(roleAssignments.organizationId, orgId),
			),
		)
		.limit(1);
	return row ?? null;
}

async function orgContext(tx: OrgTx, orgId: string) {
	const [s] = await tx
		.select({ stage: orgSettings.licenceStage })
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	const stage = s?.stage ?? "0_vorbereitung";
	// neue Abläufe (Bestellung, Abberufung) auch für bestehende Orgs anlegen
	await ensureOrgWorkflows(tx, orgId, stage);
	const frameworks = (await listOrgFrameworks(tx, orgId)).map((f) => f.slug);
	return { stage, frameworks };
}

async function holderLabel(tx: OrgTx, row: Row): Promise<string> {
	const names = await userNames(tx, [row.userId]);
	return (
		(row.userId ? names.get(row.userId) : null) ??
		row.externalName ??
		row.pendingEmail ??
		""
	);
}

async function title(tx: OrgTx, row: Row): Promise<string> {
	const tf = await getTranslations("Functions");
	const who = await holderLabel(tx, row);
	return [tf(row.function as never), who].filter(Boolean).join(" · ");
}

async function hasManagement(
	tx: OrgTx,
	orgId: string,
	exceptId?: string,
): Promise<boolean> {
	const rows = await tx
		.select({ id: roleAssignments.id })
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.organizationId, orgId),
				eq(roleAssignments.function, "management_body"),
				effectiveAssignment(),
			),
		);
	return rows.some((r) => r.id !== exceptId);
}

// Neuer Vorschlag (oder Ersatz einer bestellten Zeile) und gleich der
// Antrag an die Geschäftsleitung.
export async function proposeAssignment(
	tx: OrgTx,
	actor: Actor,
	values: AppointmentValues,
	via: string,
): Promise<AppointmentOutcome> {
	const [row] = await tx
		.insert(roleAssignments)
		.values({
			...values,
			organizationId: actor.orgId,
			status: "proposed",
			proposedByUserId: actor.userId,
			appointedAt: values.appointedAt ?? berlinToday(),
		})
		.returning();
	if (!row) throw new Error("insert failed");
	const res = await requestAppointment(tx, actor, row);
	return {
		...res,
		audit: [
			{
				action: "role_assignment.propose",
				target: `role_assignment:${row.id}`,
				after: {
					function: row.function,
					userId: row.userId,
					externalName: row.externalName,
					pendingEmail: row.pendingEmail,
					deputyUserId: row.deputyUserId,
					replaces: row.replacesAssignmentId,
					via,
				},
			},
			...res.audit,
		],
	};
}

// Vorschlag ändern, solange er noch nicht bestellt ist: neu beantragen
export async function updateProposal(
	tx: OrgTx,
	actor: Actor,
	id: string,
	values: Partial<AppointmentValues>,
): Promise<AppointmentOutcome | null> {
	const before = await loadRow(tx, actor.orgId, id);
	if (!before || (before.status !== "proposed" && before.status !== "rejected"))
		return null;
	const [row] = await tx
		.update(roleAssignments)
		.set({ ...values, status: "proposed", decisionNote: null })
		.where(eq(roleAssignments.id, id))
		.returning();
	if (!row) return null;
	return requestAppointment(tx, actor, row);
}

// Antrag stellen bzw. direkt bestellen (erste GL, kein Ablauf aktiv)
async function requestAppointment(
	tx: OrgTx,
	actor: Actor,
	row: Row,
): Promise<AppointmentOutcome> {
	await orgContext(tx, actor.orgId);
	const isManagement = row.function === "management_body";
	if (isManagement && !(await hasManagement(tx, actor.orgId, row.id))) {
		const audit = await applyAppointment(tx, actor, row.id);
		return {
			id: row.id,
			status: "appointed",
			waiting: null,
			audit: [
				{
					action: "role_assignment.bootstrap",
					target: `role_assignment:${row.id}`,
					after: { function: row.function, userId: row.userId },
				},
				...audit,
			],
		};
	}
	const gate = await gateApproval(tx, actor, {
		trigger: "role.appoint",
		entityType: "role_assignment",
		entityId: row.id,
		entityOwnerUserId: null,
		facts: { function: row.function, isManagement },
		title: await title(tx, row),
		link: LINK,
	});
	if (gate.status === "none" || gate.status === "approved") {
		return {
			id: row.id,
			status: "appointed",
			waiting: null,
			audit: await applyAppointment(tx, actor, row.id),
		};
	}
	return {
		id: row.id,
		status: "proposed",
		waiting: gate.status === "pending" ? "approval" : "no_management",
		audit: [],
	};
}

// Wirkung der Bestellung (auch aus outcomes.ts nach der Freigabe)
export async function applyAppointment(
	tx: OrgTx,
	actor: { orgId: string; userId: string },
	id: string,
): Promise<AuditInput[]> {
	const row = await loadRow(tx, actor.orgId, id);
	if (!row || row.status === "appointed") return [];
	const today = berlinToday();
	await tx
		.update(roleAssignments)
		.set({
			status: "appointed",
			decisionNote: null,
			appointedAt: row.appointedAt ?? today,
		})
		.where(eq(roleAssignments.id, id));
	const audit: AuditInput[] = [
		{
			action: "role_assignment.appointed",
			target: `role_assignment:${id}`,
			after: {
				function: row.function,
				userId: row.userId,
				replaces: row.replacesAssignmentId,
			},
		},
	];
	// Neubesetzung / neue Vertretung ersetzt die bisherige Zeile
	if (row.replacesAssignmentId) {
		await tx
			.update(roleAssignments)
			.set({ status: "revoked", revokedAt: new Date() })
			.where(
				and(
					eq(roleAssignments.id, row.replacesAssignmentId),
					eq(roleAssignments.organizationId, actor.orgId),
				),
			);
	}
	await syncTrainingAssignments(tx, actor.orgId);
	await syncOwnersAndNotify(tx, actor.orgId, actor.userId);
	const tf = await getTranslations("Functions");
	const fnLabel = tf(row.function as never);
	await notify(tx, {
		orgId: actor.orgId,
		recipients: [row.userId, row.deputyUserId],
		actorUserId: actor.userId,
		kind: "entity_changed",
		title: `Du wurdest als ${fnLabel} bestellt`,
		link: LINK,
	});
	audit.push(...(await appointmentLetter(tx, actor, row)));
	audit.push(...(await noticeTasks(tx, actor, row, "appoint")));
	// neue GL: offene Vorschläge, die bisher niemand bestätigen konnte
	if (row.function === "management_body")
		audit.push(...(await requestOpenAppointments(tx, actor)));
	return audit;
}

// Bestellungsschreiben (NW-BESTELLUNG) erzeugen und zum Unterschreiben
// auffordern — im Savepoint: scheitert es, bleibt die Bestellung gültig
async function appointmentLetter(
	tx: OrgTx,
	actor: { orgId: string; userId: string },
	row: Row,
): Promise<AuditInput[]> {
	if (!appointable(row.function)) return [];
	try {
		const { generateKindEvidence } = await import(
			"@/lib/evidence-studio/generate/service"
		);
		return await tx.transaction(async (sp) => {
			const r = await generateKindEvidence(
				sp,
				{ orgId: actor.orgId, userId: actor.userId },
				"NW-BESTELLUNG",
				row.id,
			);
			if (!r.ok) return [];
			await sp
				.update(roleAssignments)
				.set({ evidenceId: r.id })
				.where(eq(roleAssignments.id, row.id));
			const gl = recipientsOf(
				await loadAssignments(sp, actor.orgId),
				"management_body",
			);
			await notify(sp, {
				orgId: actor.orgId,
				recipients: [...gl, row.userId],
				actorUserId: actor.userId,
				kind: "acknowledgement_due",
				title: "Bestellungsschreiben unterschreiben",
				link: `/nachweise/${r.id}`,
			});
			return r.audit;
		});
	} catch (err) {
		logger.error(
			{ err, orgId: actor.orgId, assignmentId: row.id },
			"appointment letter failed",
		);
		return [];
	}
}

// Anzeigen an Behörden als Aufgaben (Frist aus dem Katalog)
async function noticeTasks(
	tx: OrgTx,
	actor: { orgId: string; userId: string },
	row: Row,
	event: "appoint" | "revoke",
): Promise<AuditInput[]> {
	const { stage, frameworks } = await orgContext(tx, actor.orgId);
	const due = noticesFor({
		fn: row.function,
		event,
		frameworks,
		stage,
		effectiveFrom: row.appointedAt,
		today: berlinToday(),
	});
	if (due.length === 0) return [];
	const assignments = await loadAssignments(tx, actor.orgId);
	const owner =
		recipientsOf(
			assignments,
			row.function === "aml_officer" ? "aml_officer" : "compliance",
		)[0] ??
		recipientsOf(assignments, "management_body")[0] ??
		actor.userId;
	const who = await holderLabel(tx, row);
	const audit: AuditInput[] = [];
	for (const n of due) {
		const [task] = await tx
			.insert(tasks)
			.values({
				organizationId: actor.orgId,
				title: who ? `${n.title} (${who})` : n.title,
				description: n.description,
				assigneeUserId: owner,
				createdByUserId: actor.userId,
				dueAt: n.dueAt,
				priority: "high",
				entityType: "role_assignment",
				entityId: row.id,
				sourceKind: "obligation",
			})
			.returning({ id: tasks.id });
		if (!task) continue;
		await notify(tx, {
			orgId: actor.orgId,
			recipients: [owner],
			actorUserId: actor.userId,
			kind: "task_assigned",
			title: n.title,
			link: "/heute/aufgaben",
		});
		audit.push({
			action: "task.create",
			target: `task:${task.id}`,
			after: { notice: n.key, dueAt: n.dueAt, assignment: row.id },
		});
	}
	return audit;
}

// Abgelehnt: Vorschlag bleibt mit Begründung stehen; abgelehnte
// Abberufung → Besetzung gilt weiter
export async function rejectAppointment(
	tx: OrgTx,
	actor: { orgId: string; userId: string },
	id: string,
	trigger: "role.appoint" | "role.revoke",
): Promise<AuditInput[]> {
	const row = await loadRow(tx, actor.orgId, id);
	if (!row) return [];
	const note = await lastDecisionNote(tx, actor.orgId, id);
	if (trigger === "role.revoke") {
		if (row.status !== "revocation_requested") return [];
		await tx
			.update(roleAssignments)
			.set({ status: "appointed", decisionNote: note })
			.where(eq(roleAssignments.id, id));
	} else {
		if (row.status !== "proposed") return [];
		await tx
			.update(roleAssignments)
			.set({ status: "rejected", decisionNote: note })
			.where(eq(roleAssignments.id, id));
	}
	return [
		{
			action:
				trigger === "role.revoke"
					? "role_assignment.revocation_rejected"
					: "role_assignment.rejected",
			target: `role_assignment:${id}`,
			after: { function: row.function, note },
		},
	];
}

async function lastDecisionNote(
	tx: OrgTx,
	orgId: string,
	entityId: string,
): Promise<string | null> {
	const [req] = await tx
		.select({ id: approvalRequests.id })
		.from(approvalRequests)
		.where(
			and(
				eq(approvalRequests.organizationId, orgId),
				eq(approvalRequests.entityType, "role_assignment"),
				eq(approvalRequests.entityId, entityId),
			),
		)
		.orderBy(desc(approvalRequests.requestedAt))
		.limit(1);
	if (!req) return null;
	const [d] = await tx
		.select({ note: approvalDecisions.note })
		.from(approvalDecisions)
		.where(eq(approvalDecisions.requestId, req.id))
		.orderBy(desc(approvalDecisions.decidedAt))
		.limit(1);
	return d?.note ?? null;
}

// Entfernen: Vorschlag zurückziehen (ohne Freigabe) oder bestellte
// Besetzung abberufen (Freigabe der GL, ohne die abberufene Person)
export async function proposeRevocation(
	tx: OrgTx,
	actor: Actor,
	id: string,
	via: string,
): Promise<
	| {
			ok: true;
			status: AppointmentStatus | "withdrawn";
			waiting: null | "approval";
			audit: AuditInput[];
	  }
	| { ok: false; error: "notFound" | "no_management" }
> {
	const row = await loadRow(tx, actor.orgId, id);
	if (!row) return { ok: false, error: "notFound" };
	if (row.status === "proposed" || row.status === "rejected") {
		await tx
			.update(approvalRequests)
			.set({ status: "withdrawn", decidedAt: new Date() })
			.where(
				and(
					eq(approvalRequests.organizationId, actor.orgId),
					eq(approvalRequests.entityType, "role_assignment"),
					eq(approvalRequests.entityId, id),
					eq(approvalRequests.status, "pending"),
				),
			);
		await tx.delete(roleAssignments).where(eq(roleAssignments.id, id));
		return {
			ok: true,
			status: "withdrawn",
			waiting: null,
			audit: [
				{
					action: "role_assignment.withdrawn",
					target: `role_assignment:${id}`,
					before: { function: row.function, userId: row.userId, via },
				},
			],
		};
	}
	if (row.status !== "appointed")
		return { ok: true, status: row.status, waiting: null, audit: [] };
	await orgContext(tx, actor.orgId);
	await tx
		.update(roleAssignments)
		.set({ status: "revocation_requested" })
		.where(eq(roleAssignments.id, id));
	const isManagement = row.function === "management_body";
	// letzte Person der GL: niemand könnte bestätigen → direkt
	const direct =
		isManagement && !(await hasManagement(tx, actor.orgId, row.id));
	const gate = direct
		? ({ status: "none" } as const)
		: await gateApproval(tx, actor, {
				trigger: "role.revoke",
				entityType: "role_assignment",
				entityId: id,
				entityOwnerUserId: null,
				facts: { function: row.function, isManagement },
				title: await title(tx, row),
				link: LINK,
				everyoneExclude: row.userId ? [row.userId] : [],
			});
	const base: AuditInput = {
		action: "role_assignment.revocation_requested",
		target: `role_assignment:${id}`,
		before: { function: row.function, userId: row.userId, via },
	};
	if (gate.status === "none" || gate.status === "approved")
		return {
			ok: true,
			status: "revoked",
			waiting: null,
			audit: [base, ...(await applyRevocation(tx, actor, id))],
		};
	if (gate.status === "pending")
		return {
			ok: true,
			status: "revocation_requested",
			waiting: "approval",
			audit: [base],
		};
	// niemand kann freigeben: Besetzung bleibt
	await tx
		.update(roleAssignments)
		.set({ status: "appointed" })
		.where(eq(roleAssignments.id, id));
	return { ok: false, error: "no_management" };
}

export async function applyRevocation(
	tx: OrgTx,
	actor: { orgId: string; userId: string },
	id: string,
): Promise<AuditInput[]> {
	const row = await loadRow(tx, actor.orgId, id);
	if (!row || row.status === "revoked") return [];
	await tx
		.update(roleAssignments)
		.set({ status: "revoked", revokedAt: new Date() })
		.where(eq(roleAssignments.id, id));
	await syncTrainingAssignments(tx, actor.orgId);
	await syncOwnersAndNotify(tx, actor.orgId, actor.userId);
	const tf = await getTranslations("Functions");
	await notify(tx, {
		orgId: actor.orgId,
		recipients: [row.userId, row.deputyUserId],
		actorUserId: actor.userId,
		kind: "entity_changed",
		title: `Du wurdest als ${tf(row.function as never)} abberufen`,
		link: LINK,
	});
	return [
		{
			action: "role_assignment.revoked",
			target: `role_assignment:${id}`,
			before: { function: row.function, userId: row.userId },
		},
		...(await noticeTasks(tx, actor, row, "revoke")),
	];
}

// Offene Vorschläge ohne laufenden Antrag neu beantragen — nach einer
// Änderung an der Geschäftsleitung oder wenn sie beigetreten ist. Anfragende
// Person bleibt, wer vorgeschlagen hat.
export async function requestOpenAppointments(
	tx: OrgTx,
	actor: { orgId: string; userId: string },
): Promise<AuditInput[]> {
	const open = await tx
		.select()
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.organizationId, actor.orgId),
				eq(roleAssignments.status, "proposed"),
			),
		);
	if (open.length === 0) return [];
	const running = new Set(
		(
			await tx
				.select({ entityId: approvalRequests.entityId })
				.from(approvalRequests)
				.where(
					and(
						eq(approvalRequests.organizationId, actor.orgId),
						eq(approvalRequests.entityType, "role_assignment"),
						eq(approvalRequests.status, "pending"),
						inArray(
							approvalRequests.entityId,
							open.map((r) => r.id),
						),
					),
				)
		).map((r) => r.entityId),
	);
	const names = await userNames(
		tx,
		open.map((r) => r.proposedByUserId),
	);
	const audit: AuditInput[] = [];
	for (const candidate of open) {
		if (running.has(candidate.id)) continue;
		// eine vorherige Bestellung in dieser Schleife kann den Stand geändert
		// haben (neue GL beantragt rekursiv)
		const row = await loadRow(tx, actor.orgId, candidate.id);
		if (row?.status !== "proposed") continue;
		const [pending] = await tx
			.select({ id: approvalRequests.id })
			.from(approvalRequests)
			.where(
				and(
					eq(approvalRequests.organizationId, actor.orgId),
					eq(approvalRequests.entityType, "role_assignment"),
					eq(approvalRequests.entityId, row.id),
					eq(approvalRequests.status, "pending"),
				),
			)
			.limit(1);
		if (pending) continue;
		const by = row.proposedByUserId ?? actor.userId;
		const res = await requestAppointment(
			tx,
			{ orgId: actor.orgId, userId: by, name: names.get(by) ?? "" },
			row,
		);
		audit.push(...res.audit);
	}
	return audit;
}
