import type { ReconciliationLine } from "@/db/schema";
import { absDecimal, formatDecimal, parseDecimal } from "./decimal";

// Tägliche Abstimmung des Kundenvermögens (MiCAR Art. 70 Abs. 1, Art. 75
// Abs. 8) — rein. Je Kryptowert werden die Positionen summiert: Bestand
// on-chain (Kundenwallets) gegen das interne Kundenbuch. Unterdeckung über
// der Toleranz ist ein Befund (Kundenvermögen nicht vollständig gedeckt),
// Überdeckung ein Klärungsfall (z. B. nicht gebuchte Einzahlung).

export type SymbolResult = {
	symbol: string;
	onChain: string;
	ledger: string;
	difference: string; // on-chain − Kundenbuch
	tolerance: string;
	state: "ok" | "shortfall" | "surplus";
};

export type ReconcileResult = {
	symbols: SymbolResult[];
	status: "matched" | "difference";
	shortfall: boolean;
};

export function reconcile(
	lines: readonly ReconciliationLine[],
): ReconcileResult {
	const by = new Map<
		string,
		{ onChain: bigint; ledger: bigint; tolerance: bigint }
	>();
	for (const l of lines) {
		const key = l.symbol.trim().toUpperCase();
		const cur = by.get(key) ?? { onChain: 0n, ledger: 0n, tolerance: 0n };
		cur.onChain += parseDecimal(l.onChain);
		cur.ledger += parseDecimal(l.ledger);
		// Toleranz je Kryptowert: die größte angegebene gilt
		const tol = absDecimal(parseDecimal(l.tolerance || "0"));
		if (tol > cur.tolerance) cur.tolerance = tol;
		by.set(key, cur);
	}
	const symbols: SymbolResult[] = [...by.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([symbol, v]) => {
			const diff = v.onChain - v.ledger;
			const state =
				absDecimal(diff) <= v.tolerance
					? "ok"
					: diff < 0n
						? "shortfall"
						: "surplus";
			return {
				symbol,
				onChain: formatDecimal(v.onChain),
				ledger: formatDecimal(v.ledger),
				difference: formatDecimal(diff),
				tolerance: formatDecimal(v.tolerance),
				state,
			};
		});
	const shortfall = symbols.some((s) => s.state === "shortfall");
	return {
		symbols,
		status: symbols.every((s) => s.state === "ok") ? "matched" : "difference",
		shortfall,
	};
}

// Stichtag der Abstimmung = letzter Geschäftstag vor `now` (Mo–Fr,
// Kalendertag in Europe/Berlin). Feiertage zählen nicht als Ausnahme —
// lieber eine Erinnerung zu viel.
export function previousBusinessDay(now: Date): string {
	const berlin = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/Berlin",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
	const d = new Date(`${berlin}T12:00:00Z`);
	do d.setUTCDate(d.getUTCDate() - 1);
	while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
	return d.toISOString().slice(0, 10);
}

// Vier-Augen-Prinzip: geprüft wird nicht von der Person, die erfasst hat —
// außer die Org hat nur ein Mitglied (Solo-Modus wie bei Freigaben).
export function reviewerAllowed(input: {
	preparedByUserId: string | null;
	reviewerUserId: string;
	memberCount: number;
}): boolean {
	if (input.memberCount <= 1) return true;
	return input.preparedByUserId !== input.reviewerUserId;
}
