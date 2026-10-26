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
import { sharedEvidence } from "@/lib/policies/queries";

export const dynamic = "force-dynamic";

// Für Mitarbeitende freigegebener Nachweis: nur aktuelle Fassung,
// öffentlich/intern, Schalter „Für Mitarbeitende sichtbar“ (sharedEvidence).
// Audit `evidence.download` mit `via: policies`.
export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	let ctx: Awaited<ReturnType<typeof requireOrg>>;
	try {
		ctx = await requireOrg({ evidence_shared: ["read"] });
	} catch (e) {
		if (e instanceof AuthError) return new NextResponse(null, { status: 401 });
		throw e;
	}
	if (!/^[0-9a-f-]{36}$/i.test(id))
		return new NextResponse(null, { status: 404 });
	const limited =
		rateLimited(ctx.orgId) ?? (await egressGuard(ctx, "evidence_download"));
	if (limited) return limited;
	const payload = await mutateOrg<EvidenceFilePayload | null>(
		toOrgCtx(ctx),
		async (tx) => {
			const shared = (await sharedEvidence(tx, ctx.orgId)).find(
				(e) => e.id === id,
			);
			if (!shared) return { result: null, audit: [] };
			const file = await evidenceFileFor(tx, ctx.orgId, id);
			if (!file) return { result: null, audit: [] };
			return {
				result: file,
				audit: {
					action: "evidence.download",
					target: `evidence:${id}`,
					after: { via: "policies", fileName: file.fileName },
				},
			};
		},
	);
	if (!payload) return new NextResponse(null, { status: 404 });
	return evidenceFileResponse(payload);
}
