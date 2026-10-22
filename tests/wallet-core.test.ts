import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { addr } from "micro-eth-signer";
import { describe, expect, it } from "vitest";
import { checkAddress, sameAddress } from "@/lib/wallet/core/address";
import {
	AmountError,
	formatAmount,
	formatAmountDe,
	parseAmount,
} from "@/lib/wallet/core/amount";
import { ASSETS, assetByContract, assetOf } from "@/lib/wallet/core/assets";
import {
	btcDescriptors,
	deriveAddress,
	ExtendedKeyError,
	parseAccountKey,
} from "@/lib/wallet/core/derive";
import {
	clientFundsAllowed,
	networkAllowed,
	WALLET_NETWORKS,
} from "@/lib/wallet/core/networks";
import { paymentUri } from "@/lib/wallet/core/uri";

const ABANDON =
	"abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const TEST_JUNK = "test test test test test test test test test test test junk";

const account = (mnemonic: string, path: string) =>
	HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic)).derive(path);

describe("Beträge", () => {
	it("rechnet in Basiseinheiten ohne Float", () => {
		expect(parseAmount("0,5", 8)).toBe(50_000_000n);
		expect(parseAmount("1.00000001", 8)).toBe(100_000_001n);
		expect(parseAmount("0.1", 18)).toBe(100_000_000_000_000_000n);
		expect(parseAmount("12", 6)).toBe(12_000_000n);
		expect(formatAmount(100_000_001n, 8)).toBe("1.00000001");
		expect(formatAmount(50_000_000n, 8)).toBe("0.5");
		expect(formatAmountDe(123_456_789_000_000n, 6)).toBe("123.456.789");
		expect(formatAmountDe(150_000_000n, 8)).toBe("1,5");
	});

	it("lehnt zu viele Nachkommastellen, Unsinn und null ab", () => {
		expect(() => parseAmount("0.123456789", 8)).toThrow(AmountError);
		expect(() => parseAmount("1.0000001", 6)).toThrow(AmountError);
		expect(() => parseAmount("-1", 8)).toThrow(AmountError);
		expect(() => parseAmount("1e3", 8)).toThrow(AmountError);
		expect(() => parseAmount("1.000,5", 8)).toThrow(AmountError);
		expect(() => parseAmount("0", 8)).toThrow(AmountError);
		expect(parseAmount("0", 8, { allowZero: true })).toBe(0n);
	});
});

describe("Ableitung aus dem Kontoschlüssel", () => {
	it("Bitcoin BIP84: Prüfvektoren aus dem Standard", () => {
		const hd = account(ABANDON, "m/84'/0'/0'");
		const { hd: acc } = parseAccountKey(
			hd.publicExtendedKey,
			"bitcoin_mainnet",
		);
		expect(deriveAddress(acc, "bitcoin_mainnet", 0, 0)).toBe(
			"bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu",
		);
		expect(deriveAddress(acc, "bitcoin_mainnet", 0, 1)).toBe(
			"bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g",
		);
		expect(deriveAddress(acc, "bitcoin_mainnet", 1, 0)).toBe(
			"bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el",
		);
	});

	it("versteht zpub aus Sparrow & Co. und gibt xpub für Bitcoin Core zurück", () => {
		const zpub =
			"zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";
		const { hd, standard } = parseAccountKey(zpub, "bitcoin_mainnet");
		expect(standard.startsWith("xpub")).toBe(true);
		expect(deriveAddress(hd, "bitcoin_mainnet", 0, 0)).toBe(
			"bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu",
		);
		expect(btcDescriptors(standard).receive).toBe(`wpkh(${standard}/0/*)`);
	});

	it("Signet: tb1-Adressen, Mainnet-Schlüssel abgelehnt", () => {
		const testAcc = HDKey.fromMasterSeed(mnemonicToSeedSync(ABANDON), {
			private: 0x04358394,
			public: 0x043587cf,
		}).derive("m/84'/1'/0'");
		const { hd } = parseAccountKey(testAcc.publicExtendedKey, "bitcoin_signet");
		expect(deriveAddress(hd, "bitcoin_signet", 0, 0)).toMatch(/^tb1q/);
		const main = account(ABANDON, "m/84'/0'/0'").publicExtendedKey;
		expect(() => parseAccountKey(main, "bitcoin_signet")).toThrow(
			ExtendedKeyError,
		);
	});

	it("Ethereum BIP44: bekannte Adressen", () => {
		const hd = account(TEST_JUNK, "m/44'/60'/0'");
		const { hd: acc } = parseAccountKey(
			hd.publicExtendedKey,
			"ethereum_sepolia",
		);
		expect(deriveAddress(acc, "ethereum_sepolia", 0, 0)).toBe(
			"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
		);
		expect(deriveAddress(acc, "ethereum_sepolia", 0, 1)).toBe(
			"0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
		);
	});

	it("nimmt nie private Schlüssel und nur die Kontoebene", () => {
		const hd = account(ABANDON, "m/84'/0'/0'");
		expect(() =>
			parseAccountKey(hd.privateExtendedKey, "bitcoin_mainnet"),
		).toThrow(expect.objectContaining({ code: "private" }));
		const master = HDKey.fromMasterSeed(mnemonicToSeedSync(ABANDON));
		expect(() =>
			parseAccountKey(master.publicExtendedKey, "bitcoin_mainnet"),
		).toThrow(expect.objectContaining({ code: "depth" }));
		expect(() => parseAccountKey("xpub123", "bitcoin_mainnet")).toThrow(
			expect.objectContaining({ code: "format" }),
		);
	});
});

describe("Adressen", () => {
	it("Bitcoin: richtiges Netz, Bech32 klein", () => {
		const a = "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu";
		expect(checkAddress("bitcoin_mainnet", a.toUpperCase())).toEqual({
			ok: true,
			address: a,
		});
		expect(checkAddress("bitcoin_signet", a)).toEqual({
			ok: false,
			error: "network",
		});
		expect(checkAddress("bitcoin_mainnet", "bc1qfalsch")).toEqual({
			ok: false,
			error: "format",
		});
	});

	it("Ethereum: Prüfsumme bei gemischter Schreibweise", () => {
		const a = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
		expect(checkAddress("ethereum_mainnet", a.toLowerCase())).toEqual({
			ok: true,
			address: a,
		});
		expect(checkAddress("ethereum_mainnet", a.replace("f39F", "f39f"))).toEqual(
			{ ok: false, error: "checksum" },
		);
		expect(checkAddress("ethereum_mainnet", "0x123")).toEqual({
			ok: false,
			error: "format",
		});
		expect(sameAddress("ethereum_mainnet", a, a.toLowerCase())).toBe(true);
	});
});

describe("Assets und Netze", () => {
	it("Token-Verträge haben gültige Prüfsummen und 6 Stellen", () => {
		for (const n of WALLET_NETWORKS)
			for (const a of ASSETS[n])
				if (a.kind === "erc20") {
					expect(addr.isValid(a.contract as string), `${n} ${a.code}`).toBe(
						true,
					);
					expect(a.decimals).toBe(6);
					expect(a.emt).toBe(true);
				}
		expect(assetOf("bitcoin_signet", "BTC")?.decimals).toBe(8);
		expect(assetOf("bitcoin_signet", "USDT")).toBeNull();
		expect(
			assetByContract(
				"ethereum_mainnet",
				"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
			)?.code,
		).toBe("USDC");
	});

	it("Echtgeld und Kundengelder nur mit Freischaltung", () => {
		expect(networkAllowed("bitcoin_signet", { liveEnabled: false })).toBe(true);
		expect(networkAllowed("bitcoin_mainnet", { liveEnabled: false })).toBe(
			false,
		);
		const off = { caspLicensed: false, zagLicensed: false, emt: false };
		expect(clientFundsAllowed("ethereum_sepolia", off)).toBe(true);
		expect(clientFundsAllowed("ethereum_mainnet", off)).toBe(false);
		expect(
			clientFundsAllowed("ethereum_mainnet", {
				caspLicensed: true,
				zagLicensed: false,
				emt: true,
			}),
		).toBe(false);
		expect(
			clientFundsAllowed("ethereum_mainnet", {
				caspLicensed: true,
				zagLicensed: false,
				emt: false,
			}),
		).toBe(true);
	});
});

describe("Zahlungs-Links", () => {
	const usdc = assetOf("ethereum_sepolia", "USDC");
	it("BIP-21 und EIP-681", () => {
		expect(
			paymentUri({
				network: "bitcoin_signet",
				asset: assetOf("bitcoin_signet", "BTC") as NonNullable<
					ReturnType<typeof assetOf>
				>,
				address: "tb1qexample",
				amount: 50_000_000n,
			}),
		).toBe("bitcoin:tb1qexample?amount=0.5");
		expect(
			paymentUri({
				network: "ethereum_sepolia",
				asset: usdc as NonNullable<typeof usdc>,
				address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
				amount: 5_000_000n,
			}),
		).toBe(
			"ethereum:0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238@11155111/transfer?address=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266&uint256=5000000",
		);
	});
});
