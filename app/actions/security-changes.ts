"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, requireStepUp } from "@/lib/auth/guards";
import {
	cancelSecurityChange,
	checkPermit,
	decideSecurityChange,
} from "@/lib/security-changes/service";
import type { ActionResult } from "@/lib/validation/common";

// Vier-Augen für Sicherheitsänderungen (Härtung A4, ADR-028): zustimmen,
// ablehnen, abbrechen. Wer was darf, prüft der Dienst (rules.ts).

const decisionSchema = z.object({
	id: z.uuid(),
	approve: z.boolean(),
	note: z.string().trim().max(500).nullable().default(null),
});

// Zustimmen oder ablehnen: andere Inhaber:in oder Geschäftsleitung, Step-up
async function decideSecurityChangeImpl(input: unknown): Promise<ActionResult> {
	const ctx = await requireStepUp();
	const parsed = decisionSchema.safeParse(input);
	if (!parsed.success) return { ok: false, error: "invalid" };
	const res = await decideSecurityChange(ctx, parsed.data);
	revalidatePath("/einstellungen");
	return res;
}

// Abbrechen: anfragende Person oder Entscheider:in, ohne Step-up (Bremsen
// muss schnell gehen)
async function cancelSecurityChangeImpl(id: unknown): Promise<ActionResult> {
	const ctx = await requireOrg();
	const parsed = z.uuid().safeParse(id);
	if (!parsed.success) return { ok: false, error: "invalid" };
	const res = await cancelSecurityChange(ctx, parsed.data);
	revalidatePath("/einstellungen");
	return res;
}

// Vollexport (organisation.zip): vor dem Download Step-up und Erlaubnis der
// zweiten Person prüfen bzw. beantragen; eingelöst wird sie in der Route
async function ensureFullExportImpl(): Promise<ActionResult> {
	const ctx = await requireStepUp({ export: ["create"] });
	if (ctx.orgRole !== "owner") return { ok: false, error: "forbidden" };
	const res = await checkPermit(ctx, {
		kind: "full_export",
		targetKey: null,
		summary: "Vollständigen Export der Organisation herunterladen",
	});
	return res.ok ? { ok: true, data: undefined } : res;
}

export const decideSecurityChangeAction = safeAction(
	"decideSecurityChange",
	decideSecurityChangeImpl,
);
export const cancelSecurityChangeAction = safeAction(
	"cancelSecurityChange",
	cancelSecurityChangeImpl,
);
export const ensureFullExport = safeAction(
	"ensureFullExport",
	ensureFullExportImpl,
);
