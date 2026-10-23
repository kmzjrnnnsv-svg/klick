import type { PayoutSpeed, PayoutStatus } from "@/db/schema/wallet";
import {
	estimateVsize,
	feeFor,
	type Selection,
	selectCoins,
	type Utxo,
} from "@/lib/wallet/core/coin-select";
import type { SignerIntentView } from "@/lib/wallet/signer/client";

// Auszahlungen (rein, getestet): Gebühren je Tempo, Deckel der Absicht,
// Erhöhung, Münzauswahl ohne gesperrte/reservierte Eingänge und Stand aus
// der Sicht des Signers. Der Signer prüft alles noch einmal selbst — hier
// geht es darum, ihm einen Plan zu geben, den er annimmt.

export const SPEED_BLOCKS: Record<PayoutSpeed, number> = {
	slow: 6,
	normal: 3,
	fast: 1,
};

// Bitcoin: Satz aus estimatesmartfee (sat/vB) je Tempo, nie unter 1, nie
// über dem Deckel der Richtlinie
export function btcFeeRate(
	estimate: number | null,
	speed: PayoutSpeed,
	capSatPerVb: number,
): number {
	const base = estimate && estimate > 0 ? estimate : 2;
	const factor = speed === "fast" ? 1.5 : speed === "slow" ? 0.8 : 1;
	return Math.min(capSatPerVb, Math.max(1, Math.ceil(base * factor * 10) / 10));
}

// BTC/kvB (exakt als Text) → sat/vB
export function btcPerKvbToSatPerVb(feerate: string | null): number | null {
	if (!feerate) return null;
	const [whole, frac = ""] = feerate.split(".");
	const sats =
		BigInt(whole ?? "0") * 100_000_000n +
		BigInt(frac.padEnd(8, "0").slice(0, 8) || "0");
	return Number(sats) / 1000;
}

// Deckel der Absicht: doppelter Satz (Raum für eine Erhöhung) für die
// erwartete Größe, höchstens bis zum Deckel der Richtlinie
export function btcFeeCap(
	rate: number,
	inputs: number,
	capSatPerVb: number,
): bigint {
	const vsize = estimateVsize(Math.max(1, inputs) + 1, 2);
	return feeFor(vsize, Math.min(capSatPerVb, rate * 2));
}

// Erhöhung: mindestens +50 % und mindestens 1 sat/vB mehr (Relay-Regel),
// nie über dem Deckel der Absicht
export function bumpBtcFee(
	prevFee: bigint,
	vsize: number,
	feeCap: bigint,
): bigint | null {
	const next = [
		prevFee + (prevFee + 1n) / 2n,
		prevFee + BigInt(vsize) + 1n,
	].reduce((a, b) => (a > b ? a : b));
	return next <= feeCap ? next : null;
}

export type EthFees = { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };

const GWEI = 1_000_000_000n;

export function ethFees(
	nextBaseFee: bigint,
	priorityFee: bigint,
	speed: PayoutSpeed,
	capGwei: number,
): EthFees {
	const tipFloor = speed === "fast" ? GWEI : GWEI / 10n;
	const tip = priorityFee > tipFloor ? priorityFee : tipFloor;
	const priority = speed === "fast" ? tip * 2n : tip;
	const cap = BigInt(capGwei) * GWEI;
	let max = nextBaseFee * 2n + priority;
	if (max > cap) max = cap;
	return {
		maxFeePerGas: max,
		maxPriorityFeePerGas: priority > max ? max : priority,
	};
}

// Erhöhung wie die Knoten: beide Werte mindestens +10 % (wir nehmen +25 %)
export function bumpEthFees(prev: EthFees, capGwei: number): EthFees | null {
	const up = (v: bigint) => (v * 125n + 99n) / 100n;
	const next = {
		maxFeePerGas: up(prev.maxFeePerGas),
		maxPriorityFeePerGas: up(prev.maxPriorityFeePerGas),
	};
	return next.maxFeePerGas <= BigInt(capGwei) * GWEI ? next : null;
}

export const ETH_TRANSFER_GAS = 21_000n;
export const MAX_TOKEN_GAS = 100_000n;

// Gas für Token-Aufrufe: Schätzung des Knotens + 20 %, höchstens 100 000
export function tokenGasLimit(estimate: bigint | null): bigint {
	if (!estimate) return 80_000n;
	const padded = (estimate * 12n + 9n) / 10n;
	return padded > MAX_TOKEN_GAS ? MAX_TOKEN_GAS : padded;
}

export const outpoint = (u: { txid: string; vout: number }) =>
	`${u.txid}:${u.vout}`;

// Münzauswahl ohne eingefrorene (Sanktionstreffer) und reservierte
// (andere, noch offene Auszahlungen) Eingänge
export function selectInputs(
	utxos: readonly Utxo[],
	amount: bigint,
	satPerVb: number,
	exclude: ReadonlySet<string>,
): Selection {
	return selectCoins(
		utxos.filter((u) => !exclude.has(outpoint(u))),
		amount,
		satPerVb,
	);
}

// Stand einer wartenden Auszahlung aus der Sicht des Signers
export function payoutStatusFromView(
	view: Pick<
		SignerIntentView,
		"cancelled" | "vetoed" | "approvedAt" | "expiresAt" | "signed" | "signUntil"
	>,
	nowSec: number,
): Extract<
	PayoutStatus,
	"awaiting_approval" | "approved" | "cancelled" | "expired"
> {
	if (view.cancelled || view.vetoed) return "cancelled";
	if (view.approvedAt !== null) {
		if (!view.signed && view.signUntil !== null && nowSec > view.signUntil)
			return "expired";
		return "approved";
	}
	return nowSec > view.expiresAt ? "expired" : "awaiting_approval";
}

// Offene Stände, an denen der Job arbeitet
export const OPEN_PAYOUT_STATUS: readonly PayoutStatus[] = [
	"awaiting_approval",
	"approved",
	"signed",
	"broadcast",
];
