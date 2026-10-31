import { NextResponse } from "next/server";
import type { SiteTunnel } from "@/db/schema";
import { renderPdf } from "@/lib/export/pdf";
import { contentDisposition } from "@/lib/http/disposition";
import { siteConfig } from "./agent-client";
import { tunnelValues } from "./config";
import { siteSheet } from "./sheet";
import { isSiteVendor } from "./vendors";

// PDF-Antwort für das Blatt (Admin-Portal und Einstellungen > Netzwerk).
export function siteSheetResponse(
	row: SiteTunnel,
	orgName: string,
	exportId: string,
	exportLine: string,
): NextResponse {
	const cfg = siteConfig();
	if (!cfg.publicIp) return new NextResponse(null, { status: 409 });
	const now = new Date();
	const pdf = renderPdf(
		siteSheet({
			orgName,
			tunnelName: row.name,
			vendor: isSiteVendor(row.vendor) ? row.vendor : "other",
			values: tunnelValues(row, {
				publicIp: cfg.publicIp,
				wgPublicKey: cfg.wgPublicKey,
				host: cfg.host,
			}),
			exportLine,
			date: now.toISOString().slice(0, 10),
		}),
		{ now },
	);
	const slug = row.name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 40);
	return new NextResponse(new Uint8Array(pdf), {
		status: 200,
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": contentDisposition(
				`klick-standort-${slug || "tunnel"}.pdf`,
			),
			"Content-Length": String(pdf.byteLength),
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "sandbox",
			"X-Export-Id": exportId,
		},
	});
}
