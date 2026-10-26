import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { evidence, orgSettings } from "@/db/schema";
import { AuthError, requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { isExternal } from "@/lib/auth/memberships";
import { mutateOrg } from "@/lib/db/with-org";
import { egressGuard } from "@/lib/dlp/egress";
import { isDbStorageKey } from "@/lib/evidence/aad";
import {
	attachmentHeaders,
	dbEnvelope,
	decryptEvidenceObject,
} from "@/lib/evidence/read";
import { s3Configured } from "@/lib/evidence/store";
import { rateLimited } from "@/lib/export/respond";

export const dynamic = "force-dynamic";

// Auth-gated Download: Guard → RLS-Lookup → Entschlüsselung mit Org-DEK →
// Attachment. Vertrauliche Nachweise verlangen Step-up. Jeder Download steht
// im Audit-Log (auch der von Prüfer:innen). Fremde ID → 404, kein Orakel.
export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	let ctx: Awaited<ReturnType<typeof requireOrg>>;
	try {
		ctx = await requireOrg({ evidence: ["read"] });
	} catch (e) {
		if (e instanceof AuthError) return new NextResponse(null, { status: 401 });
		throw e;
	}
	if (!/^[0-9a-f-]{36}$/i.test(id))
		return new NextResponse(null, { status: 404 });
	const limited =
		rateLimited(ctx.orgId) ?? (await egressGuard(ctx, "evidence_download"));
	if (limited) return limited;

	type Payload =
		| { kind: "none" }
		| { kind: "denied" }
		| {
				kind: "ok";
				row: typeof evidence.$inferSelect;
				dek: { wrapped: string; keyVersion: number };
				packed?: Uint8Array;
		  };
	const payload = await mutateOrg<Payload>(toOrgCtx(ctx), async (tx) => {
		const [row] = await tx
			.select()
			// evidence:any-version — Download per ID, jede Fassung
			.from(evidence)
			.where(and(eq(evidence.id, id), eq(evidence.organizationId, ctx.orgId)))
			.limit(1);
		if (!row?.storageKey) return { result: { kind: "none" }, audit: [] };
		// S3-Objekt, aber kein Objektspeicher eingerichtet
		if (!isDbStorageKey(row.storageKey) && !s3Configured())
			return { result: { kind: "none" }, audit: [] };
		// Streng geheim (z. B. von DLP angehoben): Prüfer:innen nur mit Grant.
		if (
			row.classification === "secret" &&
			isExternal(ctx.orgRole) &&
			!ctx.grants.includes("secret_evidence")
		) {
			return {
				result: { kind: "denied" },
				audit: {
					action: "evidence.download",
					target: `evidence:${id}`,
					outcome: "denied",
					after: { reason: "grant_required" },
				},
			};
		}
		const sensitive =
			row.classification === "confidential" || row.classification === "secret";
		if (sensitive && !ctx.stepUpFresh) {
			return {
				result: { kind: "denied" },
				audit: {
					action: "evidence.download",
					target: `evidence:${id}`,
					outcome: "denied",
					after: { reason: "step_up_required" },
				},
			};
		}
		const [s] = await tx
			.select({
				encryptedDek: orgSettings.encryptedDek,
				keyVersion: orgSettings.keyVersion,
			})
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, ctx.orgId))
			.limit(1);
		if (!s) return { result: { kind: "none" }, audit: [] };
		return {
			result: {
				kind: "ok",
				row,
				dek: { wrapped: s.encryptedDek, keyVersion: s.keyVersion },
				packed: await dbEnvelope(tx, ctx.orgId, id, row.storageKey),
			},
			audit: {
				action: "evidence.download",
				target: `evidence:${id}`,
				after: { fileName: row.fileName, classification: row.classification },
			},
		};
	});

	if (payload.kind === "none") return new NextResponse(null, { status: 404 });
	if (payload.kind === "denied") return new NextResponse(null, { status: 403 });

	const plain = await decryptEvidenceObject({
		evidenceId: id,
		storageKey: payload.row.storageKey as string,
		dek: payload.dek,
		packed: payload.packed,
	});
	return new NextResponse(new Uint8Array(plain), {
		status: 200,
		headers: attachmentHeaders(
			payload.row.fileName ?? "nachweis",
			payload.row.mimeType ?? "application/octet-stream",
			plain.byteLength,
		),
	});
}
