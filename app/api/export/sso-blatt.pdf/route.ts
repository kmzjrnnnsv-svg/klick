import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getOrgSummary } from "@/lib/auth/org";
import { isSamlVendor } from "@/lib/auth/sso-saml-vendors";
import { ssoSheet } from "@/lib/auth/sso-sheet";
import { env } from "@/lib/env";
import { renderPdf } from "@/lib/export/pdf";
import {
	auditExport,
	exportMarkLine,
	exportStepUpGuard,
} from "@/lib/export/respond";
import { contentDisposition } from "@/lib/http/disposition";
import { ssoProviderIdSchema } from "@/lib/validation/sso";

export const dynamic = "force-dynamic";

// Blatt für die IT (AP10d): Werte und Schritte für die SAML-Einrichtung bei
// einem Anbieter (?anbieter=&domain=&kennung=). Nur Inhaber:innen, Step-up und
// Export-ID wie alle Downloads; keine Geheimnisse im Blatt.
const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/;

export async function GET(req: Request) {
	const ctx = await exportStepUpGuard(req);
	if (ctx instanceof NextResponse) return ctx;
	if (ctx.orgRole !== "owner") return new NextResponse(null, { status: 403 });
	const url = new URL(req.url);
	const vendor = url.searchParams.get("anbieter") ?? "";
	const domain = (url.searchParams.get("domain") ?? "").toLowerCase();
	const id = ssoProviderIdSchema.safeParse(url.searchParams.get("kennung"));
	if (!isSamlVendor(vendor) || !DOMAIN_RE.test(domain) || !id.success)
		return new NextResponse(null, { status: 400 });
	const t = await getTranslations("SsoSetup");
	const mark = await auditExport(ctx, "sso_sheet", 1, {
		vendor,
		domain,
		providerId: id.data,
	});
	const now = new Date();
	const pdf = renderPdf(
		ssoSheet({
			orgName: (await getOrgSummary(ctx.orgId))?.name ?? "",
			vendor,
			vendorLabel: t(`vendor_${vendor}`),
			domain,
			providerId: id.data,
			origin: new URL(env().BETTER_AUTH_URL).origin,
			steps: t.raw(`samlSteps_${vendor}`) as string[],
			exportLine: exportMarkLine(mark),
			date: now.toISOString().slice(0, 10),
		}),
		{ now },
	);
	return new NextResponse(new Uint8Array(pdf), {
		status: 200,
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": contentDisposition(`klick-sso-${id.data}.pdf`),
			"Content-Length": String(pdf.byteLength),
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "sandbox",
			"X-Export-Id": mark.exportId,
		},
	});
}
