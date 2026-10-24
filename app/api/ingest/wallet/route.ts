import {
	ingestJson,
	ingestRoute,
	readTextBody,
	tokenAuth,
} from "@/lib/security/ingest";
import { batch, MAX_BODY_BYTES } from "@/lib/wallet-link/contract";
import { linkForToken, receiveBatch } from "@/lib/wallet-link-ingest/service";

export const dynamic = "force-dynamic";

// both.money → Klick: Stapel von bis zu 200 Ereignissen (Exportvertrag v1,
// lib/wallet-link). Antwort je Ereignis: angenommen, doppelt, ignoriert oder
// abgelehnt. 403 bei fremder Bindung — both.money pausiert dann.
export const POST = ingestRoute("ingest.wallet", async (req: Request) => {
	const auth = await tokenAuth(req, { kind: "wallet", scope: "wallet:push" });
	if (auth instanceof Response) return auth;
	const { token, ctx } = auth;
	const body = await readTextBody(req, MAX_BODY_BYTES);
	if (body instanceof Response) return body;
	let json: unknown;
	try {
		json = JSON.parse(body.text);
	} catch {
		return ingestJson(400, { error: "invalid_json" });
	}
	const parsed = batch.safeParse(json);
	if (!parsed.success) return ingestJson(400, { error: "invalid_batch" });
	const link = await linkForToken(ctx, token);
	if (!link) return ingestJson(403, { error: "link_missing" });
	const r = await receiveBatch(
		{ ...ctx, userId: null },
		token,
		link,
		parsed.data,
	);
	if (!r.ok) return ingestJson(403, { error: r.error });
	return ingestJson(200, r.body);
});
