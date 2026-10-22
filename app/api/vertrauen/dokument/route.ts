import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { documentVersions, evidence, orgSettings } from "@/db/schema";
import { publicTrustCenter } from "@/lib/db/trust";
import { mutateOrg } from "@/lib/db/with-org";
import { attachmentHeaders, decryptEvidenceObject } from "@/lib/evidence/read";
import { s3Configured } from "@/lib/evidence/store";
import { getOrgLimiter, SlidingWindowLimiter } from "@/lib/rate-limit";
import { clientIp, ingestRoute } from "@/lib/security/ingest";
import {
	cookieValue,
	resolveTrustAccess,
	trustCookieName,
	trustIpHash,
} from "@/lib/trust/access";
import { snapshotDocument } from "@/lib/trust/snapshot";

export const dynamic = "force-dynamic";

// Download aus dem Trust Center ohne Konto. Geladen werden kann nur, was im
// veröffentlichten Snapshot steht — öffentlich ohne Token, NDA-Unterlagen nur
// mit gültigem Zugangs-Cookie dieses Trust Centers. Jeder Abruf steht im
// Audit-Log der Org (IP nur als HMAC). Fremde oder unbekannte IDs → 404.

const perIp = new SlidingWindowLimiter(30, 60_000);

const status = (code: number) =>
	new NextResponse(null, {
		status: code,
		headers: { "cache-control": "no-store" },
	});

export const GET = ingestRoute("trust.document", async (req: Request) => {
	const ip = clientIp(req);
	if (!perIp.check(ip).allowed) return status(429);
	const params = new URL(req.url).searchParams;
	const slug = params.get("slug") ?? "";
	const versionId = params.get("v") ?? "";
	if (!/^[0-9a-f-]{36}$/i.test(versionId)) return status(404);
	const center = await publicTrustCenter(slug);
	if (!center) return status(404);
	const doc = snapshotDocument(center.snapshot, versionId);
	if (!doc) return status(404);
	const orgId = center.organizationId;
	if (!getOrgLimiter().check(orgId).allowed) return status(429);

	let requestId: string | null = null;
	if (doc.access === "nda") {
		const raw = cookieValue(req, trustCookieName(center.slug));
		if (!raw) return status(403);
		const r = await resolveTrustAccess(raw, center);
		if (!r.ok) return status(403);
		requestId = r.access.request.id;
	}
	if (doc.kind === "file" && !s3Configured()) return status(404);

	type Payload =
		| null
		| { kind: "markdown"; body: string }
		| {
				kind: "file";
				evidenceId: string;
				storageKey: string;
				fileName: string | null;
				mimeType: string | null;
				dek: { wrapped: string; keyVersion: number };
		  };
	const payload = await mutateOrg<Payload>(
		{ orgId, userId: null, ip: null, userAgent: req.headers.get("user-agent") },
		async (tx) => {
			const [v] = await tx
				.select({
					bodyMarkdown: documentVersions.bodyMarkdown,
					fileEvidenceId: documentVersions.fileEvidenceId,
				})
				.from(documentVersions)
				.where(
					and(
						eq(documentVersions.id, versionId),
						eq(documentVersions.organizationId, orgId),
						eq(documentVersions.documentId, doc.documentId),
					),
				)
				.limit(1);
			if (!v) return { result: null, audit: [] };
			const audit = {
				action: "trust.document_downloaded",
				target: `document:${doc.documentId}`,
				after: {
					via: "trust_center",
					versionId,
					version: doc.version,
					access: doc.access,
					requestId,
					ipHash: trustIpHash(ip),
				},
			};
			if (doc.kind === "markdown") {
				if (!v.bodyMarkdown) return { result: null, audit: [] };
				return { result: { kind: "markdown", body: v.bodyMarkdown }, audit };
			}
			if (!v.fileEvidenceId) return { result: null, audit: [] };
			const [e] = await tx
				.select({
					storageKey: evidence.storageKey,
					fileName: evidence.fileName,
					mimeType: evidence.mimeType,
				})
				.from(evidence)
				.where(
					and(
						eq(evidence.id, v.fileEvidenceId),
						eq(evidence.organizationId, orgId),
					),
				)
				.limit(1);
			const [s] = await tx
				.select({
					encryptedDek: orgSettings.encryptedDek,
					keyVersion: orgSettings.keyVersion,
				})
				.from(orgSettings)
				.where(eq(orgSettings.organizationId, orgId))
				.limit(1);
			if (!e?.storageKey || !s) return { result: null, audit: [] };
			return {
				result: {
					kind: "file",
					evidenceId: v.fileEvidenceId,
					storageKey: e.storageKey,
					fileName: e.fileName,
					mimeType: e.mimeType,
					dek: { wrapped: s.encryptedDek, keyVersion: s.keyVersion },
				},
				audit,
			};
		},
	);
	if (!payload) return status(404);

	const base = `${doc.docNumber}-v${doc.version}`;
	if (payload.kind === "markdown") {
		const bytes = new TextEncoder().encode(payload.body);
		return new NextResponse(bytes, {
			status: 200,
			headers: attachmentHeaders(
				`${base}.md`,
				"text/markdown; charset=utf-8",
				bytes.byteLength,
			),
		});
	}
	const plain = await decryptEvidenceObject({
		evidenceId: payload.evidenceId,
		storageKey: payload.storageKey,
		dek: payload.dek,
	});
	const ext = payload.fileName?.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? "";
	return new NextResponse(new Uint8Array(plain), {
		status: 200,
		headers: attachmentHeaders(
			`${base}${ext}`,
			payload.mimeType ?? "application/octet-stream",
			plain.byteLength,
		),
	});
});
