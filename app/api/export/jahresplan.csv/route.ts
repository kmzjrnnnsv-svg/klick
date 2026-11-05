import { NextResponse } from "next/server";
import {
	auditExport,
	csvResponse,
	exportGuard,
	stamp,
} from "@/lib/export/respond";
import { ISMS_CSV_HEADER, ismsCsvRows } from "@/lib/isms-plan/export";
import {
	ismsExportLabels,
	loadIsmsPlanView,
} from "@/lib/isms-plan/export-server";

export const dynamic = "force-dynamic";

// ISMS-Jahresplan als CSV (P2c): je Punkt Turnus, Prüfaufwand, Umsetzung, PT
// je Jahr und ISB-Anteil nach Anpassung der Org, Stand aus Klick. Für
// Tabellen und Planungswerkzeuge; auditiert mit Export-ID.
export async function GET() {
	const ctx = await exportGuard();
	if (ctx instanceof NextResponse) return ctx;
	const view = await loadIsmsPlanView(ctx);
	const rows = ismsCsvRows(view, await ismsExportLabels());
	const mark = await auditExport(ctx, "isms_plan_csv", rows.length);
	return csvResponse(`jahresplan-${stamp()}.csv`, ISMS_CSV_HEADER, rows, mark);
}
