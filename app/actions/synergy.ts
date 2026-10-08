"use server";

import { z } from "zod";
import { CASP_SERVICES, LICENCE_STAGES } from "@/db/schema/enums";
import { safeAction } from "@/lib/actions/safe";
import {
	AuthError,
	getSessionCtx,
	requireOrg,
	toOrgCtx,
} from "@/lib/auth/guards";
import { synergyCatalogFor } from "@/lib/compliance/catalog-view";
import {
	getOrgProfile,
	loadApplicability,
	loadImplStatus,
} from "@/lib/compliance/queries";
import {
	type StageReport,
	stageChangeReport,
} from "@/lib/compliance/stage-report";
import {
	computeSynergy,
	type SynergyResult,
	type WhatIfResult,
	whatIfAddFramework,
} from "@/lib/compliance/synergy";
import { readOrg } from "@/lib/db/with-org";
import type { ActionResult } from "@/lib/validation/common";
import { fromZod } from "@/lib/validation/common";
import { sectorSchema } from "@/lib/validation/org";

// Synergie-Vorschau für Onboarding und Einstellungen. Rechnet rein auf dem
// statischen Katalog — keine Org-Daten, daher nur Login nötig (die Vorschau
// läuft, bevor es eine Organisation gibt).

const previewSchema = z.object({
	frameworks: z.array(z.string().min(1)).max(20),
	sector: sectorSchema.default("other"),
	licenceStage: z.enum(LICENCE_STAGES).default("0_vorbereitung"),
	caspServices: z.array(z.enum(CASP_SERVICES)).default([]),
	// Für Was-wäre-wenn: Rahmenwerke, die bereits aktiv sind.
	current: z.array(z.string().min(1)).max(20).optional(),
});

export type SynergyPreview = {
	synergy: SynergyResult;
	whatIf: WhatIfResult[];
};

async function previewSynergyImpl(
	input: unknown,
): Promise<ActionResult<SynergyPreview>> {
	const ctx = await getSessionCtx();
	if (!ctx) throw new AuthError("unauthenticated");
	const parsed = previewSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const catalog = synergyCatalogFor({
		sector: d.sector,
		licenceStage: d.licenceStage,
		caspServices: d.caspServices,
		frameworks: d.frameworks,
	});
	const synergy = computeSynergy(d.frameworks, catalog);
	const current = d.current ?? [];
	const whatIf =
		current.length > 0
			? d.frameworks
					.filter((f) => !current.includes(f))
					.map((f) => whatIfAddFramework(current, f, catalog))
			: [];
	return { ok: true, data: { synergy, whatIf } };
}

const stageSchema = z.object({
	licenceStage: z.enum(LICENCE_STAGES),
	caspServices: z.array(z.enum(CASP_SERVICES)).default([]),
	asOf: z.iso.date().optional(),
});

// Synergie-Report für Stufenwechsel/Dienste/Stichtag auf Basis der echten
// Org (umgesetzte Controls, manuelle Anwendbarkeitsentscheidungen).
async function previewStageChangeImpl(
	input: unknown,
): Promise<ActionResult<StageReport>> {
	const c = await requireOrg({ settings: ["read"] });
	const parsed = stageSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const report = await readOrg(toOrgCtx(c), async (tx) => {
		const p = await getOrgProfile(tx, c.orgId);
		if (!p) return null;
		const [impl, detail] = await Promise.all([
			loadImplStatus(tx, c.orgId),
			loadApplicability(tx, c.orgId),
		]);
		const overrides = new Map<string, boolean>();
		for (const [k, v] of detail)
			if (v.source === "manual") overrides.set(k, v.applicable);
		const base = {
			sector: p.profile.sector,
			frameworks: p.frameworks,
			tlptDesignated: p.profile.tlptDesignated,
			issuesTokens: p.profile.issuesTokens,
		};
		return stageChangeReport(
			{
				...base,
				licenceStage: p.profile.licenceStage,
				caspServices: p.profile.caspServices,
			},
			{
				...base,
				licenceStage: d.licenceStage,
				caspServices: d.caspServices,
				asOf: d.asOf ? new Date(`${d.asOf}T00:00:00Z`) : undefined,
			},
			impl,
			overrides,
		);
	});
	if (!report) return { ok: false, error: "notFound" };
	return { ok: true, data: report };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const previewSynergy = safeAction("previewSynergy", previewSynergyImpl);
export const previewStageChange = safeAction(
	"previewStageChange",
	previewStageChangeImpl,
);
