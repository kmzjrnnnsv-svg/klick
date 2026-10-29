import { eq } from "drizzle-orm";
import { orgSettings } from "@/db/schema";
import type { Classification } from "@/db/schema/enums";
import type { OrgContext } from "@/lib/auth/guards";
import { toOrgCtx } from "@/lib/auth/guards";
import { orgAiRow } from "@/lib/db/org-accounts";
import { mutateOrg, type OrgTx, readOrg } from "@/lib/db/with-org";
import type { DlpCategory } from "@/lib/dlp/detectors";
import { redactText } from "@/lib/dlp/redact";
import { logger } from "@/lib/log";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/validation/common";
import { credentialInfo, credentialKey, markTested } from "./credentials";
import { type AiDenied, aiDecision } from "./guard";
import { type AiTransport, httpsTransport } from "./http";
import {
	type AiAdmin,
	type AiFeature,
	type AiPolicy,
	aiAdminOf,
	aiPolicyOf,
} from "./policy";
import { type AiFile, type AiMessage, complete } from "./providers";

// Ein KI-Aufruf (ADR-032): Regeln prüfen (Admin, Org, Funktion,
// Einstufung), Schlüssel entschlüsseln, Text schwärzen, Anfrage, Antwort
// als reiner Text. Jeder Aufruf steht im Verlauf der Org (ai.request) mit
// Funktion, Anbieter, Modell, Ziel, Zeichen, geschwärzten Treffern, Tokens,
// Dauer und Ergebnis — nie mit Inhalten. Nur auf Klick, nie im Hintergrund.

// je Org höchstens 30 Aufrufe in 10 Minuten (Kosten trägt die Org)
const limiter = new SlidingWindowLimiter(30, 10 * 60_000);
export const MAX_INPUT_CHARS = 200_000;

let transport: AiTransport = httpsTransport();
export function setAiTransportForTests(t: AiTransport | null): void {
	transport = t ?? httpsTransport();
}

export type AiState = {
	admin: AiAdmin;
	policy: AiPolicy;
};

export async function loadAiPolicy(
	tx: OrgTx,
	orgId: string,
): Promise<AiPolicy> {
	const [row] = await tx
		.select({ aiPolicy: orgSettings.aiPolicy })
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	return aiPolicyOf(row?.aiPolicy);
}

export async function aiState(tx: OrgTx, orgId: string): Promise<AiState> {
	return {
		admin: aiAdminOf(await orgAiRow(orgId)),
		policy: await loadAiPolicy(tx, orgId),
	};
}

export type AiRequest = {
	feature: AiFeature;
	// Einstufung der Inhalte; null = keine Firmendaten (Hilfe)
	classification: Classification | null;
	// Ziel im Verlauf, z. B. document:<id>
	target: string;
	system: string;
	messages: AiMessage[];
	files?: { file: AiFile; dlpCategories: DlpCategory[] }[];
	maxTokens?: number;
};

export type AiAnswer = {
	text: string;
	provider: string;
	model: string;
	redacted: number;
};

// Gründe der Prüfung als Fehlercode (ein „ai_“ vorn, nie zwei)
const aiCode = (reason: AiDenied): string =>
	reason.startsWith("ai_") ? reason : `ai_${reason}`;

export async function runAi(
	c: OrgContext,
	req: AiRequest,
): Promise<ActionResult<AiAnswer>> {
	const started = Date.now();
	const loaded = await readOrg(toOrgCtx(c), async (tx) => {
		const state = await aiState(tx, c.orgId);
		const cred = state.policy.credentialId
			? await credentialKey(tx, c.orgId, state.policy.credentialId)
			: null;
		return { ...state, cred };
	});
	const { admin, policy, cred } = loaded;
	for (const f of req.files ?? [null]) {
		const d = aiDecision(admin, policy, req.feature, {
			classification: req.classification,
			file: f ? { dlpCategories: f.dlpCategories } : null,
		});
		if (!d.ok) return { ok: false, error: aiCode(d.reason) };
	}
	if (!cred || cred.provider !== policy.provider || !policy.provider)
		return { ok: false, error: "ai_no_key" };
	if (!limiter.check(c.orgId).allowed)
		return { ok: false, error: "rate_limited" };

	// Schwärzen: jede Nachricht; Zähler je Detektor für den Verlauf
	const counts: Record<string, number> = {};
	let redacted = 0;
	const messages = req.messages.map((m) => {
		const r = redactText(m.content);
		redacted += r.total;
		for (const [k, n] of Object.entries(r.counts))
			counts[k] = (counts[k] ?? 0) + (n ?? 0);
		return { role: m.role, content: r.text };
	});
	const chars =
		req.system.length + messages.reduce((s, m) => s + m.content.length, 0);
	if (chars > MAX_INPUT_CHARS) return { ok: false, error: "ai_too_long" };

	const model = policy.model ?? "";
	const result = await complete(
		{
			provider: policy.provider,
			model,
			endpoint: policy.endpoint,
			deployment: policy.deployment,
			key: cred.key,
		},
		{
			system: req.system,
			messages,
			files: req.files?.map((f) => f.file),
			maxTokens: req.maxTokens ?? 2000,
		},
		transport,
	);
	const ms = Date.now() - started;
	await mutateOrg(toOrgCtx(c), async () => ({
		result: null,
		audit: {
			action: "ai.request",
			target: req.target,
			after: {
				feature: req.feature,
				provider: policy.provider,
				model,
				classification: req.classification,
				chars,
				files: req.files?.length ?? 0,
				redacted: counts,
				tokens: result.ok ? result.usage : null,
				ms,
				outcome: result.ok ? "ok" : result.error,
				status: result.ok ? null : (result.status ?? null),
			},
		},
	}));
	if (!result.ok) {
		logger.warn(
			{ orgId: c.orgId, feature: req.feature, error: result.error },
			"ai: Anfrage fehlgeschlagen",
		);
		return { ok: false, error: `ai_${result.error}` };
	}
	return {
		ok: true,
		data: { text: result.text, provider: policy.provider, model, redacted },
	};
}

// Verbindung testen: kurze Anfrage ohne Inhalte der Org; vermerkt das
// Ergebnis am Schlüssel. Gilt für einen gespeicherten, noch nicht
// wirksamen Schlüssel genauso (vor dem Antrag auf Vier-Augen).
export async function testAiConnection(
	c: OrgContext,
	draft: Pick<AiPolicy, "provider" | "model" | "endpoint" | "deployment"> & {
		credentialId: string;
	},
): Promise<ActionResult<{ ms: number }>> {
	if (!draft.provider || !draft.model) return { ok: false, error: "invalid" };
	if (!limiter.check(c.orgId).allowed)
		return { ok: false, error: "rate_limited" };
	const cred = await readOrg(toOrgCtx(c), async (tx) =>
		(await credentialInfo(tx, c.orgId, draft.credentialId))
			? credentialKey(tx, c.orgId, draft.credentialId)
			: null,
	);
	if (!cred || cred.provider !== draft.provider)
		return { ok: false, error: "ai_no_key" };
	const started = Date.now();
	const r = await complete(
		{
			provider: draft.provider,
			model: draft.model,
			endpoint: draft.endpoint,
			deployment: draft.deployment,
			key: cred.key,
		},
		{
			system: "Antworte nur mit: ok",
			messages: [{ role: "user", content: "Verbindungstest" }],
			maxTokens: 16,
		},
		transport,
	);
	const ms = Date.now() - started;
	await mutateOrg(toOrgCtx(c), async (tx) => {
		await markTested(tx, c.orgId, draft.credentialId, r.ok);
		return {
			result: null,
			audit: {
				action: "ai.connection_test",
				target: `ai_credential:${draft.credentialId}`,
				after: {
					provider: draft.provider,
					model: draft.model,
					ms,
					outcome: r.ok ? "ok" : r.error,
					status: r.ok ? null : (r.status ?? null),
				},
			},
		};
	});
	return r.ok
		? { ok: true, data: { ms } }
		: { ok: false, error: `ai_${r.error}` };
}
