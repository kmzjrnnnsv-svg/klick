"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { safeAction } from "@/lib/actions/safe";
import type { AuditInput } from "@/lib/audit";
import {
	type OrgContext,
	requireOrg,
	requireStepUp,
	toOrgCtx,
} from "@/lib/auth/guards";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog/controls";
import { parseCsv } from "@/lib/csv";
import { customSlug, mapCsvRows } from "@/lib/custom-frameworks/rules";
import {
	CustomFrameworkError,
	copyCatalogFramework,
	createCustomFramework,
	deleteCustomFramework,
	deleteRequirement,
	deleteSection,
	importRequirements,
	loadCustomFrameworks,
	saveRequirement,
	setFrameworkStatus,
	setRequirementExclusion,
	updateCustomFramework,
	upsertSection,
} from "@/lib/custom-frameworks/service";
import { suggestControls } from "@/lib/custom-frameworks/suggest";
import { mutateOrg, type OrgTx, readOrg } from "@/lib/db/with-org";
import { type ActionResult, fromZod, uuid } from "@/lib/validation/common";
import {
	copyFrameworkSchema,
	csvImportSchema,
	customFrameworkSchema,
	customFrameworkUpdateSchema,
	exclusionSchema,
	requirementSchema,
	sectionSchema,
} from "@/lib/validation/custom-frameworks";

// Eigene Rahmenwerke (R4): anlegen und pflegen mit custom_framework
// (Inhaber:innen, Bearbeiter:innen, Berater:innen); einschalten, zurückziehen
// und löschen nur Inhaber:innen mit Step-up (settings:update). Geschrieben
// wird nur über lib/custom-frameworks/service.ts, das Audit schreibt
// mutateOrg als letzte Anweisung derselben Transaktion.

const MAX_CSV_ROWS = 2000;

const idSchema = z.object({ id: uuid });
const removeSchema = z.object({ frameworkId: uuid, id: uuid });
const sectionRemoveSchema = z.object({
	frameworkId: uuid,
	code: z.string().trim().min(1).max(40),
});
const suggestSchema = z.object({
	text: z.string().trim().max(6000),
	domain: z.string().max(40).optional(),
});

// Fehler des Dienstes als Code, alles andere geht an safeAction
async function write<T>(
	c: OrgContext,
	fn: (tx: OrgTx) => Promise<{ result: T; audit: AuditInput | AuditInput[] }>,
): Promise<ActionResult<T>> {
	try {
		const data = await mutateOrg(toOrgCtx(c), fn);
		return { ok: true, data };
	} catch (e) {
		if (e instanceof CustomFrameworkError) return { ok: false, error: e.code };
		throw e;
	}
}

function refresh(id?: string) {
	revalidatePath("/einstellungen");
	revalidatePath("/rahmenwerke", "layout");
	if (id) revalidatePath(`/rahmenwerke/eigene/${id}`);
}

async function createImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ custom_framework: ["create"] });
	const parsed = customFrameworkSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await write(c, async (tx) => {
		const r = await createCustomFramework(tx, c, parsed.data);
		return { result: { id: r.id }, audit: r.audit };
	});
	if (res.ok) refresh();
	return res;
}

async function copyImpl(input: unknown): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ custom_framework: ["create"] });
	const parsed = copyFrameworkSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await write(c, async (tx) => {
		const r = await copyCatalogFramework(tx, c, parsed.data);
		return { result: { id: r.id }, audit: r.audit };
	});
	if (res.ok) refresh();
	return res;
}

async function updateImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ custom_framework: ["update"] });
	const parsed = customFrameworkUpdateSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { id, ...patch } = parsed.data;
	const res = await write(c, async (tx) => ({
		result: undefined,
		audit: await updateCustomFramework(tx, c, id, patch),
	}));
	if (res.ok) refresh(id);
	return res;
}

async function saveSectionImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ custom_framework: ["update"] });
	const parsed = sectionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await write(c, async (tx) => ({
		result: undefined,
		audit: await upsertSection(tx, c, parsed.data),
	}));
	if (res.ok) refresh(parsed.data.frameworkId);
	return res;
}

async function deleteSectionImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ custom_framework: ["update"] });
	const parsed = sectionRemoveSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await write(c, async (tx) => ({
		result: undefined,
		audit: await deleteSection(
			tx,
			c,
			parsed.data.frameworkId,
			parsed.data.code,
		),
	}));
	if (res.ok) refresh(parsed.data.frameworkId);
	return res;
}

async function saveRequirementImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ custom_framework: ["update"] });
	const parsed = requirementSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await write(c, async (tx) => {
		const r = await saveRequirement(tx, c, parsed.data);
		return { result: { id: r.id }, audit: r.audit };
	});
	if (res.ok) refresh(parsed.data.frameworkId);
	return res;
}

async function deleteRequirementImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ custom_framework: ["update"] });
	const parsed = removeSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await write(c, async (tx) => ({
		result: undefined,
		audit: await deleteRequirement(
			tx,
			c,
			parsed.data.frameworkId,
			parsed.data.id,
		),
	}));
	if (res.ok) refresh(parsed.data.frameworkId);
	return res;
}

async function setExclusionImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ custom_framework: ["update"] });
	const parsed = exclusionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await write(c, async (tx) => ({
		result: undefined,
		audit: await setRequirementExclusion(
			tx,
			c,
			d.requirementId,
			d.excluded,
			d.reason,
		),
	}));
	if (res.ok) refresh();
	return res;
}

export type CsvPreview = {
	created: number;
	updated: number;
	errors: { row: number; error: string }[];
	dryRun: boolean;
};

async function importCsvImpl(
	input: unknown,
): Promise<ActionResult<CsvPreview>> {
	const c = await requireOrg({ custom_framework: ["update"] });
	const parsed = csvImportSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const table = parseCsv(d.csv);
	if (table.rows.length > MAX_CSV_ROWS)
		return { ok: false, error: "too_many_rows" };
	const { items, errors } = mapCsvRows(table.rows, (code) =>
		CONTROL_BY_CODE.has(code as `CC-${string}-${string}`),
	);
	if (d.dryRun) {
		const existing = await readOrg(toOrgCtx(c), async (tx) => {
			const [fw] = await loadCustomFrameworks(tx, c.orgId, {
				ids: [d.frameworkId],
				statuses: ["draft", "active", "retired"],
			});
			return fw ? new Set(fw.requirements.map((r) => r.code)) : null;
		});
		if (!existing) return { ok: false, error: "not_found" };
		const updated = items.filter((i) => existing.has(i.code)).length;
		return {
			ok: true,
			data: {
				created: items.length - updated,
				updated,
				errors,
				dryRun: true,
			},
		};
	}
	const res = await write(c, async (tx) => {
		const r = await importRequirements(tx, c, d.frameworkId, items);
		return {
			result: {
				created: r.created,
				updated: r.updated,
				errors,
				dryRun: false,
			},
			audit: r.audit,
		};
	});
	if (res.ok) refresh(d.frameworkId);
	return res;
}

// Einschalten und zurückziehen: nur Inhaber:innen, frisch bestätigt
async function setStatusImpl(
	input: unknown,
): Promise<ActionResult<{ slug: string; controlsCreated: number }>> {
	const parsed = idSchema
		.extend({ status: z.enum(["active", "retired"]) })
		.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const c = await requireStepUp({ settings: ["update"] });
	const res = await write(c, async (tx) => {
		const r = await setFrameworkStatus(
			tx,
			c,
			parsed.data.id,
			parsed.data.status,
		);
		const after = r.audit.after as { controlsCreated?: number } | undefined;
		return {
			result: {
				slug: customSlug(r.framework.key),
				controlsCreated: after?.controlsCreated ?? 0,
			},
			audit: r.audit,
		};
	});
	if (res.ok) refresh(parsed.data.id);
	return res;
}

async function deleteImpl(input: unknown): Promise<ActionResult> {
	const parsed = idSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const c = await requireStepUp({ settings: ["update"] });
	const res = await write(c, async (tx) => ({
		result: undefined,
		audit: await deleteCustomFramework(tx, c, parsed.data.id),
	}));
	if (res.ok) refresh();
	return res;
}

// Passende Klick-Maßnahmen zum Text einer Anforderung (Wortüberlappung)
async function suggestImpl(
	input: unknown,
): Promise<ActionResult<{ code: string; title: string; reason: string[] }[]>> {
	await requireOrg({ custom_framework: ["read"] });
	const parsed = suggestSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const list = suggestControls(
		parsed.data.text,
		parsed.data.domain as Parameters<typeof suggestControls>[1],
	);
	return {
		ok: true,
		data: list.map((s) => ({
			code: s.code,
			title:
				CONTROL_BY_CODE.get(s.code as `CC-${string}-${string}`)?.title ??
				s.code,
			reason: s.matched,
		})),
	};
}

export const createCustomFrameworkAction = safeAction(
	"createCustomFramework",
	createImpl,
);
export const copyCustomFrameworkAction = safeAction(
	"copyCustomFramework",
	copyImpl,
);
export const updateCustomFrameworkAction = safeAction(
	"updateCustomFramework",
	updateImpl,
);
export const saveCustomSectionAction = safeAction(
	"saveCustomSection",
	saveSectionImpl,
);
export const deleteCustomSectionAction = safeAction(
	"deleteCustomSection",
	deleteSectionImpl,
);
export const saveCustomRequirementAction = safeAction(
	"saveCustomRequirement",
	saveRequirementImpl,
);
export const deleteCustomRequirementAction = safeAction(
	"deleteCustomRequirement",
	deleteRequirementImpl,
);
export const setCustomExclusionAction = safeAction(
	"setCustomExclusion",
	setExclusionImpl,
);
export const importCustomCsvAction = safeAction(
	"importCustomCsv",
	importCsvImpl,
);
export const setCustomFrameworkStatusAction = safeAction(
	"setCustomFrameworkStatus",
	setStatusImpl,
);
export const deleteCustomFrameworkAction = safeAction(
	"deleteCustomFramework",
	deleteImpl,
);
export const suggestCustomControlsAction = safeAction(
	"suggestCustomControls",
	suggestImpl,
);
