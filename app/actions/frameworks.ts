"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
	frameworks,
	orgSettings,
	requirementApplicability,
	requirements,
} from "@/db/schema";
import {
	AuthError,
	requireOrg,
	requireStepUp,
	toOrgCtx,
} from "@/lib/auth/guards";
import { FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import {
	activeFrameworkSlugs,
	addOrgFrameworks,
	initializeOrg,
} from "@/lib/compliance/initialize-org";
import { getOrgProfile } from "@/lib/compliance/queries";
import { mutateOrg } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	addFrameworksSchema,
	setApplicabilitySchema,
} from "@/lib/validation/grc";

// Rahmenwerk nachträglich hinzufügen: org_frameworks + Re-Initialisierung des
// Arbeitsvorrats (Anwendbarkeit, Controls). Einstellungen → Step-up.
export async function addFrameworks(
	input: unknown,
): Promise<ActionResult<{ added: string[]; controlsCreated: number }>> {
	const guarded = await stepUpOrFail();
	if (!guarded.ok) return guarded;
	const c = guarded.ctx;
	const parsed = addFrameworksSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const slugs = parsed.data.frameworks.filter((s) => FRAMEWORK_BY_SLUG.has(s));
	if (slugs.length === 0) return { ok: false, error: "unknownFramework" };

	const out = await mutateOrg(toOrgCtx(c), async (tx) => {
		const p = await getOrgProfile(tx, c.orgId);
		if (!p) return { result: null, audit: [] };
		const added = await addOrgFrameworks(tx, c.orgId, slugs, c.userId);
		const all = await activeFrameworkSlugs(tx, c.orgId);
		const init = await initializeOrg(tx, {
			orgId: c.orgId,
			userId: c.userId,
			frameworks: all,
			sector: p.profile.sector,
			licenceStage: p.profile.licenceStage,
			caspServices: p.profile.caspServices,
			applyBaseline: p.profile.applyBaseline,
			tlptDesignated: p.profile.tlptDesignated,
			issuesTokens: p.profile.issuesTokens,
		});
		return {
			result: { added, controlsCreated: init.controlsCreated },
			audit: {
				action: "org.frameworks_added",
				target: `organization:${c.orgId}`,
				before: { frameworks: p.frameworks },
				after: { frameworks: all, init },
			},
		};
	});
	if (!out) return { ok: false, error: "notFound" };
	revalidatePath("/", "layout");
	return { ok: true, data: out };
}

// Manuelle Anwendbarkeitsentscheidung (SoA-Begründung) je Anforderung.
export async function setRequirementApplicability(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg({ control: ["update"] });
	const parsed = setApplicabilitySchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	if (!d.applicable && !(d.note && d.note.trim().length >= 3)) {
		return {
			ok: false,
			error: "noteRequired",
			fieldErrors: { note: ["noteRequired"] },
		};
	}
	const res = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [req] = await tx
			.select({ id: requirements.id })
			.from(requirements)
			.innerJoin(frameworks, eq(frameworks.id, requirements.frameworkId))
			.where(
				and(eq(frameworks.slug, d.framework), eq(requirements.code, d.code)),
			)
			.limit(1);
		if (!req) return { result: "notFound" as const, audit: [] };
		const [before] = await tx
			.select({
				applicable: requirementApplicability.applicable,
				source: requirementApplicability.source,
				note: requirementApplicability.note,
			})
			.from(requirementApplicability)
			.where(
				and(
					eq(requirementApplicability.organizationId, c.orgId),
					eq(requirementApplicability.requirementId, req.id),
				),
			)
			.limit(1);
		await tx
			.insert(requirementApplicability)
			.values({
				organizationId: c.orgId,
				requirementId: req.id,
				applicable: d.applicable,
				source: "manual",
				note: d.note?.trim() || null,
			})
			.onConflictDoUpdate({
				target: [
					requirementApplicability.organizationId,
					requirementApplicability.requirementId,
				],
				set: {
					applicable: d.applicable,
					source: "manual",
					note: d.note?.trim() || null,
				},
			});
		return {
			result: "ok" as const,
			audit: {
				action: "requirement.applicability",
				target: `requirement:${d.framework}:${d.code}`,
				before: before ?? { applicable: true, source: "default", note: null },
				after: {
					applicable: d.applicable,
					source: "manual",
					note: d.note?.trim() || null,
				},
			},
		};
	});
	if (res !== "ok") return { ok: false, error: res };
	revalidatePath("/rahmenwerke", "layout");
	revalidatePath("/ueberblick");
	return { ok: true, data: undefined };
}

const profileFlagsSchema = z.object({
	tlptDesignated: z.boolean().optional(),
	nis2Status: z
		.enum([
			"unchecked",
			"not_affected",
			"affected_pending",
			"affected_registered",
		])
		.optional(),
});

// Profil-Schalter, die die Anwendbarkeit steuern (TLPT-Benennung, NIS2-Status).
export async function updateProfileFlags(
	input: unknown,
): Promise<ActionResult> {
	const guarded = await stepUpOrFail();
	if (!guarded.ok) return guarded;
	const c = guarded.ctx;
	const parsed = profileFlagsSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const p = await getOrgProfile(tx, c.orgId);
		if (!p) return { result: null, audit: [] };
		await tx
			.update(orgSettings)
			.set({
				tlptDesignated: d.tlptDesignated ?? p.profile.tlptDesignated,
				nis2Status: d.nis2Status ?? p.profile.nis2Status,
			})
			.where(eq(orgSettings.organizationId, c.orgId));
		if (d.tlptDesignated !== undefined) {
			await initializeOrg(tx, {
				orgId: c.orgId,
				userId: c.userId,
				frameworks: p.frameworks,
				sector: p.profile.sector,
				licenceStage: p.profile.licenceStage,
				caspServices: p.profile.caspServices,
				applyBaseline: p.profile.applyBaseline,
				tlptDesignated: d.tlptDesignated,
				issuesTokens: p.profile.issuesTokens,
			});
		}
		return {
			result: null,
			audit: {
				action: "org.profile_flags",
				target: `organization:${c.orgId}`,
				before: {
					tlptDesignated: p.profile.tlptDesignated,
					nis2Status: p.profile.nis2Status,
				},
				after: d,
			},
		};
	});
	revalidatePath("/", "layout");
	return { ok: true, data: undefined };
}

// Step-up als Ergebnis statt Exception: der Client zeigt den Hinweis, statt
// einen generischen Fehler zu sehen.
async function stepUpOrFail(): Promise<
	| { ok: true; ctx: Awaited<ReturnType<typeof requireStepUp>> }
	| { ok: false; error: string }
> {
	try {
		return { ok: true, ctx: await requireStepUp({ settings: ["update"] }) };
	} catch (e) {
		if (e instanceof AuthError && e.code === "step_up_required") {
			return { ok: false, error: "step_up_required" };
		}
		throw e;
	}
}
