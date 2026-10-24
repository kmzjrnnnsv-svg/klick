import { members } from "@wallet/db/schema";
import { type Permission, roleAllows } from "@wallet/lib/auth/permissions";
import type { OrgTx } from "@wallet/lib/db/with-org";
import { eq } from "drizzle-orm";

// Empfänger:innen nach Rechten (Schnittstelle wie Klicks membersAllowed,
// damit der übernommene Wallet-Code unverändert bleibt). „approve“ heißt in
// both.money Absichten bearbeiten; Geld gibt nur der Sicherheitsschlüssel frei.
type WalletRight = "read" | "initiate" | "approve" | "manage";

const MAP: Record<WalletRight, Permission> = {
	read: "wallet:read",
	initiate: "wallet:initiate",
	approve: "wallet:initiate",
	manage: "wallet:manage",
};

export async function membersAllowed(
	tx: OrgTx,
	orgId: string,
	required: { wallet?: readonly WalletRight[] },
): Promise<string[]> {
	const rows = await tx
		.select({ userId: members.userId, role: members.role })
		.from(members)
		.where(eq(members.organizationId, orgId));
	const need = (required.wallet ?? []).map((r) => MAP[r]);
	return rows
		.filter((m) => need.every((p) => roleAllows(m.role, p)))
		.map((m) => m.userId);
}
