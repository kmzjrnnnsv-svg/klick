import { user } from "@wallet/db/auth-schema";
import type { OrgTx } from "@wallet/lib/db/with-org";
import { inArray } from "drizzle-orm";

// Anzeigenamen zu Nutzer-IDs aus Zeilen dieser Org (Anlage, Freigabe, Veto).
// Auch ausgeschiedene Mitglieder bleiben so im Verlauf erkennbar.
export async function userNames(
	tx: OrgTx,
	ids: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
	const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
	if (unique.length === 0) return new Map();
	const rows = await tx
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(inArray(user.id, unique));
	return new Map(rows.map((r) => [r.id, r.name || r.email]));
}
