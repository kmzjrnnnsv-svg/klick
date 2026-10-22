import { NextResponse } from "next/server";
import { AuthError, requireWallet, toOrgCtx } from "@/lib/auth/guards";
import { readOrg } from "@/lib/db/with-org";
import { egressGuard } from "@/lib/dlp/egress";
import {
	auditExport,
	csvResponse,
	rateLimited,
	stamp,
} from "@/lib/export/respond";
import { formatAmount } from "@/lib/wallet/core/amount";
import { assetOf } from "@/lib/wallet/core/assets";
import { NETWORKS } from "@/lib/wallet/core/networks";
import { listTransfers } from "@/lib/wallet/queries";

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

// Wallet-Bewegungen als CSV (Buchhaltung, DAC8-Vorbereitung). Nur im
// entsperrten Wallet-Bereich und mit Export-Recht; auditiert, gedrosselt.
export async function GET() {
	let ctx: Awaited<ReturnType<typeof requireWallet>>;
	try {
		ctx = await requireWallet({ export: ["create"], wallet: ["read"] });
	} catch (e) {
		if (e instanceof AuthError)
			return new NextResponse(null, {
				status: e.code === "unauthenticated" ? 401 : 403,
			});
		throw e;
	}
	const blocked = rateLimited(ctx.orgId) ?? (await egressGuard(ctx, "export"));
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
	return csvResponse(`wallet-bewegungen-${stamp()}.csv`, HEADER, out, mark);
}
