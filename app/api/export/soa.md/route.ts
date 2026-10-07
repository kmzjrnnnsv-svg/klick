import { NextResponse } from "next/server";
import { toOrgCtx } from "@/lib/auth/guards";
import {
	listEvidenceWithControls,
	orgCoverage,
} from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { buildSoaMarkdown } from "@/lib/export/builders";
import {
	auditExport,
	exportGuard,
	markdownResponse,
	stamp,
} from "@/lib/export/respond";

export const dynamic = "force-dynamic";

// Statement of Applicability (ISO 27001 6.1.3 d) als Markdown — abgeleitet
// aus Anwendbarkeit, Control-Status und Nachweisen; nie separat gepflegt.
export async function GET() {
	const ctx = await exportGuard();
	if (ctx instanceof NextResponse) return ctx;
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const cov = await orgCoverage(tx, ctx.orgId);
		if (!cov?.frameworks.includes("iso27001")) return null;
		const ev = await listEvidenceWithControls(tx, ctx.orgId);
		const evidenceByControl = new Map<string, number>();
		for (const e of ev)
			for (const code of e.controlCodes)
				evidenceByControl.set(code, (evidenceByControl.get(code) ?? 0) + 1);
		return { cov, evidenceByControl };
	});
	if (!data) return new NextResponse("ISO 27001 nicht aktiv", { status: 400 });
	const body = buildSoaMarkdown(data.cov, data.evidenceByControl, stamp());
	if (!body) return new NextResponse("ISO 27001 nicht aktiv", { status: 400 });
	await auditExport(ctx, "soa_md", body.split("\n").length);
	return markdownResponse(`soa-iso27001-${stamp()}.md`, body);
}
