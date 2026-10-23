import { NextResponse } from "next/server";
import { AuthError, requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { SIGN_ORIGIN, SIGN_RP_ID } from "@/lib/auth/passkey-sign";
import { readOrg } from "@/lib/db/with-org";
import { contentDisposition } from "@/lib/http/disposition";
import { evidenceWithSignatures } from "@/lib/signatures/queries";
import { signaturesJson } from "@/lib/signatures/report";

export const dynamic = "force-dynamic";

// signaturen.json eines Nachweises: alles, um die Unterschriften ohne Klick
// zu prüfen (kanonischer Text, Assertion, öffentlicher Schlüssel, Pfad zur
// Merkle-Wurzel, Prüfschritte). Fremde ID → 404.
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
	const data = await readOrg(toOrgCtx(ctx), (tx) =>
		evidenceWithSignatures(tx, ctx.orgId, id),
	);
	if (!data) return new NextResponse(null, { status: 404 });
	const body = JSON.stringify(
		signaturesJson({
			evidence: data.evidence,
			rows: data.rows,
			env: { origin: SIGN_ORIGIN, rpId: SIGN_RP_ID },
		}),
		null,
		2,
	);
	return new NextResponse(body, {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Content-Disposition": contentDisposition(`signaturen-${id}.json`),
			"Cache-Control": "private, no-store",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
