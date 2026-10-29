import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { documents } from "@/db/schema";
import { toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import { SIGN_ORIGIN, SIGN_RP_ID } from "@/lib/auth/passkey-sign";
import { allows } from "@/lib/auth/permissions";
import { hidesSecret, restrictedView } from "@/lib/auth/visibility";
import { readOrg } from "@/lib/db/with-org";
import {
	controlledFileName,
	loadControlledSource,
	renderControlledPdf,
} from "@/lib/documents/controlled-export";
import { auditExport, exportStepUpGuard } from "@/lib/export/respond";
import { contentDisposition } from "@/lib/http/disposition";

export const dynamic = "force-dynamic";

// PDF „Gelenkte Fassung“ einer Dokument-Fassung (?nr=<Dokumentnummer>
// &fassung=<Nummer>, ohne Fassung die gültige): Deckblatt, Unterschriften,
// Änderungshistorie, Verteiler, Inhalt; signaturen.json und die Originaldatei
// als Anhang. Step-up + Audit wie alle Pakete; Prüfer-Sicht nur die gültige
// Fassung, streng geheim nur mit Grant. Fremd oder unbekannt → 404.
export async function GET(req: Request) {
	const ctx = await exportStepUpGuard(req);
	if (ctx instanceof NextResponse) return ctx;
	if (!allows(ctx, { document: ["read"] }))
		return new NextResponse(null, { status: 403 });
	const url = new URL(req.url);
	const nr = url.searchParams.get("nr") ?? "";
	const fassung = url.searchParams.get("fassung");
	if (
		!nr ||
		nr.length > 64 ||
		(fassung && !/^\d{1,4}(\.\d{1,4})?$/.test(fassung))
	)
		return new NextResponse(null, { status: 404 });
	const env = { origin: SIGN_ORIGIN, rpId: SIGN_RP_ID };
	const orgName = (await getOrgSummary(ctx.orgId))?.name ?? "";
	const src = await readOrg(toOrgCtx(ctx), async (tx) => {
		const [doc] = await tx
			.select({ id: documents.id, classification: documents.classification })
			.from(documents)
			.where(
				and(
					eq(documents.organizationId, ctx.orgId),
					eq(documents.docNumber, nr),
				),
			)
			.limit(1);
		if (!doc || hidesSecret(ctx, doc)) return null;
		return loadControlledSource(tx, ctx.orgId, doc.id, {
			version: fassung,
			view: restrictedView(ctx) ? "current" : "full",
			env,
			orgName,
		});
	});
	if (!src) return new NextResponse(null, { status: 404 });
	const mark = await auditExport(ctx, "document_pdf", 1, {
		document: src.documentId,
		docNumber: src.docNumber,
		version: src.version,
		signatures: src.signatures.length,
	});
	const pdf = await renderControlledPdf(src, mark, env);
	return new NextResponse(new Uint8Array(pdf), {
		status: 200,
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": contentDisposition(controlledFileName(src)),
			"Content-Length": String(pdf.byteLength),
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "sandbox",
			"X-Export-Id": mark.exportId,
		},
	});
}
