import { NextResponse } from "next/server";
import { toOrgCtx } from "@/lib/auth/guards";
import { readOrg } from "@/lib/db/with-org";
import {
	auditExport,
	csvResponse,
	exportGuard,
	stamp,
} from "@/lib/export/respond";
import { amountText, networkLabel } from "@/lib/wallet-link-ingest/display";
import { listCryptoMovements } from "@/lib/wallet-link-ingest/queries";

export const dynamic = "force-dynamic";

const HEADER = [
	"gesehen",
	"bestaetigt",
	"konto",
	"netz",
	"richtung",
	"asset",
	"betrag_basiseinheiten",
	"betrag",
	"status",
	"sanktionspruefung",
	"eingefroren",
	"adresse",
	"gegenseite",
	"txid",
	"output",
	"block",
] as const;

// Bewegungen aus both.money als CSV (höchstens 50 000 Zeilen, neueste zuerst)
export async function GET() {
	const ctx = await exportGuard();
	if (ctx instanceof NextResponse) return ctx;
	const { rows } = await readOrg(toOrgCtx(ctx), (tx) =>
		listCryptoMovements(tx, ctx.orgId, { limit: 50_000 }),
	);
	const out = rows.map((m) => [
		m.firstSeenAt.toISOString(),
		m.confirmedAt?.toISOString() ?? "",
		m.accountName,
		networkLabel(m.network),
		m.direction,
		m.asset,
		m.amount,
		amountText(m.network, m.asset, m.amount),
		m.status,
		m.screening,
		m.frozen ? "ja" : "nein",
		m.address,
		m.counterparty ?? "",
		m.txid,
		m.outputRef,
		m.blockHeight ?? "",
	]);
	const mark = await auditExport(ctx, "crypto_movements_csv", out.length);
	return csvResponse(`krypto-bewegungen-${stamp()}.csv`, HEADER, out, mark);
}
