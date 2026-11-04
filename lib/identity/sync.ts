import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { createGoogleGet, type GoogleGet } from "@/lib/google/client";
import { googleHttpsTransport } from "@/lib/google/http";
import { createMsGet } from "@/lib/microsoft/graph-client";
import { msHttpsTransport } from "@/lib/microsoft/http";
import type { MsGet } from "@/lib/microsoft/types";
import { identityGoogleAccount, identityMsConfig } from "./config";
import { fetchEntraSnapshot } from "./providers/entra";
import { fetchGoogleSnapshot } from "./providers/google";
import {
	applySnapshot,
	evaluateIdentityChecks,
	recordSyncError,
	syncContext,
} from "./service";
import type { ProviderResult, ProviderSnapshot } from "./types";

// Abruf einer Quelle (Teil D): lesen, Anbieter ohne offene Transaktion
// fragen, danach in einer kurzen Transaktion schreiben und die Prüfungen
// fortschreiben. Fehler bleiben an der Quelle stehen; alte Daten bleiben.

export type SyncDeps = { msGet?: MsGet; googleGet?: GoogleGet; now?: Date };

// Identität liest Seiten mit bis zu 999 Konten: längere Frist, mehr Platz
export function identityMsGet(): MsGet | null {
	const config = identityMsConfig();
	if (!config) return null;
	return createMsGet(
		config,
		msHttpsTransport({ timeoutMs: 60_000, maxBytes: 16 * 1024 * 1024 }),
	);
}

// Google: Dienstkonto „Klick Identität“, Token je Admin-Adresse
export function identityGoogleGet(): GoogleGet | null {
	const sa = identityGoogleAccount();
	return sa ? createGoogleGet(sa, googleHttpsTransport()) : null;
}

const adminEmailOf = (settings: unknown): string | null => {
	const v = (settings as { adminEmail?: unknown } | null)?.adminEmail;
	return typeof v === "string" && v.includes("@") ? v : null;
};

export async function syncIdentitySource(
	orgId: string,
	sourceId: string,
	deps: SyncDeps = {},
): Promise<"ok" | "error" | "skipped"> {
	const ctx = { orgId, userId: null };
	const now = deps.now ?? new Date();
	const pre = await readOrg(ctx, (tx) => syncContext(tx, orgId, sourceId));
	if (!pre || pre.source.status === "pending_consent") return "skipped";
	let snap: ProviderResult<ProviderSnapshot>;
	if (pre.source.provider === "entra") {
		const get = deps.msGet ?? identityMsGet();
		snap = get
			? await fetchEntraSnapshot(get, pre.source.tenantKey)
			: { ok: false, error: "token_failed" };
	} else if (pre.source.provider === "google") {
		const get = deps.googleGet ?? identityGoogleGet();
		const subject = adminEmailOf(pre.source.settings);
		snap =
			get && subject
				? await fetchGoogleSnapshot(get, subject, pre.source.tenantKey)
				: { ok: false, error: get ? "consent_missing" : "token_failed" };
	} else snap = { ok: false, error: "bad_response" }; // Okta folgt (I4)
	return mutateOrg(ctx, async (tx) => {
		if (!snap.ok) {
			const audit = await recordSyncError(tx, ctx, pre.source, snap.error, now);
			const checks = await evaluateIdentityChecks(tx, ctx, now);
			return { result: "error" as const, audit: [audit, ...checks] };
		}
		const audit = await applySnapshot(tx, ctx, {
			source: pre.source,
			members: pre.members,
			snapshot: snap.value,
			now,
		});
		const checks = await evaluateIdentityChecks(tx, ctx, now);
		return { result: "ok" as const, audit: [audit, ...checks] };
	});
}
