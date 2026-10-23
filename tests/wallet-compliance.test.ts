import { describe, expect, it } from "vitest";
import { classifyAddress, parseOfacSdnXml } from "@/lib/wallet/ofac";
import {
	nodeHoldings,
	reconciliationSymbol,
} from "@/lib/wallet/reconcile-source";

const SDN = `<?xml version="1.0" standalone="yes"?>
<sdnList xmlns="http://tempuri.org/sdnList.xsd">
  <publshInformation><Publish_Date>10/21/2026</Publish_Date><Record_Count>3</Record_Count></publshInformation>
  <sdnEntry>
    <uid>101</uid><lastName>EXAMPLE MIXER &amp; CO</lastName><sdnType>Entity</sdnType>
    <idList>
      <id><uid>1</uid><idType>Digital Currency Address - ETH</idType><idNumber>0x8589427373D6D84E98730D7795D8f6f8731FDA16</idNumber></id>
      <id><uid>2</uid><idType>Digital Currency Address - USDT</idType><idNumber>0x8589427373d6d84e98730d7795d8f6f8731fda16</idNumber></id>
      <id><uid>3</uid><idType>Digital Currency Address - XMR</idType><idNumber>4AdUndXHHZ6cfufTMvppY6JwXNouMBzSkbLYfpAV5Usx3skxNgYeYTRj5UzqtReoS44qo9mtmXCqY45DJ852K5Jv2684Rge</idNumber></id>
      <id><uid>4</uid><idType>Passport</idType><idNumber>X123</idNumber></id>
    </idList>
  </sdnEntry>
  <sdnEntry>
    <uid>202</uid><firstName>Max</firstName><lastName>MUSTER</lastName>
    <idList>
      <id><idType>Digital Currency Address - XBT</idType><idNumber>BC1QCR8TE4KR609GCAWUTMRZA0J4XV80JY8Z306FYU</idNumber></id>
      <id><idType>Digital Currency Address - XBT</idType><idNumber>1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2</idNumber></id>
      <id><idType>Digital Currency Address - XBT</idType><idNumber>kaputt</idNumber></id>
    </idList>
  </sdnEntry>
  <sdnEntry><uid>303</uid><lastName>OHNE ADRESSE</lastName></sdnEntry>
</sdnList>`;

describe("OFAC-SDN-Import", () => {
	it("nur prüfbare Bitcoin- und EVM-Adressen, ohne Doppelte", () => {
		const r = parseOfacSdnXml(SDN);
		expect(r.publishDate).toBe("10/21/2026");
		expect(r.entries).toBe(3);
		expect(r.skipped).toBe(2); // XMR + kaputt
		expect(r.addresses.map((a) => [a.chain, a.address])).toEqual([
			["ethereum", "0x8589427373d6d84e98730d7795d8f6f8731fda16"],
			["bitcoin", "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu"],
			["bitcoin", "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"],
		]);
		expect(r.addresses[0]?.reference).toBe(
			"SDN 101 · EXAMPLE MIXER & CO · ETH",
		);
		expect(r.addresses[1]?.reference).toContain("Max MUSTER");
	});

	it("Testnetz-Adressen sind keine Treffer der echten Liste", () => {
		expect(
			classifyAddress("tb1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu"),
		).toBeNull();
		expect(classifyAddress("0x123")).toBeNull();
	});
});

describe("Abstimmung: Bestand laut Knoten", () => {
	const base = {
		status: "active" as const,
		balanceHeight: 812,
		balanceHash: "00ab",
		balanceAt: new Date("2026-10-22T06:00:00Z"),
	};
	it("nur Kundenkonten, Testnetz mit eigenem Kürzel, exakt summiert", () => {
		const out = nodeHoldings([
			{
				...base,
				network: "bitcoin_signet",
				purpose: "client",
				balances: { BTC: { confirmed: "150000000", pending: "5" } },
			},
			{
				...base,
				network: "bitcoin_signet",
				purpose: "client",
				balances: { BTC: { confirmed: "1", pending: "0" } },
			},
			{
				...base,
				network: "bitcoin_signet",
				purpose: "own",
				balances: { BTC: { confirmed: "999", pending: "0" } },
			},
			{
				...base,
				network: "ethereum_sepolia",
				purpose: "client",
				balances: {
					ETH: { confirmed: "1000000000000000000", pending: "0" },
					USDC: { confirmed: "12500000", pending: "0" },
				},
			},
			{
				...base,
				network: "ethereum_sepolia",
				purpose: "client",
				balances: null,
			},
		]);
		expect(out.map((h) => [h.symbol, h.onChain])).toEqual([
			["BTC.SIGNET", "1.50000001"],
			["ETH.SEPOLIA", "1"],
			["USDC.SEPOLIA", "12.5"],
		]);
		expect(out[0]?.sources).toEqual([
			{
				network: "bitcoin_signet",
				height: 812,
				hash: "00ab",
				at: "2026-10-22T06:00:00.000Z",
			},
		]);
		expect(reconciliationSymbol("bitcoin_mainnet", "BTC")).toBe("BTC");
	});
});
