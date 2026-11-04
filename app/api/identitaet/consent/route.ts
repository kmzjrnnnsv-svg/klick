import { NextResponse } from "next/server";
import { ipFromHeaders } from "@/lib/auth/session-rules";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { entraBound } from "@/lib/identity/providers/entra-bind";
import {
	completeEntraConsent,
	consentContext,
	entraCallbackValid,
	type IdentityConsentResult,
} from "@/lib/identity/service";
import { identityMsGet } from "@/lib/identity/sync";
import { openState } from "@/lib/microsoft/consent";

export const dynamic = "force-dynamic";

const PAGE: Record<IdentityConsentResult, string> = {
	active: "ok",
	denied: "abgelehnt",
	invalid: "ungueltig",
	unbound: "fremd",
	taken: "vergeben",
};

// Rückruf nach der Freigabe von „Klick Identität“ in Microsoft Entra (Teil D).
// Wie bei Teams: das versiegelte state trägt die Org (Zweck
// „identity-consent“), Einmalwert und Tenant müssen passen; wirksam erst mit
// der Bindung (Inhaber:in mit Adresse einer bestätigten Domain des Tenants
// hat dort ein eigenes Konto). Graph läuft ohne offene Transaktion.
export async function GET(req: Request) {
	const url = new URL(req.url);
	const e = env();
	const done = (result: IdentityConsentResult) =>
		NextResponse.redirect(
			new URL(
				`/identitaet-freigabe?ergebnis=${PAGE[result]}`,
				e.BETTER_AUTH_URL,
			),
			303,
		);
	const opened = openState(
		"identity-consent",
		url.searchParams.get("state") ?? "",
		e.BETTER_AUTH_SECRET,
		Date.now(),
	);
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
	if (!entraCallbackValid(pre.row, { nonce: opened.nonce, tenantId, now }))
		return done("invalid");
	let bound = false;
	const get = granted && !error && tenantId ? identityMsGet() : null;
	if (get && tenantId) bound = await entraBound(get, tenantId, pre.ownerEmails);
	const result = await mutateOrg(ctx, async (tx) => {
		const r = await completeEntraConsent(tx, {
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
