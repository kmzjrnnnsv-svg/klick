import { and, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { documents, documentVersions } from "@/db/schema";
import { toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import { SIGN_ORIGIN, SIGN_RP_ID } from "@/lib/auth/passkey-sign";
import { allows } from "@/lib/auth/permissions";
import { hidesSecret, restrictedView } from "@/lib/auth/visibility";
import { readOrg } from "@/lib/db/with-org";
import {
	ATTACH_MAX_BYTES,
	type ControlledSource,
	controlledFileName,
	controlledSignaturesJson,
	loadControlledSource,
	renderControlledPdf,
} from "@/lib/documents/controlled-export";
import { currentPublished } from "@/lib/documents/versions";
import {
	auditExport,
	exportStepUpGuard,
	stamp,
	zipResponse,
} from "@/lib/export/respond";
import { buildZip, withManifest, type ZipEntry } from "@/lib/export/zip";

export const dynamic = "force-dynamic";

// Originaldateien im Paket höchstens bis zu dieser Summe (danach nur PDF)
const PACKAGE_FILES_MAX = 8 * ATTACH_MAX_BYTES;

const README = `Gültige Dokumente – gelenkte Fassungen

Je Dokument ein PDF „Gelenkte Fassung“ (Deckblatt, Freigabe und
Unterschriften, Änderungshistorie, Verteiler, Inhalt) und dazu
<Nummer>-v<Fassung>-signaturen.json. Dieselbe JSON-Datei steckt auch als
Anhang im PDF, bei hochgeladenen Dokumenten zusätzlich die Originaldatei.

Prüfen ohne Klick: die Schritte unter „verification.steps“ in jeder
signaturen.json. Jede Unterschrift ist eine WebAuthn-Assertion
(FIDO2/Passkey mit Nutzerverifikation) über die Prüfsumme der Fassung –
keine in Acrobat angezeigte PDF-Signatur.

SHA256SUMS und MANIFEST.json listen jede Datei dieses Pakets mit Prüfsumme.
`;

// „Alle gültigen Dokumente“: je Dokument mit gültiger Fassung das PDF
// „Gelenkte Fassung“ + signaturen.json, Manifest mit SHA-256. Step-up und
// Audit wie alle Pakete; streng geheime Dokumente nur mit Grant, Prüfer-Sicht
// wie auf der Seite (nur gültige Fassungen — die gibt es hier ohnehin nur).
export async function GET(req: Request) {
	const ctx = await exportStepUpGuard(req);
	if (ctx instanceof NextResponse) return ctx;
	if (!allows(ctx, { document: ["read"] }))
		return new NextResponse(null, { status: 403 });
	const org = await getOrgSummary(ctx.orgId);
	if (!org) return new NextResponse(null, { status: 404 });
	const env = { origin: SIGN_ORIGIN, rpId: SIGN_RP_ID };
	const sources = await readOrg(toOrgCtx(ctx), async (tx) => {
		const docs = await tx
			.select({
				id: documents.id,
				docNumber: documents.docNumber,
				classification: documents.classification,
			})
			.from(documents)
			.where(eq(documents.organizationId, ctx.orgId))
			.orderBy(documents.docNumber);
		const versions = await tx
			.select({
				id: documentVersions.id,
				documentId: documentVersions.documentId,
				version: documentVersions.version,
				approvedAt: documentVersions.approvedAt,
				publishedAt: documentVersions.publishedAt,
				retiredAt: documentVersions.retiredAt,
			})
			.from(documentVersions)
			.where(
				and(
					eq(documentVersions.organizationId, ctx.orgId),
					isNotNull(documentVersions.publishedAt),
				),
			);
		const out: ControlledSource[] = [];
		for (const d of docs) {
			if (hidesSecret(ctx, d)) continue;
			const current = currentPublished(
				versions.filter((v) => v.documentId === d.id),
			);
			if (!current) continue;
			const src = await loadControlledSource(tx, ctx.orgId, d.id, {
				version: current.version,
				view: restrictedView(ctx) ? "current" : "full",
				env,
				orgName: org.name,
			});
			if (src) out.push(src);
		}
		return out;
	});
	const mark = await auditExport(ctx, "documents_zip", sources.length, {
		documents: sources.map((s) => `${s.docNumber}@${s.version}`),
	});
	const entries: ZipEntry[] = [{ name: "LIESMICH.txt", data: README }];
	let filesBytes = 0;
	for (const src of sources) {
		const size = src.file?.sizeBytes ?? 0;
		const attachFile = filesBytes + size <= PACKAGE_FILES_MAX;
		if (attachFile) filesBytes += size;
		const pdf = await renderControlledPdf(src, mark, env, { attachFile });
		const base = controlledFileName(src).replace(/-gelenkt\.pdf$/, "");
		entries.push(
			{ name: `${base}-gelenkt.pdf`, data: pdf },
			{
				name: `${base}-signaturen.json`,
				data: controlledSignaturesJson(src, env),
			},
		);
	}
	const generatedAt = mark.at;
	const { entries: all } = withManifest(entries, {
		title: "Gültige Dokumente (gelenkte Fassungen)",
		generatedAt,
		organization: { id: ctx.orgId, name: org.name },
		extra: { exportId: mark.exportId, exportedBy: mark.by },
	});
	return zipResponse(`dokumente-${stamp()}.zip`, buildZip(all));
}
