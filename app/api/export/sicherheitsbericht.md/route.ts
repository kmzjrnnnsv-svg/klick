import { NextResponse } from "next/server";
import { toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import { allows } from "@/lib/auth/permissions";
import { listFindings, listScans } from "@/lib/compliance/queries-security";
import { readOrg } from "@/lib/db/with-org";
import {
	auditExport,
	exportGuard,
	markdownResponse,
	stamp,
} from "@/lib/export/respond";
import { buildSecurityReport } from "@/lib/export/security-report";

export const dynamic = "force-dynamic";

// Sicherheitsbericht (Markdown): auditiert, mit Export-ID.
export async function GET() {
	const ctx = await exportGuard();
	if (ctx instanceof NextResponse) return ctx;
	if (!allows(ctx, { security: ["read"] }))
		return new NextResponse(null, { status: 403 });
	const data = await readOrg(toOrgCtx(ctx), async (tx) => ({
		findings: await listFindings(tx, ctx.orgId),
		scans: await listScans(tx, ctx.orgId, 50),
	}));
	const org = await getOrgSummary(ctx.orgId);
	const body = buildSecurityReport({
		orgName: org?.name ?? "",
		findings: data.findings,
		scans: data.scans,
	});
	const mark = await auditExport(ctx, "security_md", data.findings.length);
	return markdownResponse(`sicherheitsbericht-${stamp()}.md`, body, mark);
}
