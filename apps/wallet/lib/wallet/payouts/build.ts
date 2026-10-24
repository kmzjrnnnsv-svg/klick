import type { PayoutSpeed } from "@wallet/db/schema";
import {
	type WalletAccount,
	walletAddresses,
	walletPayouts,
	walletTransfers,
} from "@wallet/db/schema";
import type { OrgTx } from "@wallet/lib/db/with-org";
import { and, eq, inArray } from "drizzle-orm";
import { type AssetCode, assetOf } from "@/lib/wallet/core/assets";
import type { Utxo } from "@/lib/wallet/core/coin-select";
import { transferCalldata } from "@/lib/wallet/core/eth-spend";
import type { Policy } from "@/lib/wallet/core/policy";
import {
	btcFeeCap,
	btcFeeRate,
	btcPerKvbToSatPerVb,
	ETH_TRANSFER_GAS,
	ethFees,
	OPEN_PAYOUT_STATUS,
	outpoint,
	SPEED_BLOCKS,
	selectInputs,
	tokenGasLimit,
} from "@/lib/wallet/payouts/plan";
import { type BitcoinRpc, btcToSats } from "@/lib/wallet/rpc/bitcoin";
import type { EthereumRpc } from "@/lib/wallet/rpc/ethereum";

// Ausgabeplan aus dem eigenen Knoten (Plan Wallet, Phase 2): Eingänge mit
// vollständiger Vorgänger-Transaktion bzw. Nonce und Gas. Ziel und Betrag
// stehen in der Absicht — der Signer übernimmt sie nie aus dem Plan.

export const btcWalletName = (accountId: string) => `klick-${accountId}`;

export type BtcPlan = {
	inputs: {
		txid: string;
		vout: number;
		prevTxHex: string;
		branch: 0 | 1;
		index: number;
	}[];
	fee: string;
};
export type EthPlan = {
	nonce: string;
	gasLimit: string;
	maxFeePerGas: string;
	maxPriorityFeePerGas: string;
};

export type PlanError =
	| "insufficient"
	| "fee_cap"
	| "fee_rate"
	| "gas_balance"
	| "token_revert";

// Adresse → Zweig/Index (eigene Ableitung, gespeichert vom Sync)
export async function addressIndex(tx: OrgTx, accountId: string) {
	const rows = await tx
		.select({
			address: walletAddresses.address,
			branch: walletAddresses.branch,
			index: walletAddresses.index,
		})
		.from(walletAddresses)
		.where(eq(walletAddresses.accountId, accountId));
	return new Map(
		rows.map(
			(r) =>
				[
					r.address.toLowerCase(),
					{ branch: r.branch as 0 | 1, index: r.index },
				] as const,
		),
	);
}

// Nicht ausgeben: eingefrorene Eingänge (Sanktionstreffer) und Eingänge, die
// eine andere offene Auszahlung schon im Plan hat
export async function excludedOutpoints(
	tx: OrgTx,
	orgId: string,
	accountId: string,
	exceptPayoutId?: string,
): Promise<Set<string>> {
	const out = new Set<string>();
	const frozen = await tx
		.select({
			txid: walletTransfers.txid,
			outputRef: walletTransfers.outputRef,
		})
		.from(walletTransfers)
		.where(
			and(
				eq(walletTransfers.organizationId, orgId),
				eq(walletTransfers.accountId, accountId),
				eq(walletTransfers.frozen, true),
			),
		);
	for (const f of frozen) {
		const m = /^in:vout:(\d+)$/.exec(f.outputRef);
		if (m) out.add(`${f.txid}:${m[1]}`);
	}
	const open = await tx
		.select({ id: walletPayouts.id, plan: walletPayouts.plan })
		.from(walletPayouts)
		.where(
			and(
				eq(walletPayouts.organizationId, orgId),
				eq(walletPayouts.accountId, accountId),
				inArray(walletPayouts.status, [...OPEN_PAYOUT_STATUS]),
			),
		);
	for (const p of open) {
		if (p.id === exceptPayoutId) continue;
		const inputs = (p.plan as BtcPlan | null)?.inputs ?? [];
		for (const i of inputs) out.add(outpoint(i));
	}
	return out;
}

export async function btcUtxos(
	btc: BitcoinRpc,
	accountId: string,
	index: ReadonlyMap<string, { branch: 0 | 1; index: number }>,
): Promise<Utxo[]> {
	const list = await btc.listUnspent(btcWalletName(accountId), 1);
	return list.flatMap((u) => {
		const at = u.address ? index.get(u.address.toLowerCase()) : undefined;
		return at
			? [{ txid: u.txid, vout: u.vout, value: btcToSats(u.amount), ...at }]
			: [];
	});
}

export async function btcRate(
	btc: BitcoinRpc,
	speed: PayoutSpeed,
	policy: Policy,
): Promise<number> {
	const est = btcPerKvbToSatPerVb(
		await btc.estimateSmartFee(SPEED_BLOCKS[speed]).catch(() => null),
	);
	return btcFeeRate(est, speed, policy.feeCaps.btcSatPerVb);
}

// Deckel der Absicht beim Anlegen (Probe-Auswahl für die erwartete Größe)
export async function btcCapForPayout(
	btc: BitcoinRpc,
	accountId: string,
	index: ReadonlyMap<string, { branch: 0 | 1; index: number }>,
	amount: bigint,
	speed: PayoutSpeed,
	policy: Policy,
	exclude: ReadonlySet<string>,
): Promise<{ feeCap: bigint; fee: bigint } | { error: PlanError }> {
	const rate = await btcRate(btc, speed, policy);
	const utxos = await btcUtxos(btc, accountId, index);
	const sel = selectInputs(utxos, amount, rate, exclude);
	if ("error" in sel) return { error: sel.error };
	return {
		fee: sel.fee,
		feeCap: btcFeeCap(rate, sel.inputs.length, policy.feeCaps.btcSatPerVb),
	};
}

export async function btcBuildPlan(
	btc: BitcoinRpc,
	accountId: string,
	index: ReadonlyMap<string, { branch: 0 | 1; index: number }>,
	amount: bigint,
	speed: PayoutSpeed,
	policy: Policy,
	feeCap: bigint,
	exclude: ReadonlySet<string>,
): Promise<BtcPlan | { error: PlanError }> {
	const rate = await btcRate(btc, speed, policy);
	const sel = selectInputs(
		await btcUtxos(btc, accountId, index),
		amount,
		rate,
		exclude,
	);
	if ("error" in sel) return { error: sel.error };
	if (sel.fee > feeCap) return { error: "fee_cap" };
	const wallet = btcWalletName(accountId);
	const inputs: BtcPlan["inputs"] = [];
	for (const u of sel.inputs) {
		const prev = await btc.getTransaction(wallet, u.txid);
		inputs.push({
			txid: u.txid,
			vout: u.vout,
			prevTxHex: prev.hex,
			branch: u.branch,
			index: u.index,
		});
	}
	return { inputs, fee: sel.fee.toString() };
}

export async function ethGasFor(
	eth: EthereumRpc,
	network: WalletAccount["network"],
	asset: AssetCode,
	from: string,
	destination: string,
	amount: bigint,
): Promise<bigint | { error: PlanError }> {
	const info = assetOf(network, asset);
	if (!info?.contract) return ETH_TRANSFER_GAS;
	try {
		const est = await eth.estimateGas({
			from,
			to: info.contract,
			data: transferCalldata(destination, amount),
		});
		return tokenGasLimit(est);
	} catch {
		// z. B. Circle-Sperre oder zu wenig Token: der Knoten rollt zurück
		return { error: "token_revert" };
	}
}

export async function ethBuildPlan(
	eth: EthereumRpc,
	p: {
		network: WalletAccount["network"];
		asset: AssetCode;
		from: string;
		destination: string;
		amount: bigint;
		speed: PayoutSpeed;
		feeCap: bigint;
	},
	policy: Policy,
	nonceOverride?: bigint,
): Promise<EthPlan | { error: PlanError }> {
	const gas = await ethGasFor(
		eth,
		p.network,
		p.asset,
		p.from,
		p.destination,
		p.amount,
	);
	if (typeof gas !== "bigint") return gas;
	const hist = await eth.feeHistory();
	const fees = ethFees(
		hist.nextBaseFee,
		hist.priorityFee,
		p.speed,
		policy.feeCaps.ethMaxFeeGwei,
	);
	if (gas * fees.maxFeePerGas > p.feeCap) return { error: "fee_cap" };
	const balance = await eth.balance(p.from, "latest");
	const need = gas * fees.maxFeePerGas + (p.asset === "ETH" ? p.amount : 0n);
	if (balance < need) return { error: "gas_balance" };
	const nonce =
		nonceOverride ?? (await eth.transactionCount(p.from, "pending"));
	return {
		nonce: nonce.toString(),
		gasLimit: gas.toString(),
		maxFeePerGas: fees.maxFeePerGas.toString(),
		maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
	};
}

// Deckel der Absicht für Ethereum: doppelte Höchstgebühr (Raum für zwei
// Erhöhungen), höchstens bis zur Grenze der Richtlinie bei 100 000 Gas
export async function ethCapForPayout(
	eth: EthereumRpc,
	p: {
		network: WalletAccount["network"];
		asset: AssetCode;
		from: string;
		destination: string;
		amount: bigint;
		speed: PayoutSpeed;
	},
	policy: Policy,
): Promise<{ feeCap: bigint } | { error: PlanError }> {
	const gas = await ethGasFor(
		eth,
		p.network,
		p.asset,
		p.from,
		p.destination,
		p.amount,
	);
	if (typeof gas !== "bigint") return gas;
	const hist = await eth.feeHistory();
	const fees = ethFees(
		hist.nextBaseFee,
		hist.priorityFee,
		p.speed,
		policy.feeCaps.ethMaxFeeGwei,
	);
	const ceiling =
		BigInt(policy.feeCaps.ethMaxFeeGwei) * 1_000_000_000n * 100_000n;
	const cap = gas * fees.maxFeePerGas * 2n;
	return { feeCap: cap > ceiling ? ceiling : cap };
}
