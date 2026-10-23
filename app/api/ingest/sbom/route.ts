import { and, eq } from "drizzle-orm";
import { products } from "@/db/schema";
import { storeSbom } from "@/lib/compliance/sbom-service";
import { mutateOrg } from "@/lib/db/with-org";
import { s3Configured, screenUpload } from "@/lib/evidence/store";
import { parseIsolated, sbomResultSchema } from "@/lib/parse/client";
import {
	ingestAuth,
	ingestJson,
	ingestRoute,
	readTextBody,
	touchToken,
} from "@/lib/security/ingest";
import { checkSbom } from "@/lib/security/sbom-check";

export const dynamic = "force-dynamic";

// SBOM je Release aus der CI (CRA Anhang I Teil II Nr. 1): Bearer-Token mit
// Scope sbom:write.
//   POST /api/ingest/sbom?product=PRD-001&name=bom.cdx.json
// Body = CycloneDX- oder SPDX-JSON. Antwort: Prüfung nach TR-03183-2.
export const POST = ingestRoute("ingest.sbom", async (req: Request) => {
	const auth = await ingestAuth(req, "sbom:write");
	if (auth instanceof Response) return auth;
	const { token, ctx } = auth;
	const body = await readTextBody(req);
	if (body instanceof Response) return body;
	const q = new URL(req.url).searchParams;
	const name = (q.get("name") ?? "sbom.json")
		.replace(/[^\w.-]/g, "_")
		.slice(0, 120);
	const code = q.get("product");
	// Datei durch die Upload-Pipeline (Typ, clamd, DLP) — wie jeder Upload,
	// auch ohne Ablage; geparst wird erst danach und im Parser-Prozess
	const screened = await screenUpload(ctx, {
		name: name.endsWith(".json") ? name : `${name}.json`,
		bytes: body.bytes,
		declaredMime: "application/json",
		classification: "internal",
		dlpAcknowledged: q.get("dlp_ack") === "1",
	});
	if (!screened.ok)
		return ingestJson(422, { error: screened.error, detail: screened.detail });
	const parsed = await parseIsolated(
		{ op: "sbom" },
		body.bytes,
		sbomResultSchema,
	);
	if (!parsed.ok)
		return ingestJson(503, { error: "upload_parser_unavailable" });
	if (!parsed.data.ok)
		return ingestJson(400, { error: `sbom_${parsed.data.error}` });
	const summary = checkSbom(parsed.data.sbom, new Date());

	const res = await mutateOrg(ctx, async (tx) => {
		const [p] = await tx
			.select()
			.from(products)
			.where(
				and(
					eq(products.organizationId, ctx.orgId),
					token.subjectType === "product" && token.subjectId
						? eq(products.id, token.subjectId)
						: eq(products.code, code ?? ""),
				),
			)
			.limit(1);
		if (!p) return { result: null, audit: [] };
		const { audit } = await storeSbom(tx, ctx, {
			product: p,
			summary,
			file: s3Configured()
				? {
						bytes: body.bytes,
						safeName: screened.safeName,
						mime: screened.mime,
						classification: screened.classification,
						dlp: screened.dlp,
						source: "api_ingest",
					}
				: null,
			via: "api_token",
		});
		await touchToken(tx, token.id, ctx.ip ?? null);
		return { result: { productId: p.id, code: p.code }, audit };
	});
	if (!res) return ingestJson(404, { error: "product_not_found" });
	return ingestJson(200, {
		product: res.code,
		ok: summary.ok,
		components: summary.components,
		fields: summary.fields,
		issues: summary.issues,
	});
});
