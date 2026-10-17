import { and, eq } from "drizzle-orm";
import { products } from "@/db/schema";
import { FINDING_SEVERITIES, type FindingSeverity } from "@/db/schema/enums";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { screenUpload } from "@/lib/evidence/store";
import { gateFails } from "@/lib/security/finding-rules";
import { importScan } from "@/lib/security/import-service";
import {
	ingestAuth,
	ingestJson,
	ingestRoute,
	readTextBody,
	touchToken,
} from "@/lib/security/ingest";
import { parseScanFile } from "@/lib/security/parsers";

export const dynamic = "force-dynamic";

// Scan-Ergebnisse aus der CI (ADR-017): Bearer-Token mit Scope scan:write.
//   POST /api/ingest/scan?name=trivy.json&product=PRD-001&full=1&fail_on=high
// Body = Scan-Datei (SARIF, Trivy-, ZAP-, OSV-JSON, Nuclei-JSONL, gitleaks).
// fail_on: Antwort 422, wenn offene Befunde ab dieser Schwere bestehen —
// `curl --fail-with-body` lässt den CI-Schritt damit scheitern.
export const POST = ingestRoute("ingest.scan", async (req: Request) => {
	const auth = await ingestAuth(req, "scan:write");
	if (auth instanceof Response) return auth;
	const { token, ctx } = auth;
	const body = await readTextBody(req);
	if (body instanceof Response) return body;
	const q = new URL(req.url).searchParams;
	const failOnRaw = q.get("fail_on");
	const failOn = (FINDING_SEVERITIES as readonly string[]).includes(
		failOnRaw ?? "",
	)
		? (failOnRaw as FindingSeverity)
		: null;
	if (failOnRaw && !failOn)
		return ingestJson(400, { error: "invalid_fail_on" });
	const name = (q.get("name") ?? "scan.json").slice(0, 120);
	// Pipeline wie jeder Upload (Typ, clamd); Secrets im Bericht sind
	// erwartet und werden beim Import redigiert, DLP-Warnungen gelten als
	// bestätigt (maschineller Eingang, Klassifizierung wird angehoben).
	const screened = await screenUpload(ctx, {
		name,
		bytes: body.bytes,
		classification: "confidential",
		dlpAcknowledged: true,
		secretsExpected: true,
	});
	if (!screened.ok)
		return ingestJson(422, { error: screened.error, detail: screened.detail });
	const parsed = parseScanFile(body.text, name);
	if (!parsed.ok) return ingestJson(400, { error: parsed.error });

	// Produkt: Token-Bindung gewinnt, sonst ?product=<Code>
	let productId: string | null =
		token.subjectType === "product" ? token.subjectId : null;
	const code = q.get("product");
	if (!productId && code) {
		const [p] = await readOrg(ctx, (tx) =>
			tx
				.select({ id: products.id })
				.from(products)
				.where(
					and(eq(products.organizationId, ctx.orgId), eq(products.code, code)),
				)
				.limit(1),
		);
		if (!p) return ingestJson(404, { error: "product_not_found" });
		productId = p.id;
	}

	const r = await mutateOrg(ctx, async (tx) => {
		const res = await importScan(tx, ctx, {
			parsed: parsed.scan,
			source: "api",
			fullScan: q.get("full") === "1",
			productId,
			raw: { text: body.text, fileName: name },
			tokenId: token.id,
		});
		await touchToken(tx, token.id, ctx.ip ?? null);
		return { result: res, audit: res.audits };
	});
	const failed = gateFails(r.openSeverities, failOn);
	return ingestJson(failed ? 422 : 200, {
		scanId: r.scanId,
		tool: parsed.scan.tool,
		findings: parsed.scan.findings.length,
		counts: r.counts,
		gate: failOn ? (failed ? "fail" : "pass") : null,
	});
});
