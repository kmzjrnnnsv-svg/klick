import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	ASSETS as CONFIRM_ASSETS,
	NETWORKS as CONFIRM_NETWORKS,
	challengeOf,
	formatUnits,
	enrolChallenge as pageEnrolChallenge,
	enrolMac as pageEnrolMac,
	parseIntent as pageParse,
} from "@/deploy/confirm/canonical.js";
import { ASSETS } from "@/lib/wallet/core/assets";
import { intentChallenge, parseIntent } from "@/lib/wallet/core/intent";
import { NETWORKS, WALLET_NETWORKS } from "@/lib/wallet/core/networks";
import { enrolChallenge, enrolMac } from "@/signer/webauthn";
import vectors from "./fixtures/wallet-intent-vectors.json";

// Bestätigungsseite (deploy/confirm): liest den kanonischen Text genau wie
// Signer und Kern, rechnet dieselbe Challenge und denselben MAC, kennt
// dieselben Stellen und Verträge — und ist statisch ohne Inline-Skript.

const DIR = resolve(import.meta.dirname, "..", "deploy", "confirm");
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

const throws = (fn: () => unknown) => {
	try {
		fn();
		return false;
	} catch {
		return true;
	}
};

describe("kanonischer Text", () => {
	it("Testvektoren: gleiche Felder und Challenge wie der Kern", async () => {
		for (const v of vectors) {
			const lib = parseIntent(v.text);
			const page = pageParse(v.text);
			expect(page).toEqual({
				...lib,
				amount: lib.amount === null ? null : String(lib.amount),
				feeCap: lib.feeCap === null ? null : String(lib.feeCap),
			});
			expect(hex(await challengeOf(v.text))).toBe(v.challenge);
			expect(hex(intentChallenge(v.text))).toBe(v.challenge);
		}
	});

	it("verwirft, was der Kern verwirft", () => {
		const base = vectors[0]?.text as string;
		const eth = vectors[1]?.text as string;
		const bad = [
			`${base}|x`,
			base.replace("payout", "Payout"),
			base.replace("|-|BTC|", "|1|BTC|"),
			base.replace("|BTC|", "|ETH|"),
			base.replace("1250000", "01250000"),
			base.replace("1250000", "0"),
			base.replace("tb1qw508", "TB1QW508"),
			base.replace("tb1qw508", "bc1qw508"),
			base.replace(" ", ""),
			`${base} `,
			base.replace("|5000|", "|5000\n|"),
			eth.replace("11155111", "1"),
			eth.replace("|USDC|", "|USDT|"),
			eth.replace("0x00000000000000000000000000000000000000AA", "0x00AA"),
			base.replace("klick-wallet/v1", "klick-wallet/v2"),
		];
		for (const t of bad) {
			const lib = throws(() => parseIntent(t));
			const page = throws(() => pageParse(t));
			if (t !== base) expect({ t, page }).toEqual({ t, page: true });
			expect({ t, lib }).toEqual({ t, lib: page });
		}
	});

	it("Stellen und Verträge wie lib/wallet/core/assets.ts, Ketten-IDs wie networks.ts", () => {
		for (const n of WALLET_NETWORKS) {
			const fromCore = Object.fromEntries(
				ASSETS[n].map((a) => [
					a.code,
					{ decimals: a.decimals, contract: a.contract ?? null },
				]),
			);
			expect(CONFIRM_ASSETS[n]).toEqual(fromCore);
			expect(CONFIRM_NETWORKS[n].chainId).toBe(NETWORKS[n].chainId ?? null);
			expect(CONFIRM_NETWORKS[n].live).toBe(NETWORKS[n].live);
		}
	});

	it("Beträge exakt in deutscher Schreibweise", () => {
		expect(formatUnits("1250000", 8)).toBe("0,0125");
		expect(formatUnits("25000000", 6)).toBe("25");
		expect(formatUnits("1234567891230000000000", 18)).toBe("1.234,56789123");
		expect(formatUnits("0", 8)).toBe("0");
		expect(formatUnits("100000000000", 8)).toBe("1.000");
		expect(() => formatUnits("1.5", 8)).toThrow();
	});
});

describe("Einrichtung", () => {
	it("Challenge und MAC wie im Signer", async () => {
		const secret = "ab".repeat(32);
		const id = "cd".repeat(16);
		expect(hex(await pageEnrolChallenge(secret, id))).toBe(
			hex(enrolChallenge(secret, id)),
		);
		const p = {
			enrolId: id,
			credId: "Y3JlZA",
			clientDataJSON: new Uint8Array([1, 2, 3]),
			authenticatorData: new Uint8Array([4, 5]),
			spki: new Uint8Array([6]),
		};
		expect(hex(await pageEnrolMac(secret, p))).toBe(hex(enrolMac(secret, p)));
	});
});

describe("statisch und ohne Inline-Code", () => {
	const files = readdirSync(DIR);
	const html = files.filter((f) => f.endsWith(".html"));
	const js = files.filter((f) => f.endsWith(".js"));

	it("HTML: nur Module von derselben Herkunft, kein Inline-Skript/-Stil/-Handler", () => {
		for (const f of html) {
			const text = readFileSync(join(DIR, f), "utf8");
			const scripts = [
				...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g),
			];
			expect(scripts.length).toBe(1);
			for (const [, attrs, body] of scripts) {
				expect(attrs).toMatch(/type="module" src="\/[a-z]+\.js"/);
				expect(body?.trim()).toBe("");
			}
			expect(text).not.toMatch(/\sstyle=/);
			expect(text).not.toMatch(/\son[a-z]+=/i);
			expect(text).not.toMatch(/<style/);
			// einzige fremde Herkunft: die API im <meta>
			const urls = [...text.matchAll(/https?:\/\/[^"'\s<]+/g)].map((m) => m[0]);
			expect(urls).toEqual(["https://raza.work"]);
		}
	});

	it("Skripte: kein innerHTML, eval, Function, document.write", () => {
		for (const f of js) {
			const text = readFileSync(join(DIR, f), "utf8");
			expect(text).not.toMatch(
				/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|setTimeout\(\s*["'`]/,
			);
			for (const m of text.matchAll(/from\s+"([^"]+)"/g))
				expect(m[1]).toMatch(/^\.\/[a-z]+\.js$/);
		}
	});
});
