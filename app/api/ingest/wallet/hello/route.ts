import { getOrgSummary } from "@/lib/auth/org";
import {
	ingestJson,
	ingestRoute,
	readTextBody,
	tokenAuth,
} from "@/lib/security/ingest";
import { helloRequest } from "@/lib/wallet-link/contract";
import { linkForToken, receiveHello } from "@/lib/wallet-link-ingest/service";

export const dynamic = "force-dynamic";

// both.money → Klick: Verbindung prüfen (Plan both.money, K3). Bearer-Token
// klk_wallet_… mit Scope wallet:push; das erste hello bindet die
// both.money-Org, danach nur noch diese.
export const POST = ingestRoute("ingest.wallet.hello", async (req: Request) => {
	const auth = await tokenAuth(req, { kind: "wallet", scope: "wallet:push" });
	if (auth instanceof Response) return auth;
	const { token, ctx } = auth;
	const body = await readTextBody(req, 64_000);
	if (body instanceof Response) return body;
	let json: unknown;
	try {
		json = JSON.parse(body.text);
	} catch {
		return ingestJson(400, { error: "invalid_json" });
	}
	const parsed = helloRequest.safeParse(json);
	if (!parsed.success) return ingestJson(400, { error: "invalid_hello" });
	const link = await linkForToken(ctx, token);
	if (!link) return ingestJson(403, { error: "link_missing" });
	const org = await getOrgSummary(ctx.orgId);
	const r = await receiveHello(
		{ ...ctx, userId: null },
		token,
		link,
		parsed.data,
		org?.name ?? "",
	);
	if (!r.ok) return ingestJson(403, { error: r.error });
	return ingestJson(200, r.body);
});
