import type { CustodyMode } from "@wallet/db/schema/enums";
import {
	clientFundsAllowed,
	type WalletNetwork,
} from "@/lib/wallet/core/networks";

// Sperre für Kundengelder (Plan both.money, C1), pure. Ein Hot-Konto hält
// den Schlüssel im Signer — für fremdes Geld ist das Verwahrung (MiCAR,
// CASP-Erlaubnis). Bis eine Erlaubnis eingetragen ist (custody_mode
// „licensed“, nur Plattform-Admin am Terminal), gibt es Hot-Konten nur für
// die Betreiber-Org mit eigenen Beständen („own“). Cold-Konten aus einer
// xpub darf jede Org beobachten; Zweck „Kundengelder“ nur im Testnetz.
export type CustodyFacts = { custodyMode: CustodyMode; isOperator: boolean };

export function hotAccountAllowed(f: CustodyFacts): boolean {
	if (f.custodyMode === "licensed") return true;
	return f.custodyMode === "own" && f.isOperator;
}

export function clientPurposeAllowed(
	f: CustodyFacts,
	network: WalletNetwork,
): boolean {
	return clientFundsAllowed(network, {
		caspLicensed: f.custodyMode === "licensed",
		// Stablecoins (EMT) für Kund:innen bleiben bis zur ZAG-Erlaubnis aus
		zagLicensed: false,
		emt: false,
	});
}
