"use server";

import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/actions/safe";
import { requirePlatformAdmin, requirePlatformStepUp } from "@/lib/auth/guards";
import { adminOrg } from "@/lib/db/admin-orgs";
import {
	createSiteTunnel,
	issueSiteLinkAsPlatform,
	type PlanResult,
	planSiteTunnel,
	removeSiteTunnel,
} from "@/lib/db/site-tunnels";
import { env } from "@/lib/env";
import { siteConfig } from "@/lib/site-tunnels/agent-client";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	siteTunnelCreateSchema,
	siteTunnelPlanSchema,
	siteTunnelRefSchema,
} from "@/lib/validation/site-tunnels";

// Admin > Organisationen > [Org] > Standort verbinden (ADR-033): Assistent
// mit Vorschau (nur Admin-Netz), Anlegen, Link für die IT und Abbau mit
// Step-up. Netze und Gegenstellen prüft der Dienst über alle Orgs.

const actor = (a: Awaited<ReturnType<typeof requirePlatformAdmin>>) => ({
	userId: a.userId,
	ip: a.ip,
	userAgent: a.userAgent,
});

const server = () => {
	const c = siteConfig();
	return {
		publicIp: c.enabled ? c.publicIp : null,
		wgPublicKey: c.wgPublicKey,
	};
};

async function previewSiteTunnelImpl(
	input: unknown,
): Promise<ActionResult<PlanResult>> {
	await requirePlatformAdmin();
	const parsed = siteTunnelPlanSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	return { ok: true, data: await planSiteTunnel(parsed.data, server()) };
}

async function createSiteTunnelImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; transferNet: string | null }>> {
	const a = await requirePlatformStepUp();
	const parsed = siteTunnelCreateSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	if (!(await adminOrg(parsed.data.orgId)))
		return { ok: false, error: "not_found" };
	const r = await createSiteTunnel(actor(a), parsed.data, server());
	if (!r.ok || !r.id) return { ok: false, error: r.ok ? "error" : r.error };
	revalidatePath(`/admin/orgs/${parsed.data.orgId}`);
	return { ok: true, data: { id: r.id, transferNet: r.transferNet } };
}

async function issueSiteLinkImpl(
	input: unknown,
): Promise<ActionResult<{ url: string; expiresAt: string }>> {
	const a = await requirePlatformStepUp();
	const parsed = siteTunnelRefSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const link = await issueSiteLinkAsPlatform(
		actor(a),
		parsed.data.orgId,
		parsed.data.id,
	);
	if (!link) return { ok: false, error: "not_found" };
	const origin = new URL(env().BETTER_AUTH_URL).origin;
	return {
		ok: true,
		data: {
			url: `${origin}/standort#${link.token}`,
			expiresAt: link.expiresAt.toISOString(),
		},
	};
}

async function removeSiteTunnelImpl(input: unknown): Promise<ActionResult> {
	const a = await requirePlatformStepUp();
	const parsed = siteTunnelRefSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const r = await removeSiteTunnel(actor(a), parsed.data.orgId, parsed.data.id);
	if (!r.ok) return r;
	revalidatePath(`/admin/orgs/${parsed.data.orgId}`);
	return { ok: true, data: undefined };
}

// Für Downloads im Admin-Portal (Blatt für die IT): Step-up vorab im Dialog
async function ensureAdminStepUpImpl(): Promise<ActionResult> {
	await requirePlatformStepUp();
	return { ok: true, data: undefined };
}

export const ensureAdminStepUp = safeAction(
	"ensureAdminStepUp",
	ensureAdminStepUpImpl,
);
export const previewSiteTunnel = safeAction(
	"previewSiteTunnel",
	previewSiteTunnelImpl,
);
export const createSiteTunnelAction = safeAction(
	"createSiteTunnel",
	createSiteTunnelImpl,
);
export const issueSiteLinkAdmin = safeAction(
	"issueSiteLinkAdmin",
	issueSiteLinkImpl,
);
export const removeSiteTunnelAction = safeAction(
	"removeSiteTunnel",
	removeSiteTunnelImpl,
);
