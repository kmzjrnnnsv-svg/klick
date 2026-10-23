// Münzauswahl für P2WPKH-Konten (rein): größte zuerst, Gebühr aus der
// geschätzten vsize; Wechselgeld unter der Dust-Grenze geht in die Gebühr.
// vsize: 10,5 vB Kopf + 68 vB je Eingang + 31 vB je Ausgang (P2WPKH).

export const DUST_P2WPKH = 294n;

export type Utxo = {
	txid: string;
	vout: number;
	value: bigint;
	branch: 0 | 1;
	index: number;
};

export const estimateVsize = (inputs: number, outputs: number) =>
	Math.ceil(10.5 + 68 * inputs + 31 * outputs);

export const feeFor = (vsize: number, satPerVb: number) =>
	BigInt(Math.ceil(vsize * satPerVb));

export type Selection =
	| { inputs: Utxo[]; fee: bigint; change: bigint }
	| { error: "insufficient" | "fee_rate" };

export function selectCoins(
	utxos: readonly Utxo[],
	amount: bigint,
	satPerVb: number,
): Selection {
	if (!(satPerVb > 0)) return { error: "fee_rate" };
	const sorted = [...utxos].sort((a, b) =>
		a.value === b.value ? 0 : a.value > b.value ? -1 : 1,
	);
	const picked: Utxo[] = [];
	let sum = 0n;
	for (const u of sorted) {
		picked.push(u);
		sum += u.value;
		const withChange = feeFor(estimateVsize(picked.length, 2), satPerVb);
		if (sum >= amount + withChange) {
			const change = sum - amount - withChange;
			if (change >= DUST_P2WPKH)
				return { inputs: picked, fee: withChange, change };
			// ohne Wechselgeld: Rest geht vollständig in die Gebühr
			return { inputs: picked, fee: sum - amount, change: 0n };
		}
		const noChange = feeFor(estimateVsize(picked.length, 1), satPerVb);
		if (sum >= amount + noChange)
			return { inputs: picked, fee: sum - amount, change: 0n };
	}
	return { error: "insufficient" };
}
