import type { OrgRole } from "@/lib/auth/permissions";
import { myAuditId } from "@/lib/compliance/audit-workspace";
import { listAuditAssignments } from "@/lib/compliance/queries-p3";
import type { OrgTx } from "@/lib/db/with-org";
import { buildNav } from "@/lib/nav";
import { getOrgSettings, listOrgFrameworks } from "@/lib/org/queries";
import { hasWalletLink } from "@/lib/wallet-link-ingest/queries";

// Navigation der Org (Layout und Bereichslisten /bereich/<tab> lesen
// dieselbe Ableitung) — innerhalb von readOrg.
export async function loadOrgNav(
	tx: OrgTx,
	ctx: { orgId: string; orgRole: OrgRole; userId: string },
) {
	const settings = await getOrgSettings(tx, ctx.orgId);
	const fws = await listOrgFrameworks(tx, ctx.orgId);
	const walletLinked = await hasWalletLink(tx, ctx.orgId);
	// Prüfer:innen: Menü um ihr Audit (Anfragen, Prüfpfad)
	const auditId =
		ctx.orgRole === "auditor"
			? myAuditId(await listAuditAssignments(tx, ctx.orgId), ctx.userId)
			: null;
	const groups = buildNav({
		frameworks: fws.map((f) => ({ slug: f.slug, name: f.name })),
		licenceStage: settings?.licenceStage ?? "0_vorbereitung",
		caspServices: settings?.caspServices ?? [],
		role: ctx.orgRole,
		walletLinked,
		auditId,
	});
	return { settings, groups };
}
