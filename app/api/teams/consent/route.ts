import { NextResponse } from "next/server";
import { ipFromHeaders } from "@/lib/auth/session-rules";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { teamsConfig } from "@/lib/teams/config";
import { openConsentState } from "@/lib/teams/consent";
import { createGraphClient } from "@/lib/teams/graph";
import { teamsHttpsTransport } from "@/lib/teams/http";
import {
	type ConsentResult,
	completeConsent,
	consentCallbackValid,
	consentContext,
	tenantBound,
} from "@/lib/teams/service";

export const dynamic = "force-dynamic";

const PAGE: Record<ConsentResult, string> = {
	active: "ok",
	denied: "abgelehnt",
	invalid: "ungueltig",
	unbound: "fremd",
	taken: "vergeben",
};

// Rückruf nach dem Admin-Consent in Microsoft Entra (T5). Die Kunden-IT ist
// meist nicht in Klick angemeldet: das versiegelte state trägt die Org, der
// gespeicherte Einmalwert und der Tenant müssen passen. „admin_consent=True“
// steht nur in der Adresse; wirksam wird die Freigabe erst mit der Bindung
// (eine Inhaber:in hat im Tenant ein eigenes Konto, der Tenant gehört keiner
// anderen Org). Graph läuft ohne offene Transaktion. Ergebnis als Seite.
export async function GET(req: Request) {
	const url = new URL(req.url);
	const e = env();
	const done = (result: ConsentResult) =>
		NextResponse.redirect(
			new URL(`/teams-freigabe?ergebnis=${PAGE[result]}`, e.BETTER_AUTH_URL),
			303,
		);
	const state = url.searchParams.get("state") ?? "";
	const opened = openConsentState(state, e.BETTER_AUTH_SECRET, Date.now());
	if (!opened) return done("invalid");
	const error = url.searchParams.get("error");
	const granted =
		(url.searchParams.get("admin_consent") ?? "").toLowerCase() === "true";
	const tenantId = url.searchParams.get("tenant");
	const ctx = {
		orgId: opened.orgId,
		userId: null,
		ip: ipFromHeaders(req.headers),
	};
	const now = new Date();
	const pre = await readOrg(ctx, (tx) => consentContext(tx, opened.orgId));
	if (!consentCallbackValid(pre.row, { nonce: opened.nonce, tenantId, now }))
		return done("invalid");
	let bound = false;
	const config = granted && !error ? teamsConfig() : null;
	if (config && pre.row)
		bound = await tenantBound(
			createGraphClient(config, teamsHttpsTransport()),
			pre.row.tenantId,
			pre.ownerEmails,
		);
	const result = await mutateOrg(ctx, async (tx) => {
		const r = await completeConsent(tx, {
			orgId: opened.orgId,
			nonce: opened.nonce,
			tenantId,
			granted,
			bound,
			error,
			now,
		});
		return { result: r.result, audit: r.audit };
	});
	return done(result);
}
