import type { OrgRole } from "@/lib/auth/permissions";
import type { OrgTx } from "@/lib/db/with-org";
import { buildNav } from "@/lib/nav";
import { getOrgSettings, listOrgFrameworks } from "@/lib/org/queries";
import { hasWalletLink } from "@/lib/wallet-link-ingest/queries";

// Navigation der Org (Layout und Bereichslisten /bereich/<tab> lesen
// dieselbe Ableitung) — innerhalb von readOrg.
export async function loadOrgNav(
	tx: OrgTx,
	ctx: { orgId: string; orgRole: OrgRole },
) {
	const settings = await getOrgSettings(tx, ctx.orgId);
	const fws = await listOrgFrameworks(tx, ctx.orgId);
	const walletLinked = await hasWalletLink(tx, ctx.orgId);
	const groups = buildNav({
		frameworks: fws.map((f) => ({ slug: f.slug, name: f.name })),
		licenceStage: settings?.licenceStage ?? "0_vorbereitung",
		caspServices: settings?.caspServices ?? [],
		role: ctx.orgRole,
		walletLinked,
	});
	return { settings, groups };
}
