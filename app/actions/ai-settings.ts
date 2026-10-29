"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { orgSettings } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import {
	credentialInfo,
	keyHint,
	pruneCredentials,
	storeCredential,
} from "@/lib/ai/credentials";
import { aiTargetAllowed } from "@/lib/ai/http";
import {
	type AiPolicy,
	aiAdminOf,
	aiPolicyComplete,
	aiPolicyRelaxed,
	minClass,
} from "@/lib/ai/policy";
import { loadAiPolicy, testAiConnection } from "@/lib/ai/service";
import { requireOrg, requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { orgAiRow } from "@/lib/db/org-accounts";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { requestApplyChange } from "@/lib/security-changes/service";
import {
	aiKeySchema,
	aiPolicyInputSchema,
	aiTestSchema,
} from "@/lib/validation/ai";
import { type ActionResult, fromZod } from "@/lib/validation/common";

// Einstellungen > KI (ADR-032): Schlüssel, Anbieter, Modell, Funktionen und
// Einstufung je Organisation. Nur Inhaber:innen, mit Step-up. Einschalten,
// Lockern, neuer Anbieter oder Schlüssel über Vier-Augen (Art ai_policy);
// Ausschalten, Verschärfen und Schlüssel entfernen wirken sofort.

const PATH = "/einstellungen";

// Schlüssel speichern (verschlüsselt); wirkt erst mit der Regel
async function saveAiKeyImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; keyHint: string }>> {
	const c = await requireStepUp({ settings: ["update"] });
	if (c.orgRole !== "owner") return { ok: false, error: "forbidden" };
	const parsed = aiKeySchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const info = await mutateOrg(toOrgCtx(c), async (tx) => {
		const cred = await storeCredential(tx, c.orgId, {
			provider: parsed.data.provider,
			key: parsed.data.key,
			userId: c.userId,
		});
		return {
			result: cred,
			audit: {
				action: "ai.credential_added",
				target: `ai_credential:${cred.id}`,
				after: { provider: cred.provider, keyHint: cred.keyHint },
			},
		};
	});
	revalidatePath(PATH);
	return { ok: true, data: { id: info.id, keyHint: keyHint(parsed.data.key) } };
}

// Verbindung testen: kurze Anfrage ohne Inhalte der Org
async function testAiKeyImpl(
	input: unknown,
): Promise<ActionResult<{ ms: number }>> {
	const c = await requireOrg({ settings: ["update"] });
	if (c.orgRole !== "owner") return { ok: false, error: "forbidden" };
	const parsed = aiTestSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const target = endpointProblem(parsed.data);
	if (target) return { ok: false, error: target };
	const res = await testAiConnection(c, parsed.data);
	revalidatePath(PATH);
	return res;
}

// Adresse bei Azure und „OpenAI-kompatibel“ vorab prüfen
function endpointProblem(p: {
	provider: AiPolicy["provider"];
	endpoint: string | null;
	deployment: string | null;
}): string | null {
	if (p.provider === "azure_openai") {
		if (!p.endpoint || !p.deployment) return "ai_config";
		const host = p.endpoint.replace(/^https:\/\//, "").replace(/\/.*$/, "");
		return aiTargetAllowed("azure_openai", `https://${host}/`).ok
			? null
			: "ai_host_not_allowed";
	}
	if (p.provider === "openai_compatible") {
		if (!p.endpoint) return "ai_config";
		return aiTargetAllowed("openai_compatible", p.endpoint).ok
			? null
			: "ai_host_not_allowed";
	}
	return null;
}

// Regel speichern: strenger sofort, lockerer über Vier-Augen
async function saveAiPolicyImpl(input: unknown): Promise<ActionResult> {
	const c = await requireStepUp({ settings: ["update"] });
	if (c.orgRole !== "owner") return { ok: false, error: "forbidden" };
	const parsed = aiPolicyInputSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const admin = aiAdminOf(await orgAiRow(c.orgId));
	const { dpaConfirmed, ...form } = parsed.data;
	const { current, credential } = await readOrg(toOrgCtx(c), async (tx) => {
		const current = await loadAiPolicy(tx, c.orgId);
		const credential = form.credentialId
			? await credentialInfo(tx, c.orgId, form.credentialId)
			: null;
		return { current, credential };
	});
	if (form.credentialId && credential?.provider !== form.provider)
		return { ok: false, error: "ai_no_key" };
	const next: AiPolicy = {
		...current,
		...form,
		// nie über die Obergrenze des Klick-Admins
		maxClass: minClass(form.maxClass, admin.maxClass),
		dpaConfirmedAt: dpaConfirmed
			? (current.dpaConfirmedAt ?? new Date().toISOString())
			: null,
		dpaConfirmedBy: dpaConfirmed ? (current.dpaConfirmedBy ?? c.userId) : null,
	};
	if (next.enabled) {
		if (!admin.enabled) return { ok: false, error: "ai_off_admin" };
		if (!dpaConfirmed) return { ok: false, error: "ai_dpa_required" };
		if (!aiPolicyComplete(next)) return { ok: false, error: "ai_incomplete" };
		const target = endpointProblem(next);
		if (target) return { ok: false, error: target };
	}
	if (JSON.stringify(next) === JSON.stringify(current))
		return { ok: true, data: undefined };
	const relaxed = aiPolicyRelaxed(current, next);
	if (relaxed.length > 0)
		return requestApplyChange(c, {
			kind: "ai_policy",
			targetKey: null,
			summary: current.enabled
				? `KI-Regel lockern (${next.provider ?? "-"}, ${next.model ?? "-"})`
				: `KI einschalten (${next.provider ?? "-"}, ${next.model ?? "-"})`,
			payload: { value: next, relaxed },
			before: current,
		});
	await mutateOrg(toOrgCtx(c), async (tx) => {
		await tx
			.update(orgSettings)
			.set({ aiPolicy: next })
			.where(eq(orgSettings.organizationId, c.orgId));
		return {
			result: null,
			audit: {
				action: "settings.ai_policy",
				target: `organization:${c.orgId}`,
				before: current,
				after: next,
			},
		};
	});
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

// Schlüssel entfernen: KI sofort aus, alle Schlüssel weg
async function removeAiKeysImpl(): Promise<ActionResult> {
	const c = await requireStepUp({ settings: ["update"] });
	if (c.orgRole !== "owner") return { ok: false, error: "forbidden" };
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const current = await loadAiPolicy(tx, c.orgId);
		const next: AiPolicy = { ...current, enabled: false, credentialId: null };
		await tx
			.update(orgSettings)
			.set({ aiPolicy: next })
			.where(eq(orgSettings.organizationId, c.orgId));
		const removed = await pruneCredentials(tx, c.orgId, null);
		return {
			result: null,
			audit: {
				action: "ai.credentials_removed",
				target: `organization:${c.orgId}`,
				before: {
					enabled: current.enabled,
					credentialId: current.credentialId,
				},
				after: { enabled: false, removed },
			},
		};
	});
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

export const saveAiKey = safeAction("saveAiKey", saveAiKeyImpl);
export const testAiKey = safeAction("testAiKey", testAiKeyImpl);
export const saveAiPolicy = safeAction("saveAiPolicy", saveAiPolicyImpl);
export const removeAiKeys = safeAction("removeAiKeys", removeAiKeysImpl);
