"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	controls,
	documentAcknowledgements,
	documentControls,
	documents,
	documentVersions,
	evidence,
	orgSettings,
} from "@/db/schema";
import { requestApproval } from "@/lib/approvals/service";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import {
	DOCUMENT_TEMPLATES,
	TEMPLATE_BY_CODE,
} from "@/lib/compliance/catalog/document-templates";
import { listMembersForPicker } from "@/lib/compliance/queries";
import { mutateOrg } from "@/lib/db/with-org";
import {
	bumpVersion,
	guessDocType,
	nextDocNumber,
	titleFromFileName,
} from "@/lib/documents/numbering";
import { DOCUMENT_STATUS_MACHINE } from "@/lib/entities/document";
import { canTransition } from "@/lib/entities/status-machine";
import { notify } from "@/lib/notifications/notify";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	acknowledgeSchema,
	applyTemplatesSchema,
	createDocumentSchema,
	documentTransitionSchema,
	newDocumentVersionSchema,
	updateDocumentSchema,
} from "@/lib/validation/registers";

type Tx = Parameters<Parameters<typeof mutateOrg>[1]>[0];

function plusMonths(months: number): string {
	const d = new Date();
	d.setMonth(d.getMonth() + months);
	return d.toISOString().slice(0, 10);
}

async function allocateNumber(
	tx: Tx,
	orgId: string,
	type: Parameters<typeof nextDocNumber>[1],
) {
	const [s] = await tx
		.select({ numbering: orgSettings.documentNumbering })
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	const existing = (
		await tx
			.select({ n: documents.docNumber })
			.from(documents)
			.where(eq(documents.organizationId, orgId))
	).map((r) => r.n);
	const next = nextDocNumber(s?.numbering ?? {}, type, existing);
	await tx
		.update(orgSettings)
		.set({ documentNumbering: next.numbering })
		.where(eq(orgSettings.organizationId, orgId));
	return next.docNumber;
}

async function linkControls(
	tx: Tx,
	orgId: string,
	documentId: string,
	codes: readonly string[],
) {
	await tx
		.delete(documentControls)
		.where(eq(documentControls.documentId, documentId));
	if (codes.length === 0) return;
	const ids = await tx
		.select({ id: controls.id })
		.from(controls)
		.where(inArray(controls.code, [...codes]));
	if (ids.length > 0) {
		await tx
			.insert(documentControls)
			.values(
				ids.map((x) => ({
					organizationId: orgId,
					documentId,
					controlId: x.id,
				})),
			)
			.onConflictDoNothing();
	}
}

export async function createDocument(
	input: unknown,
): Promise<ActionResult<{ id: string; docNumber: string }>> {
	const c = await requireOrg({ document: ["create"] });
	const parsed = createDocumentSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const docNumber = await allocateNumber(tx, c.orgId, d.type);
		const tpl = d.templateCode
			? TEMPLATE_BY_CODE.get(d.templateCode)
			: undefined;
		const [row] = await tx
			.insert(documents)
			.values({
				organizationId: c.orgId,
				docNumber,
				title: d.title,
				type: d.type,
				domain: d.domain ?? tpl?.domain ?? null,
				classification: d.classification,
				ownerUserId: d.ownerUserId ?? c.userId,
				authorUserId: c.userId,
				approverFunction: (d.approverFunction ??
					tpl?.approverFunction ??
					null) as typeof documents.$inferInsert.approverFunction,
				bodyMarkdown: d.bodyMarkdown ?? tpl?.body ?? null,
				reviewCycleMonths: d.reviewCycleMonths,
				nextReviewAt: plusMonths(d.reviewCycleMonths),
				distribution: d.distribution ?? ["all"],
				retentionYears: d.retentionYears ?? null,
				legalBasisRefs: tpl?.legalBasisRefs ?? [],
				templateCode: d.templateCode ?? null,
				isoMandatory: tpl?.isoMandatory ?? false,
			})
			.returning({ id: documents.id });
		if (!row) throw new Error("insert failed");
		await linkControls(
			tx,
			c.orgId,
			row.id,
			d.controlCodes ?? tpl?.controls ?? [],
		);
		return {
			result: { id: row.id, docNumber },
			audit: {
				action: "document.create",
				target: `document:${row.id}`,
				after: {
					docNumber,
					title: d.title,
					type: d.type,
					templateCode: d.templateCode ?? null,
				},
			},
		};
	});
	revalidatePath("/dokumente");
	return { ok: true, data: out };
}

export async function updateDocument(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ document: ["update"] });
	const parsed = updateDocumentSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { documentId, controlCodes, ...patch } = parsed.data;
	const ok = await mutateOrg<boolean | "locked">(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select()
			.from(documents)
			.where(
				and(
					eq(documents.id, documentId),
					eq(documents.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!before) return { result: false, audit: [] };
		if (before.status !== "draft" && patch.bodyMarkdown !== undefined) {
			return { result: "locked" as const, audit: [] };
		}
		const set: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(patch)) if (v !== undefined) set[k] = v;
		if (set.reviewCycleMonths)
			set.nextReviewAt = plusMonths(Number(set.reviewCycleMonths));
		if (Object.keys(set).length > 0)
			await tx.update(documents).set(set).where(eq(documents.id, documentId));
		if (controlCodes) await linkControls(tx, c.orgId, documentId, controlCodes);
		const beforePick = Object.fromEntries(
			Object.keys(set).map((k) => [
				k,
				(before as Record<string, unknown>)[k] ?? null,
			]),
		);
		return {
			result: true,
			audit: {
				action: "document.update",
				target: `document:${documentId}`,
				before: beforePick,
				after: {
					...set,
					bodyMarkdown: set.bodyMarkdown ? "(geändert)" : undefined,
					controlCodes,
				},
			},
		};
	});
	if (ok === false) return { ok: false, error: "notFound" };
	if (ok === "locked") return { ok: false, error: "locked" };
	revalidatePath("/dokumente", "layout");
	return { ok: true, data: undefined };
}

// Neue Version: Snapshot des aktuellen Stands als Version mit Pflicht-
// changeSummary; Dokument zurück in Entwurf mit erhöhter Versionsnummer.
export async function newDocumentVersion(
	input: unknown,
): Promise<ActionResult<{ version: string }>> {
	const c = await requireOrg({ document: ["update"] });
	const parsed = newDocumentVersionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<ActionResult<{ version: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const [doc] = await tx
				.select()
				.from(documents)
				.where(
					and(
						eq(documents.id, d.documentId),
						eq(documents.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (!doc) return { result: { ok: false, error: "notFound" }, audit: [] };
			const next = bumpVersion(doc.version, d.bump);
			await tx
				.update(documents)
				.set({
					version: next,
					status: "draft",
					bodyMarkdown: d.bodyMarkdown ?? doc.bodyMarkdown,
					fileEvidenceId: d.fileEvidenceId ?? doc.fileEvidenceId,
				})
				.where(eq(documents.id, doc.id));
			await tx
				.insert(documentVersions)
				.values({
					organizationId: c.orgId,
					documentId: doc.id,
					version: next,
					bodyMarkdown: d.bodyMarkdown ?? doc.bodyMarkdown,
					fileEvidenceId: d.fileEvidenceId ?? doc.fileEvidenceId,
					changeSummary: d.changeSummary,
					createdByUserId: c.userId,
				})
				.onConflictDoNothing();
			return {
				result: { ok: true, data: { version: next } },
				audit: {
					action: "document.version",
					target: `document:${doc.id}`,
					before: { version: doc.version, status: doc.status },
					after: {
						version: next,
						status: "draft",
						changeSummary: d.changeSummary,
					},
				},
			};
		},
	);
	revalidatePath("/dokumente", "layout");
	return res;
}

// Statusübergang: in_review/approved laufen über den Workflow document_publish;
// published verteilt (Kenntnisnahmen werden durch die neue Version-ID frisch).
export async function transitionDocument(
	input: unknown,
): Promise<ActionResult<{ status: string; approvalRequested: boolean }>> {
	const c = await requireOrg({ document: ["update"] });
	const parsed = documentTransitionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { documentId, to, note, selfApprovalReason } = parsed.data;
	const res = await mutateOrg<
		ActionResult<{ status: string; approvalRequested: boolean }>
	>(toOrgCtx(c), async (tx) => {
		const [doc] = await tx
			.select()
			.from(documents)
			.where(
				and(
					eq(documents.id, documentId),
					eq(documents.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!doc) return { result: { ok: false, error: "notFound" }, audit: [] };
		const check = canTransition(DOCUMENT_STATUS_MACHINE, doc.status, to, {
			hasNote: Boolean(note && note.trim().length >= 3),
			approvalsSatisfied: true,
		});
		if (!check.ok)
			return {
				result: { ok: false, error: `transition_${check.reason}` },
				audit: [],
			};

		if (to === "in_review") {
			// Version-Snapshot sicherstellen, dann Workflow starten.
			await tx
				.insert(documentVersions)
				.values({
					organizationId: c.orgId,
					documentId: doc.id,
					version: doc.version,
					bodyMarkdown: doc.bodyMarkdown,
					fileEvidenceId: doc.fileEvidenceId,
					changeSummary: note?.trim() || "Zur Prüfung eingereicht",
					createdByUserId: c.userId,
				})
				.onConflictDoNothing();
			const r = await requestApproval(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name },
				{
					kind: "document_publish",
					entityType: "document",
					entityId: doc.id,
					entityOwnerUserId: doc.ownerUserId,
					entityVersionRef: doc.version,
					title: `${doc.docNumber} · ${doc.title} v${doc.version}`,
					link: `/dokumente/${encodeURIComponent(doc.docNumber)}`,
					selfApprovalReason,
				},
			);
			if (!r.ok) {
				if (r.error === "workflow_disabled") {
					await tx
						.update(documents)
						.set({ status: "approved" })
						.where(eq(documents.id, doc.id));
					return {
						result: {
							ok: true,
							data: { status: "approved", approvalRequested: false },
						},
						audit: {
							action: "document.status",
							target: `document:${doc.id}`,
							before: { status: doc.status },
							after: { status: "approved", note: "Workflow inaktiv" },
						},
					};
				}
				return { result: { ok: false, error: r.error }, audit: [] };
			}
			const status = r.status === "approved" ? "approved" : "in_review";
			await tx
				.update(documents)
				.set({ status })
				.where(eq(documents.id, doc.id));
			if (status === "approved") {
				await tx
					.update(documentVersions)
					.set({ approvedByUserId: c.userId, approvedAt: new Date() })
					.where(
						and(
							eq(documentVersions.documentId, doc.id),
							eq(documentVersions.version, doc.version),
						),
					);
			}
			return {
				result: {
					ok: true,
					data: { status, approvalRequested: status === "in_review" },
				},
				audit: {
					action: r.selfApproved
						? "approval.self_approved"
						: "document.review_requested",
					target: `document:${doc.id}`,
					before: { status: doc.status },
					after: {
						status,
						requestId: r.requestId,
						reason: selfApprovalReason ?? null,
					},
				},
			};
		}
		if (to === "approved") {
			return { result: { ok: false, error: "transition_approval" }, audit: [] };
		}
		if (to === "published") {
			await tx
				.update(documents)
				.set({
					status: "published",
					effectiveFrom: new Date().toISOString().slice(0, 10),
					nextReviewAt: plusMonths(doc.reviewCycleMonths),
				})
				.where(eq(documents.id, doc.id));
			await tx
				.update(documentVersions)
				.set({ publishedAt: new Date() })
				.where(
					and(
						eq(documentVersions.documentId, doc.id),
						eq(documentVersions.version, doc.version),
					),
				);
			const members = await listMembersForPicker(tx, c.orgId);
			await notify(tx, {
				orgId: c.orgId,
				recipients: members.map((m) => m.userId),
				actorUserId: c.userId,
				kind: "acknowledgement_due",
				title: `Zur Kenntnis nehmen: ${doc.docNumber} ${doc.title} v${doc.version}`,
				link: `/dokumente/${encodeURIComponent(doc.docNumber)}`,
			});
			return {
				result: {
					ok: true,
					data: { status: "published", approvalRequested: false },
				},
				audit: {
					action: "document.published",
					target: `document:${doc.id}`,
					before: { status: doc.status },
					after: { status: "published", version: doc.version },
				},
			};
		}
		await tx
			.update(documents)
			.set({ status: to })
			.where(eq(documents.id, doc.id));
		return {
			result: { ok: true, data: { status: to, approvalRequested: false } },
			audit: {
				action: "document.status",
				target: `document:${doc.id}`,
				before: { status: doc.status },
				after: { status: to, note: note ?? null },
			},
		};
	});
	revalidatePath("/dokumente", "layout");
	revalidatePath("/heute", "layout");
	return res;
}

export async function acknowledgeDocument(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ document: ["read"] });
	const parsed = acknowledgeSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [doc] = await tx
			.select({
				id: documents.id,
				version: documents.version,
				docNumber: documents.docNumber,
				status: documents.status,
			})
			.from(documents)
			.where(
				and(
					eq(documents.id, parsed.data.documentId),
					eq(documents.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!doc || doc.status !== "published") return { result: false, audit: [] };
		const [v] = await tx
			.select({ id: documentVersions.id })
			.from(documentVersions)
			.where(
				and(
					eq(documentVersions.documentId, doc.id),
					eq(documentVersions.version, doc.version),
				),
			)
			.limit(1);
		if (!v) return { result: false, audit: [] };
		await tx
			.insert(documentAcknowledgements)
			.values({
				organizationId: c.orgId,
				documentId: doc.id,
				documentVersionId: v.id,
				userId: c.userId,
				method: "click",
			})
			.onConflictDoNothing();
		return {
			result: true,
			audit: {
				action: "document.acknowledged",
				target: `document:${doc.id}`,
				after: { version: doc.version },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath("/heute", "layout");
	revalidatePath("/dokumente", "layout");
	return { ok: true, data: undefined };
}

export async function applyDocumentTemplates(
	input: unknown,
): Promise<ActionResult<{ created: number }>> {
	const c = await requireOrg({ document: ["create"] });
	const parsed = applyTemplatesSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const created = await mutateOrg(toOrgCtx(c), async (tx) => {
		const present = new Set(
			(
				await tx
					.select({ t: documents.templateCode })
					.from(documents)
					.where(eq(documents.organizationId, c.orgId))
			).map((r) => r.t),
		);
		let n = 0;
		const codes: string[] = [];
		for (const code of parsed.data.codes) {
			const tpl = TEMPLATE_BY_CODE.get(code);
			if (!tpl || present.has(code)) continue;
			const docNumber = await allocateNumber(tx, c.orgId, tpl.type);
			const [row] = await tx
				.insert(documents)
				.values({
					organizationId: c.orgId,
					docNumber,
					title: tpl.title,
					type: tpl.type,
					domain: tpl.domain,
					ownerUserId: c.userId,
					authorUserId: c.userId,
					approverFunction: tpl.approverFunction,
					bodyMarkdown: tpl.body,
					reviewCycleMonths: tpl.reviewCycleMonths,
					nextReviewAt: plusMonths(tpl.reviewCycleMonths),
					distribution: ["all"],
					legalBasisRefs: tpl.legalBasisRefs,
					templateCode: tpl.code,
					isoMandatory: tpl.isoMandatory,
				})
				.returning({ id: documents.id });
			if (row) {
				await linkControls(tx, c.orgId, row.id, tpl.controls);
				n += 1;
				codes.push(code);
			}
		}
		return {
			result: n,
			audit:
				n > 0
					? {
							action: "document.templates_applied",
							target: `organization:${c.orgId}`,
							after: { codes },
						}
					: [],
		};
	});
	revalidatePath("/dokumente");
	return { ok: true, data: { created } };
}

// Richtlinien-Import: mehrere bereits hochgeladene Nachweise → je Datei ein
// Entwurf mit Nummer, Typ-Vorschlag aus dem Dateinamen, Owner = Importierende:r.
export async function importDocumentsFromEvidence(
	evidenceIds: string[],
): Promise<ActionResult<{ created: number }>> {
	const c = await requireOrg({ document: ["create"] });
	if (!Array.isArray(evidenceIds) || evidenceIds.length === 0)
		return { ok: false, error: "empty" };
	const created = await mutateOrg(toOrgCtx(c), async (tx) => {
		const files = await tx
			.select()
			.from(evidence)
			.where(
				and(
					eq(evidence.organizationId, c.orgId),
					inArray(evidence.id, evidenceIds.slice(0, 50)),
				),
			);
		let n = 0;
		const numbers: string[] = [];
		for (const f of files) {
			const type = guessDocType(f.fileName ?? f.title);
			const docNumber = await allocateNumber(tx, c.orgId, type);
			const [row] = await tx
				.insert(documents)
				.values({
					organizationId: c.orgId,
					docNumber,
					title: titleFromFileName(f.fileName ?? f.title) || f.title,
					type,
					classification: f.classification,
					ownerUserId: c.userId,
					authorUserId: c.userId,
					fileEvidenceId: f.id,
					reviewCycleMonths: 12,
					nextReviewAt: plusMonths(12),
					distribution: ["all"],
				})
				.returning({ id: documents.id });
			if (row) {
				n += 1;
				numbers.push(docNumber);
			}
		}
		return {
			result: n,
			audit:
				n > 0
					? {
							action: "document.imported",
							target: `organization:${c.orgId}`,
							after: { numbers },
						}
					: [],
		};
	});
	revalidatePath("/dokumente");
	return { ok: true, data: { created } };
}

export async function listTemplateOptions() {
	await requireOrg({ document: ["read"] });
	return DOCUMENT_TEMPLATES.map((t) => ({
		code: t.code,
		title: t.title,
		type: t.type,
		isoMandatory: t.isoMandatory,
		frameworks: t.frameworks,
		controls: t.controls,
	}));
}
