import {
	accessChanges,
	accessPolicyOf,
	allowedAssetsOn,
	assetAllowed,
	credentialAllowed,
	deviceBound,
	isRelaxing,
	mandateRequired,
	networkHasAllowedAsset,
	OPEN_ACCESS_POLICY,
	onlyDeviceBound,
	signerAssetMismatch,
	walletNetworkAllows,
} from "@wallet/lib/orgs/access-policy";
import { describe, expect, it } from "vitest";

// Zugangsregeln je Wallet-Org (Härtung W) — rein

const withNet = (...cidrs: string[]) =>
	accessPolicyOf({
		networkPolicy: { members: cidrs.map((cidr) => ({ cidr, note: "" })) },
	});

describe("Zugangsregeln lesen", () => {
	it("leer = alles offen; Unbekanntes fällt weg", () => {
		expect(accessPolicyOf({})).toEqual(OPEN_ACCESS_POLICY);
		const p = accessPolicyOf({
			networkPolicy: {
				members: [{ cidr: "kaputt" }, { cidr: "10.9.0.0/24", note: "WG" }],
				externals: [{ cidr: "0.0.0.0/0" }],
				exceptions: { wallet: true },
			},
			securityKeysOnly: true,
			allowedAssets: ["USDC", "DOGE", "USDC", "EURC"],
		});
		expect(p.network.members).toEqual([{ cidr: "10.9.0.0/24", note: "WG" }]);
		// both.money kennt keine Externen und keine Ausnahmen
		expect(p.network.externals).toBeNull();
		expect(Object.values(p.network.exceptions).every((v) => !v)).toBe(true);
		expect(p.securityKeysOnly).toBe(true);
		expect(p.allowedAssets).toEqual(["USDC", "EURC"]);
		expect(p.mandatesRequired).toBe(false);
	});

	it("IP-Liste: aus = offen, sonst nur die Netze, unbekannte Adresse nie", () => {
		expect(walletNetworkAllows(OPEN_ACCESS_POLICY, "198.51.100.7")).toBe(true);
		const p = withNet("10.9.0.0/24", "2001:db8::/32");
		expect(walletNetworkAllows(p, "10.9.0.5")).toBe(true);
		expect(walletNetworkAllows(p, "::ffff:10.9.0.5")).toBe(true);
		expect(walletNetworkAllows(p, "2001:db8::1")).toBe(true);
		expect(walletNetworkAllows(p, "10.9.1.5")).toBe(false);
		expect(walletNetworkAllows(p, null)).toBe(false);
	});
});

describe("Sicherheitsschlüssel", () => {
	const key = { deviceType: "singleDevice", backedUp: false };
	const synced = { deviceType: "multiDevice", backedUp: true };
	it("gerätegebunden = singleDevice und nicht gesichert", () => {
		expect(deviceBound(key)).toBe(true);
		expect(deviceBound(synced)).toBe(false);
		expect(deviceBound({ deviceType: "multiDevice", backedUp: false })).toBe(
			false,
		);
		expect(deviceBound({ deviceType: "singleDevice", backedUp: true })).toBe(
			false,
		);
		expect(deviceBound({ deviceType: null, backedUp: null })).toBe(false);
	});
	it("Regel greift nur, wenn eine Org sie verlangt", () => {
		expect(credentialAllowed(false, synced)).toBe(true);
		expect(credentialAllowed(true, synced)).toBe(false);
		expect(credentialAllowed(true, key)).toBe(true);
	});
	it("Konto: alle Schlüssel gerätegebunden, mindestens einer", () => {
		expect(onlyDeviceBound([])).toBe(false);
		expect(onlyDeviceBound([key, key])).toBe(true);
		expect(onlyDeviceBound([key, synced])).toBe(false);
	});
});

describe("Nur bestimmte Assets", () => {
	const tokens = accessPolicyOf({ allowedAssets: ["USDC", "EURC"] });
	it("Assets und Netze", () => {
		expect(assetAllowed(OPEN_ACCESS_POLICY, "BTC")).toBe(true);
		expect(assetAllowed(tokens, "ETH")).toBe(false);
		expect(assetAllowed(tokens, "EURC")).toBe(true);
		expect(allowedAssetsOn(tokens, "ethereum_sepolia")).toEqual([
			"USDC",
			"EURC",
		]);
		expect(networkHasAllowedAsset(tokens, "bitcoin_signet")).toBe(false);
		expect(networkHasAllowedAsset(tokens, "ethereum_mainnet")).toBe(true);
		expect(networkHasAllowedAsset(OPEN_ACCESS_POLICY, "bitcoin_mainnet")).toBe(
			true,
		);
	});
	it("Signer zahlt nichts aus, was die Org nicht führt", () => {
		const limit = { perPayout: "1", perDay: "1" };
		expect(signerAssetMismatch(tokens, { USDC: limit, EURC: limit })).toEqual(
			[],
		);
		expect(
			signerAssetMismatch(tokens, { BTC: limit, ETH: limit, USDC: limit }),
		).toEqual(["BTC", "ETH"]);
		expect(signerAssetMismatch(OPEN_ACCESS_POLICY, { BTC: limit })).toEqual([]);
	});
});

describe("Vollmacht", () => {
	it("nur wenn eingeschaltet, nie für Inhaber:innen", () => {
		const on = accessPolicyOf({ mandatesRequired: true });
		expect(mandateRequired(OPEN_ACCESS_POLICY, "operator")).toBe(false);
		expect(mandateRequired(on, "operator")).toBe(true);
		expect(mandateRequired(on, "viewer")).toBe(true);
		expect(mandateRequired(on, "owner")).toBe(false);
	});
});

describe("Änderungen", () => {
	it("Netz: enger, weiter, aus; Beschreibung allein ist keine Änderung", () => {
		const a = withNet("10.9.0.0/24");
		const ab = withNet("10.9.0.0/24", "192.0.2.0/24");
		expect(accessChanges(OPEN_ACCESS_POLICY, a)).toEqual(["network_tightened"]);
		expect(accessChanges(ab, a)).toEqual(["network_tightened"]);
		expect(accessChanges(a, ab)).toEqual(["network_relaxed"]);
		expect(accessChanges(a, OPEN_ACCESS_POLICY)).toEqual(["network_relaxed"]);
		const renamed = accessPolicyOf({
			networkPolicy: { members: [{ cidr: "10.9.0.0/24", note: "Büro" }] },
		});
		expect(accessChanges(a, renamed)).toEqual([]);
	});
	it("Schlüssel, Assets, Vollmacht; Lockerungen erkannt", () => {
		const strict = accessPolicyOf({
			securityKeysOnly: true,
			allowedAssets: ["USDC"],
			mandatesRequired: true,
		});
		expect(accessChanges(OPEN_ACCESS_POLICY, strict)).toEqual([
			"security_keys_on",
			"assets_tightened",
			"mandates_on",
		]);
		const back = accessChanges(strict, OPEN_ACCESS_POLICY);
		expect(back).toEqual([
			"security_keys_off",
			"assets_relaxed",
			"mandates_off",
		]);
		expect(back.every(isRelaxing)).toBe(true);
		expect(
			accessChanges(
				accessPolicyOf({ allowedAssets: ["USDC"] }),
				accessPolicyOf({ allowedAssets: ["EURC"] }),
			),
		).toEqual(["assets_relaxed"]);
	});
});
