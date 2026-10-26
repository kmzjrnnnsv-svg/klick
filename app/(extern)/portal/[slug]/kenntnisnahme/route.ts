import {
	json,
	portalAndReader,
	portalRoute,
	sameOriginJson,
} from "@/lib/policy-portal/http";
import { acknowledgeAsReader } from "@/lib/policy-portal/service";

export const dynamic = "force-dynamic";

// Kenntnisnahme der gültigen Fassung durch eine Portal-Leser:in.
export const POST = portalRoute(
	"policy_portal.acknowledge",
	async (req, { slug }) => {
		if (!sameOriginJson(req)) return json(403, { error: "forbidden" });
		const found = await portalAndReader(req, slug);
		if (!found) return json(404, { error: "not_found" });
		if (!found.reader) return json(401, { error: "unauthenticated" });
		const body = (await req.json().catch(() => null)) as {
			versionId?: unknown;
		} | null;
		const versionId = typeof body?.versionId === "string" ? body.versionId : "";
		if (!/^[0-9a-f-]{36}$/i.test(versionId))
			return json(400, { error: "invalid" });
		const ok = await acknowledgeAsReader({
			portal: found.portal,
			reader: found.reader,
			versionId,
			userAgent: req.headers.get("user-agent"),
		});
		return ok ? json(200, { ok: true }) : json(404, { error: "not_found" });
	},
);
