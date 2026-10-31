"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { user } from "@/db/auth-schema";
import { notifications, teamsUsers } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { mutateOrg } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { teamsConfig } from "@/lib/teams/config";
import { adminConsentUrl } from "@/lib/teams/consent";
import { createGraphClient } from "@/lib/teams/graph";
import { teamsHttpsTransport } from "@/lib/teams/http";
import {
	prepareConsent,
	removeTeams,
	setTeamsEnabled,
	teamsIntegrationOf,
	teamsWebUrl,
} from "@/lib/teams/service";
import { type ActionResult, fromZod } from "@/lib/validation/common";

// Microsoft Teams je Organisation (T5): nur Inhaber:innen, mit Step-up.
// Freigeben muss die Kunden-IT im eigenen Tenant (Admin-Consent).

const PATH = "/einstellungen";

const tenantSchema = z.object({ tenantId: z.guid() });

async function startTeamsConsentImpl(
	input: unknown,
): Promise<ActionResult<{ url: string }>> {
	const c = await requireStepUp({ integration: ["create"] });
	if (c.orgRole !== "owner") return { ok: false, error: "forbidden" };
	const config = teamsConfig();
	if (!config) return { ok: false, error: "teams_not_configured" };
	const parsed = tenantSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const e = env();
	const state = await mutateOrg(toOrgCtx(c), async (tx) => {
		const r = await prepareConsent(tx, {
			orgId: c.orgId,
			userId: c.userId,
			tenantId: parsed.data.tenantId,
			secret: e.BETTER_AUTH_SECRET,
			now: new Date(),
		});
		return { result: r.state, audit: r.audit };
	});
	revalidatePath(PATH);
	return {
		ok: true,
		data: {
			url: adminConsentUrl(
				parsed.data.tenantId,
				config.clientId,
				`${e.BETTER_AUTH_URL.replace(/\/$/, "")}/api/teams/consent`,
				state,
			),
		},
	};
}

async function setTeamsEnabledImpl(input: unknown): Promise<ActionResult> {
	const c = await requireStepUp({ integration: ["create"] });
	if (c.orgRole !== "owner") return { ok: false, error: "forbidden" };
	const parsed = z.object({ enabled: z.boolean() }).safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const r = await setTeamsEnabled(
			tx,
			c.orgId,
			parsed.data.enabled,
			new Date(),
		);
		return { result: r.ok, audit: r.audit };
	});
	if (!ok) return { ok: false, error: "teams_not_consented" };
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

async function removeTeamsImpl(): Promise<ActionResult> {
	const c = await requireStepUp({ integration: ["revoke"] });
	if (c.orgRole !== "owner") return { ok: false, error: "forbidden" };
	await mutateOrg(toOrgCtx(c), async (tx) => ({
		result: null,
		audit: await removeTeams(tx, c.orgId),
	}));
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

// Testhinweis an die eigene Person, sofort und ohne Job
async function sendTeamsTestImpl(): Promise<ActionResult> {
	const c = await requireStepUp({ integration: ["create"] });
	if (c.orgRole !== "owner") return { ok: false, error: "forbidden" };
	const config = teamsConfig();
	if (!config) return { ok: false, error: "teams_not_configured" };
	const client = createGraphClient(config, teamsHttpsTransport());
	const now = new Date();
	const res = await mutateOrg(toOrgCtx(c), async (tx) => {
		const integ = await teamsIntegrationOf(tx, c.orgId);
		if (!integ || integ.status !== "active")
			return { result: "teams_not_consented", audit: [] };
		const [me] = await tx
			.select({ email: user.email })
			.from(user)
			.where(eq(user.id, c.userId))
			.limit(1);
		if (!me) return { result: "notFound", audit: [] };
		const app = integ.catalogAppId
			? ({ ok: true, value: integ.catalogAppId } as const)
			: await client.findCatalogApp(integ.tenantId);
		if (!app.ok) return { result: `teams_${app.error}`, audit: [] };
		const found = await client.findUser(integ.tenantId, me.email);
		if (!found.ok) return { result: `teams_${found.error}`, audit: [] };
		const inst = await client.installApp(
			integ.tenantId,
			found.value,
			app.value,
		);
		if (!inst.ok) return { result: `teams_${inst.error}`, audit: [] };
		const [row] = await tx
			.insert(notifications)
			.values({
				organizationId: c.orgId,
				userId: c.userId,
				kind: "system",
				title: "Testhinweis aus Klick",
				link: "/einstellungen?tab=integrationen",
				emailedAt: now,
			})
			.returning({ id: notifications.id });
		const sent = await client.sendActivity(integ.tenantId, found.value, {
			title: "Testhinweis aus Klick",
			webUrl: teamsWebUrl(
				env().BETTER_AUTH_URL,
				"/einstellungen?tab=integrationen",
			),
		});
		if (!sent.ok) return { result: `teams_${sent.error}`, audit: [] };
		if (row)
			await tx
				.update(notifications)
				.set({ teamsSentAt: now })
				.where(eq(notifications.id, row.id));
		await tx
			.insert(teamsUsers)
			.values({
				organizationId: c.orgId,
				userId: c.userId,
				aadObjectId: found.value,
				appInstalledAt: now,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: [teamsUsers.organizationId, teamsUsers.userId],
				set: {
					aadObjectId: found.value,
					appInstalledAt: now,
					lastError: null,
					updatedAt: now,
				},
			});
		return {
			result: "ok",
			audit: { action: "teams.test_sent", target: `organization:${c.orgId}` },
		};
	});
	if (res !== "ok") return { ok: false, error: res };
	return { ok: true, data: undefined };
}

export const startTeamsConsent = safeAction(
	"startTeamsConsent",
	startTeamsConsentImpl,
);
export const setTeamsEnabledAction = safeAction(
	"setTeamsEnabledAction",
	setTeamsEnabledImpl,
);
export const removeTeamsAction = safeAction(
	"removeTeamsAction",
	removeTeamsImpl,
);
export const sendTeamsTest = safeAction("sendTeamsTest", sendTeamsTestImpl);
