import { orgSettings } from "@wallet/db/schema";
import type { OrgTx } from "@wallet/lib/db/with-org";
import type { CustodyFacts } from "@wallet/lib/wallet/custody-gate";
import { eq } from "drizzle-orm";

// Verwahrmodus der Org (Org-Kontext); ohne Zeile gilt „none“
export async function custodyFacts(
	tx: OrgTx,
	orgId: string,
): Promise<CustodyFacts> {
	const [s] = await tx
		.select({
			custodyMode: orgSettings.custodyMode,
			isOperator: orgSettings.isOperator,
		})
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	return s ?? { custodyMode: "none", isOperator: false };
}
