import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addr, Transaction as EthTx } from "micro-eth-signer";
import { describe, expect, it } from "vitest";
import { deriveAddress, parseAccountKey } from "@/lib/wallet/core/derive";
import { type Policy, policyHash } from "@/lib/wallet/core/policy";
import {
	checkSpend,
	decodeOutputs,
	fundingRaw,
	outputOf,
} from "@/scripts/devchain/btc-tx";
import { entropyOfMnemonic, KeyRing } from "@/signer/keys";
import { Signer } from "@/signer/service";
import { SignerError } from "@/signer/validate";
import { SoftSecurityKey } from "./helpers/security-key";

// Regeln des Signers über den echten Dienst (Journal im Temp-Ordner, eigene
// Uhr, Software-Schlüssel): Einrichtung, Schlüssel, Zieladressen mit
// Wartezeit und Veto, Solo/Vier-Augen, Pause, Fenster, Grenzen, Einfrieren,
// Richtlinie nur verschärfen, Signieren BTC/ETH mit Gebührenerhöhung und
// Abbruch, Nachspielen nach Neustart.

const RP = "freigabe.raza.work";
const ORIGIN = `https://${RP}`;
const ORG = randomUUID();
const ALICE = randomUUID();
const BOB = randomUUID();
const T0 = 1_800_000_000;
const ETH_DEST = addr.addChecksum("0x00000000000000000000000000000000000000cc");
const BTC_DEST = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";

function code(fn: () => unknown): string {
	try {
		fn();
	} catch (e) {
		if (e instanceof SignerError)
			return e.detail ? `${e.code}:${e.detail}` : e.code;
		throw e;
	}
	return "ok";
}

function setup(opts: { dev?: boolean } = {}) {
	const dir = mkdtempSync(join(tmpdir(), "klick-signer-"));
	const kek = randomBytes(32);
	const clock = { t: T0 };
	const open = () =>
		Signer.open({ dir, kek, dev: opts.dev ?? false, now: () => clock.t });
	const s = open();
	const prep = s.seedPrepare({
		networks: ["bitcoin_signet", "ethereum_sepolia"],
	});
	const checks = Object.fromEntries(
		Object.entries(prep.words).map(([n, w]) => {
			const words = (w as string).split(" ");
			return [n, { 1: words[0], 12: words[11], 24: words[23] }];
		}),
	);
	s.initCommit({ token: prep.token, checks, orgId: ORG, rpId: RP });
	return {
		s,
		dir,
		kek,
		clock,
		open,
		words: prep.words as Record<string, string>,
	};
}

function enrol(s: Signer, person: string, key = new SoftSecurityKey()) {
	const { enrolId, url } = s.enrolStart({ person });
	const secret = new URL(url).hash.match(/t=([0-9a-f]{64})/)?.[1] as string;
	s.enrolFinish(key.enrol({ rpId: RP, origin: ORIGIN, enrolId, secret }));
	return key;
}

function approve(s: Signer, key: SoftSecurityKey, intentId: string) {
	const g = s.intentGet({ intentId });
	return s.approve({
		intentId,
		...key.assert({
			rpId: RP,
			origin: ORIGIN,
			challenge: Buffer.from(g.challenge, "base64url"),
		}),
	});
}

// Zieladresse freigeben und Wartezeit abwarten
function whitelist(
	env: ReturnType<typeof setup>,
	key: SoftSecurityKey,
	network: "bitcoin_signet" | "ethereum_sepolia",
	destination: string,
) {
	const w = env.s.intentCreate({
		kind: "whitelist",
		network,
		destination,
		initiator: ALICE,
	});
	approve(env.s, key, w.intentId);
	env.clock.t += env.s.state.policy?.whitelistCooldownSec ?? 0;
	return w.intentId;
}

describe("Einrichtung", () => {
	it("drei Wörter je Netz bestätigt; falsches Wort speichert nichts", () => {
		const dir = mkdtempSync(join(tmpdir(), "klick-signer-"));
		const s = Signer.open({ dir, kek: randomBytes(32), dev: false });
		const prep = s.seedPrepare({ networks: ["bitcoin_signet"] });
		const words = (prep.words.bitcoin_signet as string).split(" ");
		expect(words).toHaveLength(24);
		expect(
			code(() =>
				s.initCommit({
					token: prep.token,
					checks: { bitcoin_signet: { 1: words[0], 2: "falsch", 3: words[2] } },
					orgId: ORG,
					rpId: RP,
				}),
			),
		).toBe("word_mismatch:bitcoin_signet:2");
		expect(s.hello().initialized).toBe(false);
		expect(
			code(() =>
				s.initCommit({
					token: prep.token,
					checks: { bitcoin_signet: { 1: words[0], 2: words[1] } },
					orgId: ORG,
					rpId: RP,
				}),
			),
		).toBe("bad_request:checks.bitcoin_signet");
	});

	it("Betrieb: Solo mit 2 Schlüsseln, 30 min Pause, 24 h Wartezeit", () => {
		const { s } = setup();
		expect(s.state.policy).toMatchObject({
			mode: "solo",
			soloMinKeys: 2,
			soloDelaySec: 1800,
			whitelistCooldownSec: 86_400,
			liveFunds: false,
		});
		expect(s.hello()).toMatchObject({
			initialized: true,
			orgId: ORG,
			rpId: RP,
		});
	});

	it("Neustart spielt das Journal nach; falscher KEK startet nicht", () => {
		const env = setup();
		const k = enrol(env.s, ALICE);
		env.s.accountCreate({
			orgId: ORG,
			accountId: randomUUID(),
			network: "bitcoin_signet",
		});
		const head = env.s.head;
		env.s.close();
		const again = env.open();
		expect(again.head).toEqual(head);
		expect(again.state.keys.get(k.id)?.person).toBe(ALICE);
		again.close();
		expect(() =>
			Signer.open({ dir: env.dir, kek: randomBytes(32), dev: false }),
		).toThrow(/keys_decrypt/);
	});
});

describe("Wiederherstellung (CC-KEY-03)", () => {
	it("aus den 24 Wörtern dieselben Kontoschlüssel", () => {
		const { s, words } = setup();
		const a = s.accountCreate({
			orgId: ORG,
			accountId: randomUUID(),
			network: "bitcoin_signet",
		});
		const ring = KeyRing.fromEntropy({
			bitcoin_signet: entropyOfMnemonic(words.bitcoin_signet as string),
		});
		expect(ring.accountXpub("bitcoin_signet", 0)).toBe(a.xpub);
		expect(ring.fingerprint("bitcoin_signet")).toBe(
			s.state.fingerprints.bitcoin_signet,
		);
		expect(() => entropyOfMnemonic("abandon ".repeat(23).trim())).toThrow();
	});
});

describe("Konten", () => {
	it("Konto je Netz mit fortlaufendem Index; xpub passt zu Klicks Ableitung", () => {
		const { s } = setup();
		const id = randomUUID();
		const a = s.accountCreate({
			orgId: ORG,
			accountId: id,
			network: "bitcoin_signet",
		});
		expect(a.index).toBe(0);
		expect(
			s.accountCreate({ orgId: ORG, accountId: id, network: "bitcoin_signet" })
				.xpub,
		).toBe(a.xpub);
		const b = s.accountCreate({
			orgId: ORG,
			accountId: randomUUID(),
			network: "bitcoin_signet",
		});
		expect(b.index).toBe(1);
		const { hd } = parseAccountKey(a.xpub, "bitcoin_signet");
		expect(deriveAddress(hd, "bitcoin_signet", 0, 0)).toMatch(/^tb1q/);
		const e = s.accountCreate({
			orgId: ORG,
			accountId: randomUUID(),
			network: "ethereum_sepolia",
		});
		expect(() => parseAccountKey(e.xpub, "ethereum_sepolia")).not.toThrow();
		expect(
			code(() =>
				s.accountCreate({
					orgId: randomUUID(),
					accountId: randomUUID(),
					network: "bitcoin_signet",
				}),
			),
		).toBe("wrong_org");
	});
});

describe("Schlüssel und Zieladressen", () => {
	it("Einrichtungslink: einmal, nur bis Ablauf, derselbe Schlüssel nie doppelt", () => {
		const { s, clock } = setup();
		const key = new SoftSecurityKey();
		const { enrolId, url } = s.enrolStart({ person: ALICE });
		const secret = new URL(url).hash.match(/t=([0-9a-f]{64})/)?.[1] as string;
		const data = key.enrol({ rpId: RP, origin: ORIGIN, enrolId, secret });
		s.enrolFinish(data);
		expect(code(() => s.enrolFinish(data))).toBe("enrol_done");
		const second = s.enrolStart({ person: BOB });
		const secret2 = new URL(second.url).hash.match(
			/t=([0-9a-f]{64})/,
		)?.[1] as string;
		expect(
			code(() =>
				s.enrolFinish(
					key.enrol({
						rpId: RP,
						origin: ORIGIN,
						enrolId: second.enrolId,
						secret: secret2,
					}),
				),
			),
		).toBe("key_exists");
		const late = s.enrolStart({ person: BOB });
		clock.t += 3601;
		expect(code(() => s.enrolFinish({ ...data, enrolId: late.enrolId }))).toBe(
			"enrol_expired",
		);
		expect(s.enrolInfo({ enrolId: second.enrolId }).exclude).toContain(key.id);
	});

	it("synchronisierter Passkey wird abgelehnt", () => {
		const { s } = setup();
		expect(code(() => enrol(s, ALICE, new SoftSecurityKey({ be: true })))).toBe(
			"webauthn:backup",
		);
	});

	it("Zieladresse: aktiv erst nach 24 h, Veto jederzeit", () => {
		const env = setup();
		const k1 = enrol(env.s, ALICE);
		enrol(env.s, ALICE);
		const account = randomUUID();
		env.s.accountCreate({
			orgId: ORG,
			accountId: account,
			network: "ethereum_sepolia",
		});
		const w = env.s.intentCreate({
			kind: "whitelist",
			network: "ethereum_sepolia",
			destination: ETH_DEST,
			initiator: ALICE,
		});
		const view = approve(env.s, k1, w.intentId);
		expect(view.activeFrom).toBe(T0 + 86_400);
		const payout = {
			kind: "payout",
			accountId: account,
			asset: "ETH",
			amount: "1000",
			destination: ETH_DEST,
			feeCap: "100000000000000",
			initiator: ALICE,
		};
		expect(code(() => env.s.intentCreate(payout))).toBe("destination_inactive");
		env.clock.t += 86_400;
		expect(code(() => env.s.intentCreate(payout))).toBe("ok");
		env.s.whitelistVeto({ intentId: w.intentId });
		expect(code(() => env.s.intentCreate(payout))).toBe("destination_inactive");
		// dieselbe Adresse kann danach neu vorgeschlagen werden
		expect(
			code(() =>
				env.s.intentCreate({
					kind: "whitelist",
					network: "ethereum_sepolia",
					destination: ETH_DEST,
					initiator: ALICE,
				}),
			),
		).toBe("ok");
	});
});

describe("Freigabe", () => {
	function payoutEnv(policy?: Partial<Policy>) {
		const env = setup();
		const a1 = enrol(env.s, ALICE);
		const a2 = enrol(env.s, ALICE);
		const b1 = enrol(env.s, BOB);
		enrol(env.s, BOB);
		const account = randomUUID();
		env.s.accountCreate({
			orgId: ORG,
			accountId: account,
			network: "ethereum_sepolia",
		});
		whitelist(env, a1, "ethereum_sepolia", ETH_DEST);
		if (policy) {
			const cur = env.s.state.policy as Policy;
			env.s.policySet({
				policy: {
					...cur,
					...policy,
					version: cur.version + 1,
					prev: policyHash(cur),
				},
			});
		}
		const create = (amount = "1000") =>
			env.s.intentCreate({
				kind: "payout",
				accountId: account,
				asset: "ETH",
				amount,
				destination: ETH_DEST,
				feeCap: "1000000000000000",
				initiator: ALICE,
			}).intentId;
		const plan = (nonce = "0", maxFee = "2000000000") => ({
			nonce,
			gasLimit: "21000",
			maxFeePerGas: maxFee,
			maxPriorityFeePerGas: "1000000000",
		});
		return { ...env, a1, a2, b1, account, create, plan };
	}

	it("Solo: Pause vor dem Signieren, dann Fenster", () => {
		const env = payoutEnv();
		const id = env.create();
		expect(
			code(() => env.s.sign({ intentId: id, mode: "first", plan: env.plan() })),
		).toBe("not_approved");
		const v = approve(env.s, env.a1, id);
		expect(v.signableAt).toBe(env.clock.t + 1800);
		expect(
			code(() => env.s.sign({ intentId: id, mode: "first", plan: env.plan() })),
		).toBe("too_early");
		env.clock.t += 1800 + 3601;
		expect(
			code(() => env.s.sign({ intentId: id, mode: "first", plan: env.plan() })),
		).toBe("window_closed");
	});

	it("Solo braucht zwei aktive Schlüssel der Person", () => {
		const env = payoutEnv();
		env.s.keyRevoke({ credId: env.a2.id });
		const id = env.create();
		const v = approve(env.s, env.a1, id);
		expect(v.approvedAt).toBeNull();
	});

	it("Vier-Augen: zwei verschiedene Personen, dieselbe Person zweimal zählt nicht", () => {
		const env = payoutEnv({ mode: "four_eyes" });
		const id = env.create();
		expect(approve(env.s, env.a1, id).approvedAt).toBeNull();
		expect(code(() => approve(env.s, env.a1, id))).toBe("already_approved");
		expect(approve(env.s, env.a2, id).approvedAt).toBeNull();
		const v = approve(env.s, env.b1, id);
		expect(v.approvedAt).toBe(env.clock.t);
		expect(v.signableAt).toBe(env.clock.t);
		expect(
			code(() => env.s.sign({ intentId: id, mode: "first", plan: env.plan() })),
		).toBe("ok");
	});

	it("gesperrter Schlüssel: Freigabe zählt beim Signieren nicht mehr", () => {
		const env = payoutEnv({ mode: "four_eyes" });
		const id = env.create();
		approve(env.s, env.a1, id);
		approve(env.s, env.b1, id);
		env.s.keyRevoke({ credId: env.b1.id });
		expect(
			code(() => env.s.sign({ intentId: id, mode: "first", plan: env.plan() })),
		).toBe("not_approved");
		expect(code(() => approve(env.s, env.b1, env.create()))).toBe(
			"key_unknown",
		);
	});

	it("abgelaufen, abgebrochen", () => {
		const env = payoutEnv();
		const id = env.create();
		env.clock.t += 4 * 3600 + 1;
		expect(code(() => approve(env.s, env.a1, id))).toBe("intent_expired");
		const other = env.create();
		env.s.intentCancel({ intentId: other });
		expect(code(() => approve(env.s, env.a1, other))).toBe("intent_closed");
	});

	it("Grenzen je Auszahlung und je 24 h", () => {
		const env = payoutEnv({ soloDelaySec: 600 });
		expect(code(() => env.create("50000000000000001"))).toBe("per_payout");
		const ids = [0, 1, 2, 3, 4].map(() => env.create("50000000000000000"));
		for (const id of ids) approve(env.s, env.a1, id);
		env.clock.t += 600;
		ids.slice(0, 4).forEach((id, n) => {
			expect(
				code(() =>
					env.s.sign({
						intentId: id,
						mode: "first",
						plan: env.plan(String(n)),
					}),
				),
			).toBe("ok");
		});
		expect(
			code(() =>
				env.s.sign({ intentId: ids[4], mode: "first", plan: env.plan("4") }),
			),
		).toBe("per_day");
	});

	it("Einfrieren stoppt alles; nur admin taut auf", () => {
		const env = payoutEnv({ soloDelaySec: 600 });
		const id = env.create();
		approve(env.s, env.a1, id);
		env.clock.t += 600;
		env.s.freeze({ reason: "Test: unbekannte Ausgabe" }, "app");
		expect(
			code(() => env.s.sign({ intentId: id, mode: "first", plan: env.plan() })),
		).toBe("frozen");
		expect(code(() => env.create())).toBe("frozen");
		env.s.unfreeze();
		expect(
			code(() => env.s.sign({ intentId: id, mode: "first", plan: env.plan() })),
		).toBe("ok");
	});

	it("Richtlinie: App darf nur verschärfen, Version und Vorgänger stimmen", () => {
		const env = payoutEnv();
		const cur = env.s.state.policy as Policy;
		const next = (p: Partial<Policy>) => ({
			...cur,
			...p,
			version: cur.version + 1,
			prev: policyHash(cur),
		});
		expect(
			code(() =>
				env.s.policyTighten({
					policy: next({ feeCaps: { btcSatPerVb: 80, ethMaxFeeGwei: 50 } }),
				}),
			),
		).toBe("not_tightening");
		expect(
			code(() =>
				env.s.policyTighten({ policy: { ...next({}), prev: "0".repeat(64) } }),
			),
		).toBe("policy_prev");
		expect(
			code(() => env.s.policyTighten({ policy: next({ soloMinKeys: 1 }) })),
		).toBe("policy_invalid:solo_keys");
		expect(
			code(() => env.s.policyTighten({ policy: next({ soloDelaySec: 3600 }) })),
		).toBe("ok");
	});
});

describe("Signieren Ethereum", () => {
	function ready() {
		const env = setup({ dev: true });
		const key = enrol(env.s, ALICE);
		const account = randomUUID();
		const acc = env.s.accountCreate({
			orgId: ORG,
			accountId: account,
			network: "ethereum_sepolia",
		});
		whitelist(env, key, "ethereum_sepolia", ETH_DEST);
		const pay = (asset = "ETH", amount = "1000") => {
			const id = env.s.intentCreate({
				kind: "payout",
				accountId: account,
				asset,
				amount,
				destination: ETH_DEST,
				feeCap: "1000000000000000",
				initiator: ALICE,
			}).intentId;
			approve(env.s, key, id);
			return id;
		};
		const { hd } = parseAccountKey(acc.xpub, "ethereum_sepolia");
		return {
			...env,
			key,
			account,
			pay,
			from: deriveAddress(hd, "ethereum_sepolia", 0, 0),
		};
	}
	const plan = (
		nonce: string,
		maxFee = "2000000000",
		prio = "1000000000",
		gas = "21000",
	) => ({
		nonce,
		gasLimit: gas,
		maxFeePerGas: maxFee,
		maxPriorityFeePerGas: prio,
	});

	it("signiert genau die Absicht; erneut „first“ liefert dieselbe Transaktion", () => {
		const env = ready();
		const id = env.pay();
		const r = env.s.sign({ intentId: id, mode: "first", plan: plan("0") });
		const tx = EthTx.fromHex(r.raw);
		expect(addr.addChecksum(tx.sender)).toBe(env.from);
		expect(addr.addChecksum(tx.raw.to)).toBe(ETH_DEST);
		expect(tx.raw.value).toBe(1000n);
		expect(tx.raw.chainId).toBe(11155111n);
		expect(
			env.s.sign({ intentId: id, mode: "first", plan: plan("0", "9") }).raw,
		).toBe(r.raw);
	});

	it("Nonces fortlaufend; Erhöhung +10 % mit derselben Nonce; Abbruch an sich selbst", () => {
		const env = ready();
		const a = env.pay();
		env.s.sign({ intentId: a, mode: "first", plan: plan("5") });
		const b = env.pay();
		expect(
			code(() => env.s.sign({ intentId: b, mode: "first", plan: plan("5") })),
		).toBe("nonce:expected 6");
		expect(
			code(() => env.s.sign({ intentId: b, mode: "first", plan: plan("6") })),
		).toBe("ok");
		expect(
			code(() =>
				env.s.sign({
					intentId: a,
					mode: "bump",
					plan: plan("6", "3000000000", "2000000000"),
				}),
			),
		).toBe("nonce_differs");
		expect(
			code(() =>
				env.s.sign({
					intentId: a,
					mode: "bump",
					plan: plan("5", "2100000000", "1050000000"),
				}),
			),
		).toBe("fee_not_higher");
		const bump = env.s.sign({
			intentId: a,
			mode: "bump",
			plan: plan("5", "2200000000", "1100000000"),
		});
		expect(EthTx.fromHex(bump.raw).raw.nonce).toBe(5n);
		const cancel = env.s.sign({
			intentId: a,
			mode: "cancel",
			plan: plan("5", "2420000000", "1210000000"),
		});
		const c = EthTx.fromHex(cancel.raw);
		expect(addr.addChecksum(c.raw.to)).toBe(env.from);
		expect(c.raw.nonce).toBe(5n);
		expect(
			code(() =>
				env.s.sign({
					intentId: a,
					mode: "bump",
					plan: plan("5", "9000000000", "5000000000"),
				}),
			),
		).toBe("cancelled");
	});

	it("Gebühren-Deckel der Absicht und der Richtlinie", () => {
		const env = ready();
		const id = env.pay();
		expect(
			code(() =>
				env.s.sign({
					intentId: id,
					mode: "first",
					plan: plan("0", "60000000000"),
				}),
			),
		).toBe("spend:fee_rate");
		expect(
			code(() =>
				env.s.sign({
					intentId: id,
					mode: "first",
					plan: plan("0", "49000000000", "1", "100000"),
				}),
			),
		).toBe("spend:fee_cap");
	});

	it("nach Neustart: Nonce-Stand und Signaturen aus dem Journal", () => {
		const env = ready();
		const id = env.pay();
		env.s.sign({ intentId: id, mode: "first", plan: plan("0") });
		env.s.close();
		const again = env.open();
		expect(again.state.nonces.get(env.account)).toBe(0n);
		expect(again.state.intents.get(id)?.signatures).toHaveLength(1);
	});
});

describe("Signieren Bitcoin", () => {
	function ready() {
		const env = setup({ dev: true });
		const key = enrol(env.s, ALICE);
		const account = randomUUID();
		const acc = env.s.accountCreate({
			orgId: ORG,
			accountId: account,
			network: "bitcoin_signet",
		});
		const { hd } = parseAccountKey(acc.xpub, "bitcoin_signet");
		whitelist(env, key, "bitcoin_signet", BTC_DEST);
		const coin = (sats: bigint, i = 0) => {
			const f = fundingRaw(
				deriveAddress(hd, "bitcoin_signet", 0, i),
				sats,
				randomBytes(8),
			);
			return { txid: f.txid, vout: 0, prevTxHex: f.raw, branch: 0, index: i };
		};
		const pay = (amount = "30000") => {
			const id = env.s.intentCreate({
				kind: "payout",
				accountId: account,
				asset: "BTC",
				amount,
				destination: BTC_DEST,
				feeCap: "20000",
				initiator: ALICE,
			}).intentId;
			approve(env.s, key, id);
			return id;
		};
		return { ...env, hd, account, coin, pay };
	}

	it("baut aus dem Ausgabeplan: Ziel und Betrag aus der Absicht, Wechselgeld vom Signer", () => {
		const env = ready();
		const c = env.coin(100_000n);
		const id = env.pay();
		const r = env.s.sign({
			intentId: id,
			mode: "first",
			plan: { inputs: [c], fee: "1000" },
		});
		const outs = decodeOutputs(r.raw);
		expect(outs[0]).toMatchObject({ address: BTC_DEST, sats: 30_000n });
		expect(outs[1]?.address).toBe(
			deriveAddress(env.hd, "bitcoin_signet", 1, 0),
		);
		expect(r.changeIndex).toBe(0);
		const check = checkSpend(r.raw, (txid, vout) =>
			txid === c.txid ? outputOf(c.prevTxHex, vout) : null,
		);
		expect(check.ok).toBe(true);
		// nächste Auszahlung bekommt den nächsten Wechselgeld-Index
		const id2 = env.pay();
		const r2 = env.s.sign({
			intentId: id2,
			mode: "first",
			plan: { inputs: [env.coin(80_000n, 1)], fee: "1000" },
		});
		expect(r2.changeIndex).toBe(1);
	});

	it("reservierte Eingänge, Erhöhung mit denselben Eingängen, Abbruch an sich selbst", () => {
		const env = ready();
		const c = env.coin(100_000n);
		const id = env.pay();
		env.s.sign({
			intentId: id,
			mode: "first",
			plan: { inputs: [c], fee: "1000" },
		});
		const other = env.pay();
		expect(
			code(() =>
				env.s.sign({
					intentId: other,
					mode: "first",
					plan: { inputs: [c], fee: "1000" },
				}),
			),
		).toBe("input_reserved");
		expect(
			code(() =>
				env.s.sign({
					intentId: id,
					mode: "bump",
					plan: { inputs: [env.coin(50_000n, 2)], fee: "2000" },
				}),
			),
		).toBe("inputs_differ");
		expect(
			code(() =>
				env.s.sign({
					intentId: id,
					mode: "bump",
					plan: { inputs: [c], fee: "900" },
				}),
			),
		).toBe("fee_not_higher");
		const bump = env.s.sign({
			intentId: id,
			mode: "bump",
			plan: { inputs: [c], fee: "2000" },
		});
		expect(decodeOutputs(bump.raw)[0]?.sats).toBe(30_000n);
		const cancel = env.s.sign({
			intentId: id,
			mode: "cancel",
			plan: { inputs: [c], fee: "3000" },
		});
		const outs = decodeOutputs(cancel.raw);
		expect(outs).toHaveLength(1);
		expect(outs[0]).toMatchObject({
			address: deriveAddress(env.hd, "bitcoin_signet", 1, 0),
			sats: 97_000n,
		});
		// Gebühr über dem Deckel der Absicht
		expect(
			code(() =>
				env.s.sign({
					intentId: id,
					mode: "cancel",
					plan: { inputs: [c], fee: "25000" },
				}),
			),
		).toBe("spend:fee_cap");
	});

	it("fremder Eingang wird nie signiert", () => {
		const env = ready();
		const foreign = fundingRaw(BTC_DEST, 100_000n, randomBytes(8));
		const id = env.pay();
		expect(
			code(() =>
				env.s.sign({
					intentId: id,
					mode: "first",
					plan: {
						inputs: [
							{
								txid: foreign.txid,
								vout: 0,
								prevTxHex: foreign.raw,
								branch: 0,
								index: 0,
							},
						],
						fee: "1000",
					},
				}),
			),
		).toBe("spend:foreign_input");
	});
});
