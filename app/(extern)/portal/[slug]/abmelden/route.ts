import {
	json,
	portalAndReader,
	portalRoute,
	sameOriginJson,
} from "@/lib/policy-portal/http";
import { portalCookieName, portalPath } from "@/lib/policy-portal/rules";
import { signOutReader } from "@/lib/policy-portal/service";

export const dynamic = "force-dynamic";

// Abmelden: Token widerrufen, Cookie löschen.
export const POST = portalRoute(
	"policy_portal.sign_out",
	async (req, { slug }) => {
		if (!sameOriginJson(req)) return json(403, { error: "forbidden" });
		const found = await portalAndReader(req, slug);
		if (found?.reader) await signOutReader(found.portal, found.reader);
		const out = json(200, { ok: true });
		out.cookies.set(portalCookieName(slug), "", {
			path: portalPath(slug),
			maxAge: 0,
		});
		return out;
	},
);
