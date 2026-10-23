"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { controlImplementations } from "@/db/schema";
import type { ControlSheetState } from "@/db/schema/enums";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import { evidenceKindsForFrameworks } from "@/lib/compliance/catalog/evidence-kinds";
import { mutateOrg } from "@/lib/db/with-org";
import { GENERATORS } from "@/lib/evidence-studio/generate/registry";
import { generateKindEvidence } from "@/lib/evidence-studio/generate/service";
import { implementationFor } from "@/lib/evidence-studio/implementation";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	generateEvidenceSchema,
	generateFrameworkEvidenceSchema,
	sheetAnswerSchema,
	sheetItemSchema,
	sheetParamSchema,
} from "@/lib/validation/evidence-studio";

// Nachweisbogen je Control (Nachweis-Werkstatt): Antworten, Belege und
// eigene Fristen hängen am Control und gelten für jedes Rahmenwerk.

type OrgCtx = Awaited<ReturnType<typeof requireOrg>>;

async function updateSheet(
	c: OrgCtx,
	controlCode: string,
	change: (
		sheet: ControlSheetState,
		ctx: { userId: string; now: string },
	) => {
		next: ControlSheetState;
		before: unknown;
		after: unknown;
		key: string;
	},
): Promise<ActionResult> {
	if (!CONTROL_BY_CODE.has(controlCode as `CC-${string}-${string}`))
		return { ok: false, error: "notFound" };
	const res = await mutateOrg(toOrgCtx(c), async (tx) => {
		const impl = await implementationFor(tx, c.orgId, controlCode);
		if (!impl) return { result: false, audit: [] };
		const { next, before, after, key } = change(impl.sheet, {
			userId: c.userId,
			now: new Date().toISOString(),
		});
		await tx
			.update(controlImplementations)
			.set({ sheet: next })
			.where(eq(controlImplementations.id, impl.id));
		return {
			result: true,
			audit: {
				action: "control.sheet_updated",
				target: `control:${impl.id}`,
				before: { code: controlCode, key, value: before },
				after: { code: controlCode, key, value: after },
			},
		};
	});
	if (!res) return { ok: false, error: "notFound" };
	revalidatePath(`/controls/${controlCode}`);
	revalidatePath("/rahmenwerke", "layout");
	return { ok: true, data: undefined };
}

async function saveSheetAnswerImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ control: ["update"] });
	const parsed = sheetAnswerSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { controlCode, questionId, answer, note } = parsed.data;
	return updateSheet(c, controlCode, (sheet, { userId, now }) => {
		const answers = { ...(sheet.answers ?? {}) };
		const before = answers[questionId] ?? null;
		if (answer === null) delete answers[questionId];
		else
			answers[questionId] = {
				...before,
				answer,
				note: note || undefined,
				updatedAt: now,
				byUserId: userId,
			};
		return {
			next: { ...sheet, answers },
			before,
			after: answers[questionId] ?? null,
			key: questionId,
		};
	});
}

async function saveSheetItemImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ control: ["update"] });
	const parsed = sheetItemSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { controlCode, itemId, mode, note, evidenceIds } = parsed.data;
	return updateSheet(c, controlCode, (sheet, { userId, now }) => {
		const items = { ...(sheet.items ?? {}) };
		const before = items[itemId] ?? null;
		if (mode === null) delete items[itemId];
		else
			items[itemId] = {
				mode,
				note: note || undefined,
				evidenceIds,
				updatedAt: now,
				byUserId: userId,
			};
		return {
			next: { ...sheet, items },
			before,
			after: items[itemId] ?? null,
			key: itemId,
		};
	});
}

async function saveSheetParamImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ control: ["update"] });
	const parsed = sheetParamSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { controlCode, framework, topic, value } = parsed.data;
	return updateSheet(c, controlCode, (sheet) => {
		const list = (sheet.ownParams ?? []).filter(
			(p) => !(p.framework === framework && p.topic === topic),
		);
		const before =
			sheet.ownParams?.find(
				(p) => p.framework === framework && p.topic === topic,
			)?.value ?? null;
		if (value !== null) list.push({ framework, topic, value });
		return {
			next: { ...sheet, ownParams: list },
			before,
			after: value,
			key: `${framework}:${topic}`,
		};
	});
}

// Nachweis aus den Registern erzeugen (PDF mit Schnappschuss); gleicher
// Inhalt wie zuletzt → der vorhandene Nachweis, kein neuer
async function generateEvidenceImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; reused: boolean }>> {
	const c = await requireOrg({ evidence: ["create"] });
	const parsed = generateEvidenceSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { kindCode, entityId } = parsed.data;
	const res = await mutateOrg(toOrgCtx(c), async (tx) => {
		const r = await generateKindEvidence(
			tx,
			{ orgId: c.orgId, userId: c.userId },
			kindCode,
			entityId,
		);
		return { result: r, audit: r.ok ? r.audit : [] };
	});
	if (!res.ok) return { ok: false, error: res.error };
	revalidatePath("/controls", "layout");
	revalidatePath("/rahmenwerke", "layout");
	revalidatePath("/nachweise");
	revalidatePath("/organisation");
	return { ok: true, data: { id: res.id, reused: res.reused } };
}

// Alle fälligen Nachweise eines Rahmenwerks auf einmal: fehlende,
// veraltete und abgelaufene neu, unveränderte bleiben
async function generateFrameworkEvidenceImpl(
	input: unknown,
): Promise<ActionResult<{ created: number; unchanged: number }>> {
	const c = await requireOrg({ evidence: ["create"] });
	const parsed = generateFrameworkEvidenceSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const codes = evidenceKindsForFrameworks([parsed.data.framework])
		.filter((k) => k.scope === "org" && GENERATORS.has(k.code))
		.map((k) => k.code)
		// Arten, die Nachweise zählen, zuletzt
		.sort(
			(a, b) =>
				Number(GENERATORS.get(a)?.dependsOnEvidence ?? false) -
				Number(GENERATORS.get(b)?.dependsOnEvidence ?? false),
		);
	const res = await mutateOrg(toOrgCtx(c), async (tx) => {
		let created = 0;
		let unchanged = 0;
		const audit = [];
		for (const code of codes) {
			const r = await generateKindEvidence(
				tx,
				{ orgId: c.orgId, userId: c.userId },
				code,
			);
			if (!r.ok) continue;
			if (r.reused) unchanged += 1;
			else created += 1;
			audit.push(...r.audit);
		}
		return { result: { created, unchanged }, audit };
	});
	revalidatePath("/controls", "layout");
	revalidatePath("/rahmenwerke", "layout");
	revalidatePath("/nachweise");
	return { ok: true, data: res };
}

export const saveSheetAnswer = safeAction(
	"saveSheetAnswer",
	saveSheetAnswerImpl,
);
export const saveSheetItem = safeAction("saveSheetItem", saveSheetItemImpl);
export const saveSheetParam = safeAction("saveSheetParam", saveSheetParamImpl);
export const generateEvidence = safeAction(
	"generateEvidence",
	generateEvidenceImpl,
);
export const generateFrameworkEvidence = safeAction(
	"generateFrameworkEvidence",
	generateFrameworkEvidenceImpl,
);
