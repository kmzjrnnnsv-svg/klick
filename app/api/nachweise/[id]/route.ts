import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { evidence, orgSettings } from "@/db/schema";
import { AuthError, requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { decryptBytes, unpackEnvelope, unwrapDek } from "@/lib/crypto/envelope";
import { mutateOrg } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { evidenceAad } from "@/lib/evidence/aad";

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

	const e = env();
	if (!(e.S3_ENDPOINT && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY)) {
		return new NextResponse(null, { status: 404 });
	}

	type Payload =
		| { kind: "none" }
		| { kind: "denied" }
		| {
				kind: "ok";
				row: typeof evidence.$inferSelect;
				dek: { wrapped: string; keyVersion: number };
		  };
	const payload = await mutateOrg<Payload>(toOrgCtx(ctx), async (tx) => {
		const [row] = await tx
			.select()
			.from(evidence)
			.where(and(eq(evidence.id, id), eq(evidence.organizationId, ctx.orgId)))
			.limit(1);
		if (!row?.storageKey) return { result: { kind: "none" }, audit: [] };
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

	const { getBytes } = await import("@/lib/storage/s3");
	const packed = await getBytes(payload.row.storageKey as string);
	const dek = await unwrapDek(payload.dek);
	const plain = await decryptBytes(
		unpackEnvelope(packed),
		dek,
		evidenceAad(id),
	);

	const fileName = (payload.row.fileName ?? "nachweis").replace(/["\r\n]/g, "");
	return new NextResponse(new Uint8Array(plain), {
		status: 200,
		headers: {
			"Content-Type": payload.row.mimeType ?? "application/octet-stream",
			"Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
			"Content-Length": String(plain.byteLength),
			"Cache-Control": "private, no-store",
			"X-Content-Type-Options": "nosniff",
			"Content-Security-Policy": "sandbox",
		},
	});
}
