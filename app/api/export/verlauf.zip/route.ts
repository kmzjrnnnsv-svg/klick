import { NextResponse } from "next/server";
import { toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import { ledgerExportAllowed } from "@/lib/auth/visibility";
import {
	auditExport,
	exportStepUpGuard,
	stamp,
	zipResponse,
} from "@/lib/export/respond";
import { buildZip, withManifest } from "@/lib/export/zip";
import { ledgerExportEntries } from "@/lib/ledger/export";

export const dynamic = "force-dynamic";

// Verlauf mit Bitcoin-Anker (Härtung V): eigene Kette, Anker, Merkle-Pfade,
// OpenTimestamps-Dateien und pruefen.mjs zum Prüfen ohne Klick. Step-up wie
// alle Pakete; die Kette enthält dieselben Angaben wie das Protokoll, darum
// nur Inhaber:innen und Prüfer:innen (ledgerExportAllowed).
export async function GET(req: Request) {
	const ctx = await exportStepUpGuard(req);
	if (ctx instanceof NextResponse) return ctx;
	if (!ledgerExportAllowed(ctx.orgRole))
		return new NextResponse(null, { status: 403 });
	const org = await getOrgSummary(ctx.orgId);
	if (!org) return new NextResponse(null, { status: 404 });
	const generatedAt = new Date();
	const {
		entries: files,
		rows,
		anchors,
	} = await ledgerExportEntries(toOrgCtx(ctx), generatedAt);
	const { entries, manifest } = withManifest(files, {
		title: "Verlauf mit Bitcoin-Anker",
		generatedAt,
		organization: { id: org.id, name: org.name },
		extra: { entries: rows, anchors },
	});
	const zip = buildZip(entries);
	await auditExport(ctx, "ledger_zip", manifest.files.length, {
		entries: rows,
		anchors,
	});
	return zipResponse(`verlauf-${org.slug}-${stamp()}.zip`, zip);
}
