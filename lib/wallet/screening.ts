import type { Chain } from "./core/networks";

// Sanktionsprüfung von Adressen (EBA/GL/2024/15: jede Übertragung vor der
// Gutschrift). Geprüft werden die direkten Absender (Bitcoin: Adressen der
// Eingänge; Ethereum: Absender des Aufrufs/Transfers und der Transaktion).
// Liste: OFAC-SDN-Adressen (eigener Import) + Plattform-Sperren. Grenze:
// nur direkte Berührung — tiefere On-Chain-Analyse folgt in Phase K.

export type SanctionEntry = { reference: string | null; source: string };
export type SanctionSet = ReadonlyMap<string, SanctionEntry>; // "chain:adresse"

export const sanctionKey = (chain: Chain, address: string) =>
	`${chain}:${chain === "ethereum" ? address.toLowerCase() : address.trim()}`;

export type ScreeningOutcome =
	| { result: "clear"; ref: null }
	| { result: "hit"; ref: string };

export function screenSources(
	chain: Chain,
	sources: readonly (string | null | undefined)[],
	set: SanctionSet,
): ScreeningOutcome {
	for (const s of sources) {
		if (!s) continue;
		// Bitcoin: Bech32 klein, Base58 wie geschrieben — beide Formen prüfen
		const hit =
			set.get(sanctionKey(chain, s)) ??
			(chain === "bitcoin"
				? set.get(sanctionKey(chain, s.toLowerCase()))
				: undefined);
		if (hit)
			return {
				result: "hit",
				ref: `${hit.source}:${s}${hit.reference ? ` (${hit.reference})` : ""}`,
			};
	}
	return { result: "clear", ref: null };
}
