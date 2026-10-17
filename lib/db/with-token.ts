import { eq, sql } from "drizzle-orm";
import { globalDb } from "@/db";
import { type AccessToken, accessTokens } from "@/db/schema";
import type { AccessTokenKind } from "@/db/schema/enums";
import {
	hashToken,
	type TokenState,
	tokenKindOf,
	tokenState,
} from "@/lib/security/tokens";

// Token-Auflösung ohne Org-Kontext (ADR-017). Die Transaktion setzt nur
// app.token_hash; die SELECT-Policy access_tokens_by_hash gibt genau die Zeile
// mit diesem Hash frei — keine andere Tabelle, kein Plattform-Zugriff. Die
// eigentliche Arbeit läuft danach mit der Org des Tokens über
// withOrg/mutateOrg (RLS wie gewohnt). Tokens liegen in der globalen DB, auch
// für Orgs mit eigener Datenbank (lib/db/router.ts).

export type ResolvedToken = Pick<
	AccessToken,
	| "id"
	| "organizationId"
	| "kind"
	| "name"
	| "scopes"
	| "subjectType"
	| "subjectId"
	| "expiresAt"
	| "revokedAt"
>;

export async function resolveToken(
	raw: string,
	kind: AccessTokenKind,
	now = new Date(),
): Promise<
	| { ok: true; token: ResolvedToken }
	| { ok: false; error: "invalid" | Exclude<TokenState, "ok"> }
> {
	if (tokenKindOf(raw) !== kind) return { ok: false, error: "invalid" };
	const hash = hashToken(raw);
	const row = await globalDb.transaction(async (tx) => {
		await tx.execute(sql`set transaction read only`);
		await tx.execute(sql`select set_config('app.token_hash', ${hash}, true)`);
		const [r] = await tx
			.select({
				id: accessTokens.id,
				organizationId: accessTokens.organizationId,
				kind: accessTokens.kind,
				name: accessTokens.name,
				scopes: accessTokens.scopes,
				subjectType: accessTokens.subjectType,
				subjectId: accessTokens.subjectId,
				expiresAt: accessTokens.expiresAt,
				revokedAt: accessTokens.revokedAt,
			})
			.from(accessTokens)
			.where(eq(accessTokens.tokenHash, hash))
			.limit(1);
		return r ?? null;
	});
	if (!row || row.kind !== kind) return { ok: false, error: "invalid" };
	const state = tokenState(row, now);
	if (state !== "ok") return { ok: false, error: state };
	return { ok: true, token: row };
}
