import { NextResponse } from "next/server";
import { evidenceFileResponse } from "@/lib/evidence/serve";
import { rateLimited } from "@/lib/export/respond";
import { portalAndReader, portalRoute } from "@/lib/policy-portal/http";
import { readerFile } from "@/lib/policy-portal/service";

export const dynamic = "force-dynamic";

// Für Mitarbeitende freigegebener Nachweis (aktuelle Fassung).
export const GET = portalRoute<{ slug: string; id: string }>(
	"policy_portal.evidence",
	async (req, { slug, id }) => {
		if (!/^[0-9a-f-]{36}$/i.test(id))
			return new NextResponse(null, { status: 404 });
		const found = await portalAndReader(req, slug);
		if (!found?.reader) return new NextResponse(null, { status: 401 });
		const limited = rateLimited(found.portal.organizationId);
		if (limited) return limited;
		const out = await readerFile({
			portal: found.portal,
			reader: found.reader,
			target: { evidenceId: id },
			userAgent: req.headers.get("user-agent"),
		});
		if (!out) return new NextResponse(null, { status: 404 });
		return evidenceFileResponse(out.file, out.name);
	},
);
