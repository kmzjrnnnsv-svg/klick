import { Address, NETWORK } from "@scure/btc-signer";
import type { Chain } from "./core/networks";

// OFAC-SDN-Liste (sdn.xml, „classic“) → Sperr-Adressen. OFAC führt digitale
// Adressen als <id> mit idType „Digital Currency Address - <Kürzel>“. Wir
// übernehmen jede Adresse, die sich als Bitcoin-Adresse (echtes Netz) oder
// als EVM-Adresse (0x…) prüfen lässt — unabhängig vom Kürzel: derselbe
// Schlüssel steuert dieselbe 0x-Adresse auf jeder EVM-Kette, und Altformate
// (1…/3…) sind bei BTC/BCH/BSV identisch. Alles andere (XMR, TRX, SOL …)
// betrifft unsere Netze nicht.

export type OfacAddress = { chain: Chain; address: string; reference: string };

export type OfacParse = {
	publishDate: string | null;
	entries: number;
	addresses: OfacAddress[];
	skipped: number;
};

const ENTITIES: Record<string, string> = {
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&apos;": "'",
};
const decode = (s: string) =>
	s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m).trim();

const tag = (block: string, name: string) => {
	const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block);
	return m ? decode(m[1] as string) : null;
};

export function classifyAddress(
	raw: string,
): { chain: Chain; address: string } | null {
	const v = raw.trim();
	if (/^0x[0-9a-fA-F]{40}$/.test(v))
		return { chain: "ethereum", address: v.toLowerCase() };
	try {
		Address(NETWORK).decode(v);
		return {
			chain: "bitcoin",
			address: /^bc1/i.test(v) ? v.toLowerCase() : v,
		};
	} catch {
		return null;
	}
}

export function parseOfacSdnXml(xml: string): OfacParse {
	const publishDate = tag(xml, "Publish_Date");
	const out = new Map<string, OfacAddress>();
	let entries = 0;
	let skipped = 0;
	for (const m of xml.matchAll(/<sdnEntry>([\s\S]*?)<\/sdnEntry>/g)) {
		entries += 1;
		const entry = m[1] as string;
		const name = [tag(entry, "firstName"), tag(entry, "lastName")]
			.filter(Boolean)
			.join(" ");
		const uid = tag(entry, "uid");
		for (const id of entry.matchAll(/<id>([\s\S]*?)<\/id>/g)) {
			const block = id[1] as string;
			const type = tag(block, "idType") ?? "";
			if (!type.startsWith("Digital Currency Address")) continue;
			const value = tag(block, "idNumber");
			const hit = value ? classifyAddress(value) : null;
			if (!hit) {
				skipped += 1;
				continue;
			}
			const key = `${hit.chain}:${hit.address}`;
			if (!out.has(key))
				out.set(key, {
					...hit,
					reference: `SDN ${uid ?? "?"} · ${name || "ohne Namen"} · ${type.replace("Digital Currency Address - ", "")}`,
				});
		}
	}
	return { publishDate, entries, addresses: [...out.values()], skipped };
}
