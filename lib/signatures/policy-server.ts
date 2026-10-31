import { eq } from "drizzle-orm";
import { orgSettings } from "@/db/schema";
import { type OrgCtx, readOrg } from "@/lib/db/with-org";
import { type SignaturePolicy, signaturePolicyOf } from "./policy";

// Regel der Org für Unterschriften (AP9.1b), gelesen im Org-Kontext
export async function orgSignaturePolicy(
	ctx: OrgCtx,
): Promise<SignaturePolicy> {
	const row = await readOrg(ctx, async (tx) => {
		const [s] = await tx
			.select({ policy: orgSettings.signaturePolicy })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, ctx.orgId))
			.limit(1);
		return s?.policy ?? null;
	});
	return signaturePolicyOf(row);
}
