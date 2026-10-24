// Legacy (bis K6): Wallet-Bereich in Klick, ersetzt durch both.money —
// Änderungen nur noch in apps/wallet/lib/wallet/signer/context.ts.
import { eq } from "drizzle-orm";
import { walletSignerAnchor } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import type { SignerState } from "./status";

export type SignerAnchor = typeof walletSignerAnchor.$inferSelect;

// Zuletzt gesehener Stand des Signers für diese Org (Journal-Kopf, Bundle,
// eingefroren, seit wann nicht erreichbar)
export async function loadSignerAnchor(
	tx: OrgTx,
	orgId: string,
): Promise<SignerAnchor | null> {
	const [anchor] = await tx
		.select()
		.from(walletSignerAnchor)
		.where(eq(walletSignerAnchor.organizationId, orgId))
		.limit(1);
	return anchor ?? null;
}

// Signer gehört zu dieser Org: bereit oder eingefroren (hello nennt die
// Org), oder schon einmal gesehen und gerade nicht erreichbar. Nur dann
// gibt es Senden, Banner und die Navigation dafür.
export const isOwnSigner = (state: SignerState, anchor: SignerAnchor | null) =>
	state === "ready" ||
	state === "frozen" ||
	(state === "unreachable" && anchor !== null);
