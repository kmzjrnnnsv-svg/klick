import type { OrgContext } from "@wallet/lib/auth/guards";
import { mutateOrg } from "@wallet/lib/db/with-org";
import { NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";
import { contentDisposition } from "@/lib/http/disposition";
import { getOrgLimiter } from "@/lib/rate-limit";

// Datei-Exporte von both.money: gedrosselt je Org, im Protokoll mit
// Export-ID (steht auch im Antwort-Header), nie im Browser-Cache.

export function rateLimited(orgId: string): NextResponse | null {
	const d = getOrgLimiter().check(orgId);
	if (d.allowed) return null;
	return new NextResponse("Zu viele Anfragen für diese Organisation", {
		status: 429,
		headers: {
			"Retry-After": String(Math.max(1, Math.ceil(d.retryAfterMs / 1000))),
			"Cache-Control": "no-store",
		},
	});
}

export type ExportMark = { exportId: string; by: string; at: Date };

export async function auditExport(
	ctx: OrgContext,
	kind: string,
	rows: number,
): Promise<ExportMark> {
	const mark: ExportMark = {
		exportId: crypto.randomUUID(),
		by: ctx.name || ctx.email,
		at: new Date(),
	};
	await mutateOrg(
		{
			orgId: ctx.orgId,
			userId: ctx.userId,
			ip: ctx.ip,
			userAgent: ctx.userAgent,
		},
		async () => ({
			result: null,
			audit: {
				action: `export.${kind}`,
				target: `org:${ctx.orgId}`,
				after: { rows, exportId: mark.exportId },
			},
		}),
	);
	return mark;
}

export function csvResponse(
	filename: string,
	header: readonly string[],
	rows: readonly unknown[][],
	mark: ExportMark,
): NextResponse {
	return new NextResponse(toCsv(header, rows), {
		status: 200,
		headers: {
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "sandbox",
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": contentDisposition(filename),
			"X-Row-Count": String(rows.length),
			"X-Export-Id": mark.exportId,
		},
	});
}

export function stamp(): string {
	return new Date().toISOString().slice(0, 10);
}
