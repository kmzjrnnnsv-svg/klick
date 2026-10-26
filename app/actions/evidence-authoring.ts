"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { evidenceDrafts } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { encryptJson } from "@/lib/crypto/org-dek";
import { mutateOrg } from "@/lib/db/with-org";
import { lockForSuccessor } from "@/lib/evidence/current";
import { normalizeContent } from "@/lib/evidence-authoring/content";
import {
	authoredContentOf,
	createDraft,
	draftAad,
	finalizeDraft,
	loadDraft,
} from "@/lib/evidence-authoring/service";
import { presetOf } from "@/lib/evidence-authoring/templates";
import { berlinToday } from "@/lib/evidence-studio/queries";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	createDraftSchema,
	draftIdSchema,
	evidenceIdSchema,
	finalizeDraftSchema,
	saveDraftSchema,
} from "@/lib/validation/evidence-authoring";

// Nachweise in Klick verfassen (Rohlinge): Entwurf anlegen und gemeinsam
// bearbeiten, abschließen (PDF, Controls, Nachweisbogen, optional
// Testprogramm und Aufgaben), neue Fassung eines verfassten Nachweises.

const revalidate = () => {
	revalidatePath("/nachweise", "layout");
	revalidatePath("/controls", "layout");
	revalidatePath("/rahmenwerke", "layout");
};

async function createEvidenceDraftImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ evidence: ["create"] });
	const parsed = createDraftSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const created = await createDraft(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name || c.email },
				{
					template: d.template,
					preset: d.preset ?? null,
					title: d.title,
					controlCodes: d.controlCode ? [d.controlCode] : [],
					sheetControl: d.sheetItem ? (d.controlCode ?? null) : null,
					sheetItem: d.sheetItem ?? null,
				},
			);
			if (!created)
				return { result: { ok: false, error: "notFound" }, audit: [] };
			return {
				result: { ok: true, data: created },
				audit: {
					action: "evidence.draft_created",
					target: `evidence_draft:${created.id}`,
					after: {
						template: d.template,
						preset: d.preset ?? null,
						control: d.controlCode ?? null,
					},
				},
			};
		},
	);
	revalidatePath("/nachweise/verfassen");
	return res;
}

async function saveEvidenceDraftImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ evidence: ["create"] });
	const parsed = saveDraftSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const loaded = await loadDraft(tx, c.orgId, d.id);
		if (!loaded) return { result: { ok: false, error: "notFound" }, audit: [] };
		const preset = presetOf(loaded.template, d.preset)?.key ?? null;
		const content = normalizeContent(loaded.template, d.content, {
			today: berlinToday(),
			me: c.name || c.email,
			preset,
		});
		await tx
			.update(evidenceDrafts)
			.set({
				title: d.title,
				preset,
				classification: d.classification,
				controlCodes: [...new Set(d.controlCodes)],
				signers: [...new Set(d.signers)],
				contentEnc: await encryptJson(tx, c.orgId, content, draftAad(d.id)),
				updatedByUserId: c.userId,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(evidenceDrafts.id, d.id),
					eq(evidenceDrafts.organizationId, c.orgId),
				),
			);
		return {
			result: { ok: true, data: undefined },
			// Inhalt nur verschlüsselt — im Audit nur Kopfangaben
			audit: {
				action: "evidence.draft_saved",
				target: `evidence_draft:${d.id}`,
				after: {
					title: d.title,
					preset,
					controls: d.controlCodes,
					signers: d.signers,
				},
			},
		};
	});
	revalidatePath("/nachweise/verfassen");
	return res;
}

async function deleteEvidenceDraftImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ evidence: ["create"] });
	const parsed = draftIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.delete(evidenceDrafts)
			.where(
				and(
					eq(evidenceDrafts.id, parsed.data.id),
					eq(evidenceDrafts.organizationId, c.orgId),
				),
			)
			.returning({ title: evidenceDrafts.title });
		if (!row) return { result: { ok: false, error: "notFound" }, audit: [] };
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "evidence.draft_deleted",
				target: `evidence_draft:${parsed.data.id}`,
				before: { title: row.title },
			},
		};
	});
	revalidatePath("/nachweise/verfassen");
	return res;
}

async function finalizeEvidenceDraftImpl(
	input: unknown,
): Promise<ActionResult<{ evidenceId: string; tasks: number }>> {
	const c = await requireOrg({ evidence: ["create"] });
	const parsed = finalizeDraftSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	// Testprogramm und Aufgaben nur mit den Rechten dafür
	const recordTest = d.recordTest && allows(c, { control: ["update"] });
	const createTasks = d.createTasks && allows(c, { task: ["create"] });
	const res = await mutateOrg(toOrgCtx(c), async (tx) => {
		const r = await finalizeDraft(
			tx,
			{ orgId: c.orgId, userId: c.userId },
			d.id,
			{ createTasks, recordTest },
		);
		return { result: r, audit: r.ok ? r.audit : [] };
	});
	if (!res.ok) return { ok: false, error: res.error };
	revalidate();
	revalidatePath("/testprogramm");
	revalidatePath("/heute", "layout");
	return { ok: true, data: { evidenceId: res.evidenceId, tasks: res.tasks } };
}

async function newEvidenceVersionImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ evidence: ["create"] });
	const parsed = evidenceIdSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { evidenceId } = parsed.data;
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const prev = await authoredContentOf(tx, c.orgId, evidenceId);
			if (!prev) return { result: { ok: false, error: "notFound" }, audit: [] };
			// nur aus der aktuellen Fassung (sonst verzweigt der Strang)
			if ((await lockForSuccessor(tx, c.orgId, evidenceId)) !== "ok")
				return {
					result: { ok: false, error: "already_superseded" },
					audit: [],
				};
			const created = await createDraft(
				tx,
				{ orgId: c.orgId, userId: c.userId, name: c.name || c.email },
				{
					template: prev.template.key,
					preset: prev.preset,
					title: prev.title,
					controlCodes: prev.controls,
					supersedesId: evidenceId,
					content: prev.content,
					classification:
						prev.classification === "confidential"
							? "confidential"
							: "internal",
					signers: prev.signers,
				},
			);
			if (!created)
				return { result: { ok: false, error: "notFound" }, audit: [] };
			return {
				result: { ok: true, data: created },
				audit: {
					action: "evidence.draft_created",
					target: `evidence_draft:${created.id}`,
					after: { template: prev.template.key, supersedes: evidenceId },
				},
			};
		},
	);
	revalidatePath("/nachweise/verfassen");
	return res;
}

export const createEvidenceDraft = safeAction(
	"createEvidenceDraft",
	createEvidenceDraftImpl,
);
export const saveEvidenceDraft = safeAction(
	"saveEvidenceDraft",
	saveEvidenceDraftImpl,
);
export const deleteEvidenceDraft = safeAction(
	"deleteEvidenceDraft",
	deleteEvidenceDraftImpl,
);
export const finalizeEvidenceDraft = safeAction(
	"finalizeEvidenceDraft",
	finalizeEvidenceDraftImpl,
);
export const newEvidenceVersion = safeAction(
	"newEvidenceVersion",
	newEvidenceVersionImpl,
);
