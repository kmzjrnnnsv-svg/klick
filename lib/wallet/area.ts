import { eq } from "drizzle-orm";
import { cache } from "react";
import { orgSettings } from "@/db/schema";
import { readOrg } from "@/lib/db/with-org";

// Wallet-Bereich je Org (org_settings.wallet_enabled, Standard aus). Die
// Inhaber:in schaltet ihn unter Einstellungen → Organisation ein; ohne
// Schalter gibt es keinen Umschalter, keine Wallet-Seite und keine Action.
export const walletAreaEnabled = cache(async (orgId: string) => {
	const [row] = await readOrg({ orgId, userId: null }, (tx) =>
		tx
			.select({ on: orgSettings.walletEnabled })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, orgId))
			.limit(1),
	);
	return row?.on ?? false;
});
