import { NextResponse } from "next/server";
import { toOrgCtx } from "@/lib/auth/guards";
import { readOrg } from "@/lib/db/with-org";
import {
	auditExport,
	csvResponse,
	exportStepUpGuard,
	stamp,
} from "@/lib/export/respond";
import { accountFilterOf, accountFlags } from "@/lib/identity/accounts";
import {
	exportIdentityAccounts,
	identityPolicyFor,
} from "@/lib/identity/queries";

export const dynamic = "force-dynamic";

const HEADER = [
	"name",
	"adresse",
	"art",
	"aktiv",
	"admin",
	"rollen",
	"mfa",
	"letzte_anmeldung",
	"angelegt",
	"austritt",
	"ausgeschieden",
	"inaktiv",
	"person_in_klick",
	"ausnahme_bis",
	"verschwunden_seit",
] as const;

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const yesNo = (v: boolean | null) => (v === null ? "" : v ? "ja" : "nein");

// Konten aus Entra ID als CSV (Teil D): derselbe Filter wie /team/konten,
// Step-up und Export-Recht, Export-ID, höchstens 50 000 Zeilen
export async function GET(req: Request) {
	const ctx = await exportStepUpGuard(req, {
		identity: ["read"],
		export: ["create"],
	});
	if (ctx instanceof NextResponse) return ctx;
	const url = new URL(req.url);
	const filter = accountFilterOf(Object.fromEntries(url.searchParams));
	const now = new Date();
	const { rows, policy } = await readOrg(toOrgCtx(ctx), async (tx) => {
		const policy = await identityPolicyFor(tx, ctx.orgId);
		return {
			policy,
			rows: await exportIdentityAccounts(tx, ctx.orgId, {
				filter,
				now,
				policy,
			}),
		};
	});
	const out = rows.map((r) => {
		const f = accountFlags(r, now, policy);
		return [
			r.displayName,
			r.email ?? "",
			r.kind === "guest" ? "gast" : "mitglied",
			yesNo(r.enabled),
			yesNo(r.isAdmin || r.isTopAdmin),
			r.adminRoles.join("; "),
			yesNo(r.mfaRegistered),
			day(r.lastSignInAt),
			day(r.createdAtSource),
			day(r.leaveAt),
			yesNo(f.left),
			yesNo(f.inactive),
			r.matchedName ?? "",
			r.exceptionUntil ?? "",
			day(r.missingSince),
		];
	});
	const mark = await auditExport(ctx, "identity_accounts_csv", out.length, {
		filter: { chips: filter.chips, state: filter.state, check: filter.check },
	});
	return csvResponse(`konten-${stamp()}.csv`, HEADER, out, mark);
}
