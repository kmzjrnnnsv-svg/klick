"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { controlImplementations, controls } from "@/db/schema";
import type { ControlSheetState } from "@/db/schema/enums";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import { mutateOrg, type OrgTx } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	sheetAnswerSchema,
	sheetItemSchema,
	sheetParamSchema,
} from "@/lib/validation/evidence-studio";

// Nachweisbogen je Control (Nachweis-Werkstatt): Antworten, Belege und
// eigene Fristen hängen am Control und gelten für jedes Rahmenwerk.

async function implementationFor(
	tx: OrgTx,
	orgId: string,
	code: string,
): Promise<{ id: string; sheet: ControlSheetState } | null> {
	const [ctl] = await tx
		.select({ id: controls.id })
		.from(controls)
		.where(eq(controls.code, code))
		.limit(1);
	if (!ctl) return null;
	const [row] = await tx
		.select({
			id: controlImplementations.id,
			sheet: controlImplementations.sheet,
		})
		.from(controlImplementations)
		.where(
			and(
				eq(controlImplementations.organizationId, orgId),
				eq(controlImplementations.controlId, ctl.id),
			),
		)
		.limit(1);
	if (row) return { id: row.id, sheet: row.sheet ?? {} };
	// Controls außerhalb des Arbeitsvorrats bekommen beim ersten Eintrag eine Zeile
	const [created] = await tx
		.insert(controlImplementations)
		.values({ organizationId: orgId, controlId: ctl.id, source: "manual" })
		.returning({ id: controlImplementations.id });
	return created ? { id: created.id, sheet: {} } : null;
}

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

export const saveSheetAnswer = safeAction(
	"saveSheetAnswer",
	saveSheetAnswerImpl,
);
export const saveSheetItem = safeAction("saveSheetItem", saveSheetItemImpl);
export const saveSheetParam = safeAction("saveSheetParam", saveSheetParamImpl);
