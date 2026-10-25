"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
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
import { safeAction } from "@/lib/actions/safe";
import { requestApproval, withdrawOpenRequests } from "@/lib/approvals/service";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import {
	DOCUMENT_TEMPLATES,
	defaultApproverFunction,
	TEMPLATE_BY_CODE,
} from "@/lib/compliance/catalog/document-templates";
import {
	ownerColumns,
	resolveResponsible,
} from "@/lib/compliance/function-holders-service";
import { listMembersForPicker } from "@/lib/compliance/queries";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import {
	bumpVersion,
	guessDocType,
	nextDocNumber,
	titleFromFileName,
} from "@/lib/documents/numbering";
import {
	markVersionApproved,
	snapshotForReview,
} from "@/lib/documents/version-service";
import { currentPublished } from "@/lib/documents/versions";
import { DOCUMENT_STATUS_MACHINE } from "@/lib/entities/document";
import { canTransition } from "@/lib/entities/status-machine";
import { screenUpload, storeEncryptedEvidence } from "@/lib/evidence/store";
import { notify } from "@/lib/notifications/notify";
import { getOrgLimiter } from "@/lib/rate-limit";
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

// Fassungen eines Dokuments für die Ableitung der gültigen Fassung
async function versionRows(tx: Tx, documentId: string) {
	return tx
		.select({
			id: documentVersions.id,
			version: documentVersions.version,
			approvedAt: documentVersions.approvedAt,
			publishedAt: documentVersions.publishedAt,
			retiredAt: documentVersions.retiredAt,
		})
		.from(documentVersions)
		.where(eq(documentVersions.documentId, documentId));
}

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

async function createDocumentImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; docNumber: string }>> {
	const c = await requireOrg({ document: ["create"] });
	const parsed = createDocumentSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const docNumber = await allocateNumber(tx, c.orgId, d.type);
		const owner = await ownerColumns(tx, c.orgId, d.ownerUserId, c.userId);
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
				...owner,
				authorUserId: c.userId,
				approverFunction:
					d.approverFunction === "none"
						? null
						: (d.approverFunction ??
							tpl?.approverFunction ??
							defaultApproverFunction(d.type)),
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

async function updateDocumentImpl(input: unknown): Promise<ActionResult> {
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
		const { ownerUserId: ownerRef, ...rest } = patch;
		const set: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(rest)) if (v !== undefined) set[k] = v;
		const owner = await resolveResponsible(
			tx,
			c.orgId,
			ownerRef,
			before.ownerUserId,
		);
		if (owner) Object.assign(set, owner);
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

// Neue Fassung beginnen: Nummer erhöhen, Arbeitskopie in den Entwurf. Die
// Fassung entsteht erst beim Einreichen (fester Text + Prüfsumme);
// freigegebene und veröffentlichte Fassungen bleiben unverändert.
async function beginNewVersion(
	tx: Tx,
	orgId: string,
	doc: typeof documents.$inferSelect,
	opts: {
		bump: "minor" | "major";
		changeSummary: string;
		bodyMarkdown?: string | null;
		fileEvidenceId?: string | null;
	},
): Promise<string> {
	const next = bumpVersion(doc.version, opts.bump);
	await withdrawOpenRequests(tx, orgId, "document", doc.id);
	await tx
		.update(documents)
		.set({
			version: next,
			status: "draft",
			changeSummary: opts.changeSummary,
			bodyMarkdown:
				opts.bodyMarkdown !== undefined ? opts.bodyMarkdown : doc.bodyMarkdown,
			fileEvidenceId:
				opts.fileEvidenceId !== undefined
					? opts.fileEvidenceId
					: doc.fileEvidenceId,
		})
		.where(eq(documents.id, doc.id));
	return next;
}

// Neue Fassung nur aus einem freigegebenen, veröffentlichten oder
// zurückgezogenen Stand; optional auf Grundlage einer älteren Fassung
async function newDocumentVersionImpl(
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
			if (doc.status === "draft" || doc.status === "in_review")
				return {
					result: { ok: false, error: `document_${doc.status}` },
					audit: [],
				};
			let base: { bodyMarkdown: string | null; fileEvidenceId: string | null } =
				{ bodyMarkdown: doc.bodyMarkdown, fileEvidenceId: doc.fileEvidenceId };
			if (d.fromVersion) {
				const [from] = await tx
					.select({
						bodyMarkdown: documentVersions.bodyMarkdown,
						fileEvidenceId: documentVersions.fileEvidenceId,
					})
					.from(documentVersions)
					.where(
						and(
							eq(documentVersions.documentId, doc.id),
							eq(documentVersions.version, d.fromVersion),
						),
					)
					.limit(1);
				if (!from)
					return { result: { ok: false, error: "notFound" }, audit: [] };
				base = from;
			}
			const next = await beginNewVersion(tx, c.orgId, doc, {
				bump: d.bump,
				changeSummary: d.changeSummary,
				...base,
			});
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
						fromVersion: d.fromVersion ?? null,
					},
				},
			};
		},
	);
	revalidatePath("/dokumente", "layout");
	return res;
}

// Einreichen ohne Antrag (z. B. niemand darf freigeben): ganze Transaktion
// zurückrollen, damit Nummer und Fassung unverändert bleiben
class SubmitBlocked extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = "SubmitBlocked";
	}
}

// Statusübergang: in_review/approved laufen über den Workflow document_publish;
// published verteilt (Kenntnisnahmen werden durch die neue Version-ID frisch).
async function transitionDocumentImpl(
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

		// Zurück in den Entwurf: aus der Prüfung bleibt die Nummer (Antrag
		// endet), aus einem freigegebenen, veröffentlichten oder
		// zurückgezogenen Stand beginnt eine neue Fassung
		if (to === "draft" && doc.status !== "in_review") {
			const next = await beginNewVersion(tx, c.orgId, doc, {
				bump: "minor",
				changeSummary: note?.trim() || "Neue Fassung",
			});
			return {
				result: {
					ok: true,
					data: { status: "draft", approvalRequested: false },
				},
				audit: {
					action: "document.version",
					target: `document:${doc.id}`,
					before: { version: doc.version, status: doc.status },
					after: { version: next, status: "draft", note: note ?? null },
				},
			};
		}
		if (to === "draft")
			await withdrawOpenRequests(tx, c.orgId, "document", doc.id);

		if (to === "in_review") {
			// Fassung festschreiben: Text, Datei und Prüfsumme der Arbeitskopie
			doc.version = await snapshotForReview(tx, c.orgId, doc, c.userId, note);
			const r = await requestApproval(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name },
				{
					// Marketingmitteilungen laufen über einen eigenen Ablauf
					// (Compliance, MiCAR Art. 66)
					trigger:
						doc.type === "marketing" ? "marketing.publish" : "document.publish",
					entityType: "document",
					entityId: doc.id,
					entityOwnerUserId: doc.ownerUserId,
					entityVersionRef: doc.version,
					title: `${doc.docNumber} · ${doc.title} v${doc.version}`,
					link: `/dokumente/${encodeURIComponent(doc.docNumber)}`,
					selfApprovalReason,
					facts: { classification: doc.classification },
				},
			);
			if (!r.ok) {
				if (r.error === "workflow_disabled") {
					await tx
						.update(documents)
						.set({ status: "approved" })
						.where(eq(documents.id, doc.id));
					await markVersionApproved(tx, doc.id, doc.version, c.userId);
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
				// zurückrollen: die Fassung bleibt, wie sie vor dem Einreichen war
				throw new SubmitBlocked(r.error);
			}
			const status = r.status === "approved" ? "approved" : "in_review";
			await tx
				.update(documents)
				.set({ status })
				.where(eq(documents.id, doc.id));
			if (status === "approved") {
				await markVersionApproved(tx, doc.id, doc.version, c.userId);
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
						isNull(documentVersions.publishedAt),
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
		// Zurückgezogen: die gültige Fassung gilt ab jetzt nicht mehr
		if (to === "retired") {
			const current = currentPublished(await versionRows(tx, doc.id));
			if (current)
				await tx
					.update(documentVersions)
					.set({ retiredAt: new Date() })
					.where(
						and(
							eq(documentVersions.id, current.id),
							isNull(documentVersions.retiredAt),
						),
					);
		}
		return {
			result: { ok: true, data: { status: to, approvalRequested: false } },
			audit: {
				action: "document.status",
				target: `document:${doc.id}`,
				before: { status: doc.status },
				after: { status: to, note: note ?? null },
			},
		};
	}).catch((e: unknown) => {
		if (e instanceof SubmitBlocked)
			return { ok: false as const, error: e.code };
		throw e;
	});
	revalidatePath("/dokumente", "layout");
	revalidatePath("/heute", "layout");
	return res;
}

async function acknowledgeDocumentImpl(input: unknown): Promise<ActionResult> {
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
		if (!doc) return { result: false, audit: [] };
		// bestätigt wird die gültige Fassung — auch während eine neue
		// Fassung in Arbeit ist
		const v = currentPublished(await versionRows(tx, doc.id));
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
				after: { version: v.version },
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath("/heute", "layout");
	revalidatePath("/dokumente", "layout");
	return { ok: true, data: undefined };
}

async function applyDocumentTemplatesImpl(
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
async function importDocumentsFromEvidenceImpl(
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

// Datei der Fassung in Arbeit: nur im Entwurf, über die Upload-Pipeline;
// Einstufung = die des Dokuments (DLP hebt sie höchstens an). Die bisherige
// Datei bleibt als Nachweis erhalten (ältere Fassungen verweisen darauf).
async function uploadDocumentFileImpl(
	formData: FormData,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ document: ["update"] });
	const documentId = formData.get("documentId");
	const file = formData.get("file");
	if (typeof documentId !== "string" || !/^[0-9a-f-]{36}$/i.test(documentId))
		return { ok: false, error: "invalid" };
	if (!(file instanceof File)) return { ok: false, error: "fileMissing" };
	if (!getOrgLimiter().check(c.orgId).allowed)
		return { ok: false, error: "rate_limited" };
	const doc = await readOrg(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.select({
				id: documents.id,
				docNumber: documents.docNumber,
				title: documents.title,
				version: documents.version,
				status: documents.status,
				classification: documents.classification,
			})
			.from(documents)
			.where(
				and(
					eq(documents.id, documentId),
					eq(documents.organizationId, c.orgId),
				),
			)
			.limit(1);
		return row ?? null;
	});
	if (!doc) return { ok: false, error: "notFound" };
	if (doc.status !== "draft") return { ok: false, error: "document_not_draft" };
	const bytes = new Uint8Array(await file.arrayBuffer());
	const v = await screenUpload(toOrgCtx(c), {
		name: file.name,
		bytes,
		declaredMime: file.type,
		classification: doc.classification,
		dlpAcknowledged: formData.get("dlpAcknowledged") === "1",
	});
	if (!v.ok)
		return {
			ok: false,
			error: v.error,
			fieldErrors: v.detail ? { dlp: v.detail } : undefined,
		};
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			// erneut prüfen: zwischen Lesen und Speichern eingereicht?
			const [cur] = await tx
				.select({
					status: documents.status,
					version: documents.version,
					fileEvidenceId: documents.fileEvidenceId,
				})
				.from(documents)
				.where(eq(documents.id, doc.id))
				.limit(1)
				.for("update");
			if (!cur || cur.status !== "draft")
				return {
					result: { ok: false, error: "document_not_draft" },
					audit: [],
				};
			const stored = await storeEncryptedEvidence(tx, {
				orgId: c.orgId,
				bytes,
				safeName: v.safeName,
				mime: v.mime,
				title: `${doc.docNumber} ${doc.title} v${cur.version}`,
				type: "document",
				classification: v.classification,
				createdByUserId: c.userId,
				dlp: v.dlp,
				source: "document",
			});
			await tx
				.update(documents)
				.set({ fileEvidenceId: stored.id })
				.where(eq(documents.id, doc.id));
			return {
				result: { ok: true, data: { id: stored.id } },
				audit: {
					action: "document.file_uploaded",
					target: `document:${doc.id}`,
					before: { fileEvidenceId: cur.fileEvidenceId },
					after: {
						fileEvidenceId: stored.id,
						version: cur.version,
						fileName: v.safeName,
						size: bytes.byteLength,
						classification: v.classification,
					},
				},
			};
		},
	);
	if (res.ok) revalidatePath(`/dokumente/${encodeURIComponent(doc.docNumber)}`);
	return res;
}

async function listTemplateOptionsImpl() {
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

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const createDocument = safeAction("createDocument", createDocumentImpl);
export const updateDocument = safeAction("updateDocument", updateDocumentImpl);
export const uploadDocumentFile = safeAction(
	"uploadDocumentFile",
	uploadDocumentFileImpl,
);
export const newDocumentVersion = safeAction(
	"newDocumentVersion",
	newDocumentVersionImpl,
);
export const transitionDocument = safeAction(
	"transitionDocument",
	transitionDocumentImpl,
);
export const acknowledgeDocument = safeAction(
	"acknowledgeDocument",
	acknowledgeDocumentImpl,
);
export const applyDocumentTemplates = safeAction(
	"applyDocumentTemplates",
	applyDocumentTemplatesImpl,
);
export const importDocumentsFromEvidence = safeAction(
	"importDocumentsFromEvidence",
	importDocumentsFromEvidenceImpl,
);
export const listTemplateOptions = safeAction(
	"listTemplateOptions",
	listTemplateOptionsImpl,
);
