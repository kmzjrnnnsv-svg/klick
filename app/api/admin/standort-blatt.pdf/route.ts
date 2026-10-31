import { NextResponse } from "next/server";
import { auditPlatform } from "@/lib/audit";
import { AuthError, requirePlatformStepUp } from "@/lib/auth/guards";
import { adminOrg } from "@/lib/db/admin-orgs";
import { orgSiteTunnels } from "@/lib/db/site-tunnels";
import { siteSheetResponse } from "@/lib/site-tunnels/sheet-pdf";

export const dynamic = "force-dynamic";

// Blatt für die IT (Standort-Tunnel, ADR-033) aus dem Admin-Portal:
// ?org=&id=. Plattform-Admin mit Step-up, nur aus dem Admin-Netz (nginx und
// requirePlatformStepUp). Kein Geheimnis im Blatt.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
	let admin: Awaited<ReturnType<typeof requirePlatformStepUp>>;
	try {
		admin = await requirePlatformStepUp();
	} catch (e) {
		if (e instanceof AuthError)
			return new NextResponse(null, {
				status: e.code === "unauthenticated" ? 401 : 403,
			});
		throw e;
	}
	const url = new URL(req.url);
	const orgId = url.searchParams.get("org") ?? "";
	const id = url.searchParams.get("id") ?? "";
	if (!UUID.test(orgId) || !UUID.test(id))
		return new NextResponse(null, { status: 400 });
	const org = await adminOrg(orgId);
	const row = (await orgSiteTunnels(orgId)).find(
		(t) => t.id === id && !t.removedAt,
	);
	if (!org || !row) return new NextResponse(null, { status: 404 });
	const exportId = crypto.randomUUID();
	await auditPlatform(
		{ userId: admin.userId, ip: admin.ip, userAgent: admin.userAgent },
		{
			action: "export.site_sheet",
			target: `site_tunnel:${id}`,
			after: { orgId, exportId },
		},
	);
	const at = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	}).format(new Date());
	return siteSheetResponse(
		row,
		org.name,
		exportId,
		`> Exportiert vom Klick-Betrieb am ${at} · Export-ID ${exportId}`,
	);
}
