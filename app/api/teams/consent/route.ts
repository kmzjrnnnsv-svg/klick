import { NextResponse } from "next/server";
import { ipFromHeaders } from "@/lib/auth/session-rules";
import { mutateOrg } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { openConsentState } from "@/lib/teams/consent";
import { completeConsent } from "@/lib/teams/service";

export const dynamic = "force-dynamic";

// Rückruf nach dem Admin-Consent in Microsoft Entra (T5). Die Kunden-IT ist
// meist nicht in Klick angemeldet: das versiegelte state trägt die Org, der
// gespeicherte Einmalwert und der Tenant müssen passen. Ergebnis als Seite.
export async function GET(req: Request) {
	const url = new URL(req.url);
	const e = env();
	const done = (result: string) =>
		NextResponse.redirect(
			new URL(`/teams-freigabe?ergebnis=${result}`, e.BETTER_AUTH_URL),
			303,
		);
	const state = url.searchParams.get("state") ?? "";
	const opened = openConsentState(state, e.BETTER_AUTH_SECRET, Date.now());
	if (!opened) return done("ungueltig");
	const error = url.searchParams.get("error");
	const granted =
		(url.searchParams.get("admin_consent") ?? "").toLowerCase() === "true";
	const result = await mutateOrg(
		{ orgId: opened.orgId, userId: null, ip: ipFromHeaders(req.headers) },
		async (tx) => {
			const r = await completeConsent(tx, {
				orgId: opened.orgId,
				nonce: opened.nonce,
				tenantId: url.searchParams.get("tenant"),
				granted,
				error,
				now: new Date(),
			});
			return { result: r.result, audit: r.audit };
		},
	);
	return done(
		result === "active"
			? "ok"
			: result === "denied"
				? "abgelehnt"
				: "ungueltig",
	);
}
