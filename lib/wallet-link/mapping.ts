import type { AccountBalances } from "@/lib/wallet/model";
import type { EventData } from "./events";

// Datensätze von both.money → Ereignisdaten des Vertrags (pure). Strukturelle
// Eingaben, damit dieses Modul keine Datenbank kennt; Zeiten als Date oder
// null, Ausgabe ISO-8601. Was hier nicht steht (Kontoschlüssel, Roh-Tx,
// Absichtstext, Personen), verlässt both.money nicht.

const isoOf = (d: Date) => d.toISOString();
const isoOrNull = (d: Date | null | undefined) => (d ? d.toISOString() : null);

type AccountRow = EventData<"account.upserted">["account"] extends infer A
	? Omit<A, "createdAt" | "firstAddress"> & { createdAt: Date }
	: never;

export function accountData(
	a: AccountRow,
	firstAddress: string | null,
	rev: number,
): EventData<"account.upserted"> {
	return {
		account: {
			id: a.id,
			name: a.name,
			network: a.network,
			kind: a.kind,
			purpose: a.purpose,
			keyFingerprint: a.keyFingerprint,
			firstAddress,
			status: a.status,
			createdAt: isoOf(a.createdAt),
		},
		rev,
	};
}

type T = EventData<"transfer.upserted">["transfer"];
export type TransferRow = Omit<
	T,
	"network" | "blockTime" | "firstSeenAt" | "confirmedAt"
> & {
	blockTime: Date | null;
	firstSeenAt: Date;
	confirmedAt: Date | null;
};

export function transferData(
	t: TransferRow,
	network: T["network"],
	rev: number,
): EventData<"transfer.upserted"> {
	return {
		transfer: {
			id: t.id,
			accountId: t.accountId,
			network,
			direction: t.direction,
			asset: t.asset,
			amount: t.amount,
			txid: t.txid,
			outputRef: t.outputRef,
			address: t.address,
			counterparty: t.counterparty,
			blockHeight: t.blockHeight,
			blockHash: t.blockHash,
			blockTime: isoOrNull(t.blockTime),
			confirmations: t.confirmations,
			status: t.status,
			screening: t.screening,
			frozen: t.frozen,
			payoutId: t.payoutId,
			firstSeenAt: isoOf(t.firstSeenAt),
			confirmedAt: isoOrNull(t.confirmedAt),
		},
		rev,
	};
}

type P = EventData<"payout.upserted">["payout"];
export type PayoutRow = Omit<
	P,
	| "network"
	| "txids"
	| "createdAt"
	| "approvedAt"
	| "signedAt"
	| "broadcastAt"
	| "confirmedAt"
> & {
	txids: string[] | null;
	createdAt: Date;
	approvedAt: Date | null;
	signedAt: Date | null;
	broadcastAt: Date | null;
	confirmedAt: Date | null;
};

export function payoutData(
	p: PayoutRow,
	network: P["network"],
	rev: number,
): EventData<"payout.upserted"> {
	return {
		payout: {
			id: p.id,
			accountId: p.accountId,
			network,
			asset: p.asset,
			amount: p.amount,
			destination: p.destination,
			destinationLabel: p.destinationLabel,
			speed: p.speed,
			status: p.status,
			intentId: p.intentId,
			feeCap: p.feeCap,
			fee: p.fee,
			txid: p.txid,
			txids: p.txids ?? [],
			createdAt: isoOf(p.createdAt),
			approvedAt: isoOrNull(p.approvedAt),
			signedAt: isoOrNull(p.signedAt),
			broadcastAt: isoOrNull(p.broadcastAt),
			confirmedAt: isoOrNull(p.confirmedAt),
		},
		rev,
	};
}

type D = EventData<"destination.upserted">["destination"];
export type DestinationRow = Omit<
	D,
	"approvedAt" | "activeFrom" | "vetoedAt" | "createdAt"
> & {
	approvedAt: Date | null;
	activeFrom: Date | null;
	vetoedAt: Date | null;
	createdAt: Date;
};

export function destinationData(
	d: DestinationRow,
	rev: number,
): EventData<"destination.upserted"> {
	return {
		destination: {
			id: d.id,
			network: d.network,
			address: d.address,
			label: d.label,
			status: d.status,
			screening: d.screening,
			approvedAt: isoOrNull(d.approvedAt),
			activeFrom: isoOrNull(d.activeFrom),
			vetoedAt: isoOrNull(d.vetoedAt),
			vetoReason: d.vetoReason,
			createdAt: isoOf(d.createdAt),
		},
		rev,
	};
}

type DayAccount = EventData<"day.closed">["accounts"][number];

// Tagesabschluss je Konto: Knotenstand + eingefrorene Eingänge je Asset
export function dayAccount(
	a: {
		id: string;
		network: DayAccount["network"];
		balances: AccountBalances | null;
		balanceHeight: number | null;
		balanceHash: string | null;
		balanceAt: Date | null;
	},
	frozen: Partial<Record<keyof AccountBalances, bigint>>,
): DayAccount {
	const balances: DayAccount["balances"] = {};
	for (const [asset, b] of Object.entries(a.balances ?? {}))
		if (b)
			balances[asset as keyof AccountBalances] = {
				confirmed: b.confirmed,
				pending: b.pending,
			};
	const frozenOut: DayAccount["frozen"] = {};
	for (const [asset, v] of Object.entries(frozen))
		if (v && v > 0n) frozenOut[asset as keyof AccountBalances] = v.toString();
	return {
		accountId: a.id,
		network: a.network,
		balances,
		height: a.balanceHeight,
		hash: a.balanceHash,
		at: isoOrNull(a.balanceAt),
		frozen: frozenOut,
	};
}

// Berliner Kalendertag, der um `closedAt` gerade zu Ende gegangen ist
export function closedDay(closedAt: Date): string {
	const berlin = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/Berlin",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	return berlin.format(new Date(closedAt.getTime() - 60 * 60 * 1000));
}
