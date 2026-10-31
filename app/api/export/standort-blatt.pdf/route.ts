import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { siteTunnels } from "@/db/schema";
import { getOrgSummary } from "@/lib/auth/org";
import { readOrg } from "@/lib/db/with-org";
import {
	auditExport,
	exportMarkLine,
	exportStepUpGuard,
} from "@/lib/export/respond";
import { siteSheetResponse } from "@/lib/site-tunnels/sheet-pdf";

export const dynamic = "force-dynamic";

// Blatt für die IT (Standort-Tunnel, ADR-033) unter Einstellungen > Netzwerk:
// ?id=. Nur Inhaber:innen, Step-up und Export-ID wie alle Downloads; kein
// Geheimnis im Blatt.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
	const ctx = await exportStepUpGuard(req);
	if (ctx instanceof NextResponse) return ctx;
	if (ctx.orgRole !== "owner") return new NextResponse(null, { status: 403 });
	const id = new URL(req.url).searchParams.get("id") ?? "";
	if (!UUID.test(id)) return new NextResponse(null, { status: 400 });
	const [row] = await readOrg({ orgId: ctx.orgId, userId: ctx.userId }, (tx) =>
		tx
			.select()
			.from(siteTunnels)
			.where(
				and(
					eq(siteTunnels.organizationId, ctx.orgId),
					eq(siteTunnels.id, id),
					isNull(siteTunnels.removedAt),
				),
			),
	);
	if (!row) return new NextResponse(null, { status: 404 });
	const mark = await auditExport(ctx, "site_sheet", 1, { tunnelId: id });
	return siteSheetResponse(
		row,
		(await getOrgSummary(ctx.orgId))?.name ?? "",
		mark.exportId,
		exportMarkLine(mark),
	);
}
