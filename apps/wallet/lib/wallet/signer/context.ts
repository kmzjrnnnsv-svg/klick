import { walletSignerAnchor } from "@wallet/db/schema";
import type { OrgTx } from "@wallet/lib/db/with-org";
import type { SignerState } from "@wallet/lib/wallet/signer/status";
import { eq } from "drizzle-orm";

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
