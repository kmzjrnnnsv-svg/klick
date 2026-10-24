import { and, eq } from "drizzle-orm";
import {
	incidents,
	incidentUpdates,
	products,
	roleAssignments,
	tasks,
} from "@/db/schema";
import type { IncidentRegime } from "@/db/schema/enums";
import type { AuditInput } from "@/lib/audit";
import { TASK_BUNDLES } from "@/lib/compliance/catalog/task-bundles";
import {
	computeIncidentDeadlines,
	leadRegime,
	nextIncidentCode,
} from "@/lib/compliance/incident";
import type { OrgTx } from "@/lib/db/with-org";
import { DATE_TIME } from "@/lib/history";
import { notify } from "@/lib/notifications/notify";
import { orgOwnerIds } from "@/lib/org/queries";
import type { CreateIncidentInput } from "@/lib/validation/registers";

// Vorfälle anlegen — aus der Oberfläche (Action) und ohne Sitzung (Export
// aus both.money). Ohne handelnde Person wird die verantwortliche Person
// ausdrücklich gesetzt: Incident-Manager:in, sonst die erste Inhaber:in.

// Fristen aus Regimes + Zeitstempeln ableiten (Leitregime, siehe leadRegime).
export function deadlinesFor(row: {
	regimes: readonly IncidentRegime[];
	awareAt: Date;
	classifiedAt: Date | null;
	initialReportedAt: Date | null;
	intermediateReportedAt: Date | null;
	mitigationAvailableAt?: Date | null;
}) {
	return computeIncidentDeadlines(leadRegime(row.regimes) ?? "dora", {
		awareAt: row.awareAt,
		classifiedAt: row.classifiedAt,
		initialReportedAt: row.initialReportedAt,
		intermediateReportedAt: row.intermediateReportedAt,
		mitigationAvailableAt: row.mitigationAvailableAt,
	});
}

export const isCra = (r: readonly IncidentRegime[]) =>
	r.includes("cra_vuln") || r.includes("cra_incident");

// Produkt muss zur Org gehören (Fremdschlüssel prüfen nicht über RLS).
export async function ownProduct(
	tx: OrgTx,
	orgId: string,
	productId: string | null | undefined,
): Promise<string | null | undefined> {
	if (!productId) return productId;
	const [p] = await tx
		.select({ id: products.id })
		.from(products)
		.where(and(eq(products.id, productId), eq(products.organizationId, orgId)))
		.limit(1);
	return p ? p.id : undefined;
}

// CRA-Meldepaket als Aufgaben (einmal je Vorfall).
export async function insertCraBundle(
	tx: OrgTx,
	orgId: string,
	actorId: string | null,
	incident: { id: string; code: string; ownerUserId: string | null },
) {
	const bundle = TASK_BUNDLES.find((b) => b.code === "INCIDENT_CRA");
	if (!bundle) return;
	await tx.insert(tasks).values(
		bundle.items.map((it) => ({
			organizationId: orgId,
			title: `${incident.code}: ${it.title}`,
			assigneeUserId: incident.ownerUserId ?? actorId,
			createdByUserId: actorId,
			dueAt: new Date(Date.now() + (it.offsetDays ?? 0) * 86_400_000)
				.toISOString()
				.slice(0, 10),
			entityType: "incident" as const,
			entityId: incident.id,
			sourceKind: "incident_action" as const,
			bundleCode: bundle.code,
			priority: "critical" as const,
		})),
	);
}

export async function incidentManager(
	tx: OrgTx,
	orgId: string,
): Promise<string | null> {
	const [r] = await tx
		.select({ userId: roleAssignments.userId })
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.organizationId, orgId),
				eq(roleAssignments.function, "incident_manager"),
			),
		)
		.limit(1);
	return r?.userId ?? null;
}

// Drei Felder: Was · Wann bemerkt · Betrifft Zahlungen/Kunden → Uhren laufen
// ab Kenntnis. Der Audit-Eintrag geht an den Aufrufer (letzte Anweisung).
export async function createIncidentRecord(
	tx: OrgTx,
	ctx: { orgId: string; userId: string | null },
	d: CreateIncidentInput,
	opts: { source?: string } = {},
): Promise<{
	id: string;
	code: string;
	ownerUserId: string | null;
	initialDueAt: Date;
	audit: AuditInput;
}> {
	const existing = await tx
		.select({ code: incidents.code })
		.from(incidents)
		.where(eq(incidents.organizationId, ctx.orgId));
	const code = nextIncidentCode(existing.map((r) => r.code));
	const regimes = [
		...new Set([
			...d.regimes,
			...(d.affectsPayments ? ["dora" as const] : []),
			...(d.affectsCustomers ? ["dsgvo" as const] : []),
		]),
	];
	const dl = deadlinesFor({
		regimes,
		awareAt: d.awareAt,
		classifiedAt: null,
		initialReportedAt: null,
		intermediateReportedAt: null,
	});
	const owner =
		(await incidentManager(tx, ctx.orgId)) ??
		ctx.userId ??
		(await orgOwnerIds(tx, ctx.orgId))[0] ??
		null;
	const productId = await ownProduct(tx, ctx.orgId, d.productId);
	const [row] = await tx
		.insert(incidents)
		.values({
			productId: productId ?? null,
			organizationId: ctx.orgId,
			code,
			title: d.title,
			description: d.description ?? null,
			awareAt: d.awareAt,
			regimes,
			affectsPayments: d.affectsPayments,
			earlyWarningAt: dl.earlyWarningAt,
			initialDueAt: dl.initialDueAt,
			intermediateDueAt: dl.intermediateDueAt,
			finalDueAt: dl.finalDueAt,
			ownerUserId: owner,
			assigneeUserId: ctx.userId ?? owner,
		})
		.returning({ id: incidents.id });
	if (!row) throw new Error("insert failed");
	await tx.insert(incidentUpdates).values({
		organizationId: ctx.orgId,
		incidentId: row.id,
		authorUserId: ctx.userId,
		kind: "status_change",
		body: `Vorfall erfasst${opts.source ? ` (${opts.source})` : ""}. Kenntnis: ${DATE_TIME.format(d.awareAt)}`,
	});
	if (isCra(regimes))
		await insertCraBundle(tx, ctx.orgId, ctx.userId, {
			id: row.id,
			code,
			ownerUserId: owner,
		});
	await notify(tx, {
		orgId: ctx.orgId,
		recipients: [owner],
		actorUserId: ctx.userId,
		kind: "incident_deadline",
		title: `Neuer Vorfall ${code}: Erstmeldung bis ${dl.initialDueAt.toISOString()}`,
		link: `/vorfaelle/${row.id}`,
	});
	return {
		id: row.id,
		code,
		ownerUserId: owner,
		initialDueAt: dl.initialDueAt,
		audit: {
			action: "incident.create",
			target: `incident:${row.id}`,
			after: {
				code,
				title: d.title,
				awareAt: d.awareAt,
				regimes,
				affectsPayments: d.affectsPayments,
				...(opts.source ? { source: opts.source } : {}),
			},
		},
	};
}
