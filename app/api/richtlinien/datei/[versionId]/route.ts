import { NextResponse } from "next/server";
import { AuthError, requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { mutateOrg } from "@/lib/db/with-org";
import { egressGuard } from "@/lib/dlp/egress";
import {
	type EvidenceFilePayload,
	evidenceFileFor,
	evidenceFileResponse,
} from "@/lib/evidence/serve";
import { rateLimited } from "@/lib/export/respond";
import { policiesFor } from "@/lib/policies/queries";

export const dynamic = "force-dynamic";

// Datei einer Richtlinie für Mitarbeitende: nur die gültige Fassung eines
// Dokuments, das der Verteiler der Person erreicht (policiesFor). Audit
// `policy.file_download`.
export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ versionId: string }> },
) {
	const { versionId } = await params;
	let ctx: Awaited<ReturnType<typeof requireOrg>>;
	try {
		ctx = await requireOrg({ policy: ["read"] });
	} catch (e) {
		if (e instanceof AuthError) return new NextResponse(null, { status: 401 });
		throw e;
	}
	if (!/^[0-9a-f-]{36}$/i.test(versionId))
		return new NextResponse(null, { status: 404 });
	const limited =
		rateLimited(ctx.orgId) ?? (await egressGuard(ctx, "evidence_download"));
	if (limited) return limited;
	const payload = await mutateOrg<{
		file: EvidenceFilePayload;
		name: string;
	} | null>(toOrgCtx(ctx), async (tx) => {
		const policy = (
			await policiesFor(tx, ctx.orgId, {
				userId: ctx.userId,
				role: ctx.orgRole,
			})
		).find((p) => p.versionId === versionId);
		if (!policy?.fileEvidenceId) return { result: null, audit: [] };
		const file = await evidenceFileFor(tx, ctx.orgId, policy.fileEvidenceId);
		if (!file) return { result: null, audit: [] };
		return {
			result: { file, name: `${policy.docNumber}-v${policy.version}` },
			audit: {
				action: "policy.file_download",
				target: `document:${policy.documentId}`,
				after: { versionId, version: policy.version },
			},
		};
	});
	if (!payload) return new NextResponse(null, { status: 404 });
	return evidenceFileResponse(payload.file, payload.name);
}
