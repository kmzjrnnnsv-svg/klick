"use server";

import { z } from "zod";
import { CASP_SERVICES, LICENCE_STAGES } from "@/db/schema/enums";
import { AuthError, getSessionCtx } from "@/lib/auth/guards";
import { synergyCatalogFor } from "@/lib/compliance/catalog-view";
import {
	computeSynergy,
	type SynergyResult,
	type WhatIfResult,
	whatIfAddFramework,
} from "@/lib/compliance/synergy";
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

export async function previewSynergy(
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
