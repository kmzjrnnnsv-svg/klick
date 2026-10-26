import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	encodeMandate,
	type Mandate,
	MandateError,
	mandateChallenge,
	mandateCovers,
	normalizeDestinations,
	parseMandate,
} from "@/lib/wallet/core/mandate";

// Vollmacht als kanonischer Text (Härtung W) — rein, wie die Absicht

const A = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const B = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const base: Mandate = {
	orgId: "11111111-1111-4111-8111-111111111111",
	mandateId: "22222222-2222-4222-8222-222222222222",
	grantee: "33333333-3333-4333-8333-333333333333",
	network: "ethereum_sepolia",
	chainId: 11155111,
	asset: "USDC",
	perPayout: 1_000_000_000n,
	total: 5_000_000_000n,
	destinations: [A, B].sort(),
	validFrom: 1_793_000_000,
	validUntil: 1_793_000_000 + 30 * 86_400,
	issuer: "44444444-4444-4444-8444-444444444444",
	nonce: "0123456789abcdef0123456789abcdef",
};

describe("Vollmacht: kanonischer Text", () => {
	it("Rundreise exakt, Challenge = SHA-256", () => {
		const text = encodeMandate(base);
		expect(text.startsWith("both-mandate/v1|")).toBe(true);
		expect(text.split("|")).toHaveLength(14);
		expect(parseMandate(text)).toEqual(base);
		expect(Buffer.from(mandateChallenge(text)).toString("hex")).toBe(
			createHash("sha256").update(text).digest("hex"),
		);
	});

	it("lehnt falsche Felder und zweite Schreibweisen ab", () => {
		const bad = (m: Partial<Mandate>, field: string) =>
			expect(() => encodeMandate({ ...base, ...m })).toThrow(
				new MandateError(field),
			);
		bad({ grantee: base.issuer }, "self");
		bad({ chainId: 1 }, "chain");
		bad({ asset: "BTC" }, "asset");
		bad({ perPayout: 6_000_000_000n }, "amount");
		bad({ total: 0n }, "amount");
		bad({ destinations: [] }, "destinations");
		bad({ destinations: [...base.destinations].reverse() }, "destinations");
		bad({ destinations: [A, A] }, "destinations");
		bad({ destinations: [A.toLowerCase()] }, "destination");
		bad({ validUntil: base.validFrom }, "until");
		bad({ validUntil: base.validFrom + 91 * 86_400 }, "until");
		bad({ nonce: "xyz" }, "nonce");
		const text = encodeMandate(base);
		expect(() => parseMandate(text.replace("|USDC|", "|usdc|"))).toThrow();
		expect(() => parseMandate(`${text}|x`)).toThrow();
		expect(() =>
			parseMandate(text.replace("|1000000000|", "|01000000000|")),
		).toThrow();
	});

	it("Zieladressen normalisiert und sortiert", () => {
		expect(normalizeDestinations("ethereum_sepolia", [B, A, ` ${A} `])).toEqual(
			[A, B].sort(),
		);
		expect(() => normalizeDestinations("ethereum_sepolia", ["kaputt"])).toThrow(
			new MandateError("destination"),
		);
	});
});

describe("Vollmacht: deckt sie die Auszahlung?", () => {
	const p = {
		grantee: base.grantee,
		network: base.network,
		asset: base.asset,
		amount: 1_000_000_000n,
		destination: A,
		at: base.validFrom + 60,
		used: 0n,
	};
	it("im Rahmen", () => {
		expect(mandateCovers(base, p)).toBe("ok");
		expect(mandateCovers(base, { ...p, used: 4_000_000_000n })).toBe("ok");
	});
	it("jede Grenze einzeln", () => {
		expect(mandateCovers(base, { ...p, grantee: base.issuer })).toBe("grantee");
		expect(mandateCovers(base, { ...p, network: "ethereum_mainnet" })).toBe(
			"network",
		);
		expect(mandateCovers(base, { ...p, asset: "EURC" })).toBe("asset");
		expect(
			mandateCovers(base, {
				...p,
				destination: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
			}),
		).toBe("destination");
		expect(mandateCovers(base, { ...p, at: base.validFrom - 1 })).toBe(
			"not_yet",
		);
		expect(mandateCovers(base, { ...p, at: base.validUntil })).toBe("expired");
		expect(mandateCovers(base, { ...p, amount: 1_000_000_001n })).toBe(
			"per_payout",
		);
		expect(mandateCovers(base, { ...p, used: 4_500_000_000n })).toBe("total");
	});
});
