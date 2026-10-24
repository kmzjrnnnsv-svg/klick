import {
	AuthError,
	type OrgContext,
	requireUnlocked,
	toOrgCtx,
} from "@wallet/lib/auth/guards";
import { readOrg } from "@wallet/lib/db/with-org";
import {
	auditExport,
	csvResponse,
	rateLimited,
	stamp,
} from "@wallet/lib/export/respond";
import { listTransfers } from "@wallet/lib/wallet/queries";
import { NextResponse } from "next/server";
import { formatAmount } from "@/lib/wallet/core/amount";
import { assetOf } from "@/lib/wallet/core/assets";
import { NETWORKS } from "@/lib/wallet/core/networks";

export const dynamic = "force-dynamic";

const HEADER = [
	"zeit_utc",
	"konto",
	"netz",
	"richtung",
	"art",
	"asset",
	"betrag",
	"betrag_basiseinheiten",
	"status",
	"bestaetigungen",
	"block",
	"transaktion",
	"position",
	"eigene_adresse",
	"gegenpartei",
	"sanktionspruefung",
	"eingefroren",
] as const;

// Bewegungen als CSV (Buchhaltung, DAC8-Vorbereitung). Nur entsperrt und
// mit Export-Recht; im Protokoll, gedrosselt.
export async function GET() {
	let ctx: OrgContext;
	try {
		ctx = await requireUnlocked("export:download");
	} catch (e) {
		if (e instanceof AuthError)
			return new NextResponse(null, {
				status: e.code === "unauthenticated" ? 401 : 403,
			});
		throw e;
	}
	const blocked = rateLimited(ctx.orgId);
	if (blocked) return blocked;
	const { rows } = await readOrg(toOrgCtx(ctx), (tx) =>
		listTransfers(tx, ctx.orgId, { limit: 50_000, includeDropped: true }),
	);
	const out = rows.map((r) => {
		const decimals = assetOf(r.network, r.asset)?.decimals ?? 0;
		return [
			(r.blockTime ?? r.firstSeenAt).toISOString(),
			r.accountName,
			NETWORKS[r.network].label,
			r.direction === "in" ? "Eingang" : "Ausgang",
			r.outputRef === "out:fee" ? "Gebühr" : "Zahlung",
			r.asset,
			formatAmount(BigInt(r.amount), decimals),
			r.amount,
			r.status,
			r.confirmations,
			r.blockHeight ?? "",
			r.txid,
			r.outputRef,
			r.address,
			r.counterparty ?? "",
			r.screening,
			r.frozen ? "ja" : "nein",
		];
	});
	const mark = await auditExport(ctx, "wallet_transfers_csv", out.length);
	return csvResponse(`both-money-bewegungen-${stamp()}.csv`, HEADER, out, mark);
}
