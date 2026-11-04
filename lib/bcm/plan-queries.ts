import { and, eq } from "drizzle-orm";
import { bcmPlans } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";

// Notfallplan eines Prozesses lesen (immer in readOrg/withOrg)
export async function bcmPlanFor(tx: OrgTx, orgId: string, processId: string) {
	const [plan] = await tx
		.select()
		.from(bcmPlans)
		.where(
			and(
				eq(bcmPlans.organizationId, orgId),
				eq(bcmPlans.processId, processId),
			),
		)
		.limit(1);
	return plan ?? null;
}
