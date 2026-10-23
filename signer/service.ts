import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hex } from "@scure/base";
import {
	NETWORK as BTC_MAIN,
	p2wpkh,
	TEST_NETWORK,
	Transaction,
} from "@scure/btc-signer";
import { addr } from "micro-eth-signer";
import type { AssetCode } from "../lib/wallet/core/assets";
import { buildBtcSpend, SpendError } from "../lib/wallet/core/btc-spend";
import { estimateVsize } from "../lib/wallet/core/coin-select";
import { buildEthSpend } from "../lib/wallet/core/eth-spend";
import {
	encodeIntent,
	type Intent,
	IntentError,
	intentChallenge,
} from "../lib/wallet/core/intent";
import { NETWORKS, type WalletNetwork } from "../lib/wallet/core/networks";
import {
	isTightening,
	type Policy,
	policyHash,
	policyIssues,
	spendAllowed,
} from "../lib/wallet/core/policy";
import type { EventOf, SignerEvent, SignMode } from "./events";
import { SIGN_MODES } from "./events";
import { Journal, parseJournal } from "./journal";
import {
	fingerprintOf,
	KeyRing,
	mnemonicOf,
	newEntropy,
	openSeed,
	readSeedFile,
	type SeedFile,
	sealSeed,
	writeSeedFile,
} from "./keys";
import {
	activeKeysByPerson,
	apply,
	type IntentRecord,
	quorum,
	replay,
	type SignerState,
} from "./state";
import {
	type Args,
	asset as assetArg,
	b64uStr,
	bad,
	hex128,
	hexData,
	int,
	network as networkArg,
	obj,
	originOf,
	posUint,
	rpIdOf,
	SignerError,
	shortText,
	txid as txidArg,
	uint,
	uuid,
} from "./validate";
import {
	b64u,
	verifyAssertion,
	verifyEnrolment,
	WebAuthnFailure,
} from "./webauthn";

// Der Signer (Plan Wallet, Phase 2): einzige Vertrauensinstanz für
// Hot-Auszahlungen. Er zählt Freigaben über sein eigenes Schlüsselregister,
// baut und signiert die Transaktion selbst (Ziel und Betrag nur aus der
// freigegebenen Absicht) und schreibt vor jeder Antwort ins Journal.
// Die App kann bremsen (einfrieren, Veto, abbrechen, verschärfen), aber nie
// lockern — das geht nur über admin.sock (root am Terminal).

export const PAYOUT_TTL = 4 * 3600;
export const WHITELIST_TTL = 24 * 3600;
const MAX_OPEN = 50;
const MAX_PER_DAY = 200;
const MAX_BTC_INPUTS = 50;
const MAX_ETH_GAS = 100_000n;
const GWEI = 1_000_000_000n;

export type SignerConfig = {
	dir: string;
	kek: Buffer;
	dev: boolean;
	now?: () => number;
	// Hash des laufenden Bundles (für die Anzeige in Klick)
	bundleHash?: string | null;
	// Pfad des nächsten KEK für `rekey`
	kekNextPath?: string | null;
};

// Vorgabe beim Einrichten: Solo, kleine Testnetz-Grenzen (Basiseinheiten)
export function defaultPolicy(networks: WalletNetwork[], dev: boolean): Policy {
	return {
		version: 1,
		prev: null,
		mode: "solo",
		soloMinKeys: dev ? 1 : 2,
		soloDelaySec: dev ? 0 : 30 * 60,
		whitelistCooldownSec: dev ? 0 : 24 * 3600,
		approvalWindowSec: 3600,
		limits: {
			BTC: { perPayout: "100000", perDay: "500000" },
			ETH: { perPayout: "50000000000000000", perDay: "200000000000000000" },
			USDC: { perPayout: "100000000", perDay: "500000000" },
			EURC: { perPayout: "100000000", perDay: "500000000" },
		},
		feeCaps: { btcSatPerVb: 50, ethMaxFeeGwei: 50 },
		networks,
		liveFunds: false,
	};
}

type Prepared = {
	token: string;
	entropy: Partial<Record<WalletNetwork, Uint8Array>>;
	expiresAt: number;
};

export type SignResult = {
	intentId: string;
	mode: SignMode;
	raw: string;
	txid: string;
	fee: string;
	outpoints?: string[];
	changeIndex?: number | null;
	nonce?: string;
};

export class Signer {
	state: SignerState;
	private keys: KeyRing;
	private prepared: Prepared | null = null;
	readonly now: () => number;

	private constructor(
		readonly cfg: SignerConfig,
		private journal: Journal,
		events: SignerEvent[],
		private seedFile: SeedFile,
	) {
		this.now = cfg.now ?? (() => Math.floor(Date.now() / 1000));
		this.state = replay(events);
		this.keys = KeyRing.load(seedFile, cfg.kek);
		// Seeds und Journal müssen zusammenpassen
		for (const [n, f] of Object.entries(this.state.fingerprints))
			if (this.keys.fingerprint(n as WalletNetwork) !== f)
				throw new SignerError("seed_mismatch", n);
		this.keys.selfTest();
	}

	static open(cfg: SignerConfig): Signer {
		const { journal, entries } = Journal.open(join(cfg.dir, "journal.log"));
		const seeds = readSeedFile(join(cfg.dir, "seeds.json"));
		return new Signer(
			cfg,
			journal,
			entries.map((e) => e.event),
			seeds,
		);
	}

	close() {
		this.journal.close();
	}

	get head() {
		return { seq: this.journal.seq, head: this.journal.head };
	}

	private record<T extends SignerEvent["type"]>(
		draft: Omit<EventOf<T>, "seq" | "at"> & { type: T },
	) {
		const entry = this.journal.append({
			...draft,
			at: this.now(),
		} as Parameters<Journal["append"]>[0]);
		apply(this.state, entry.event);
		return entry;
	}

	private requireInit() {
		const init = this.state.init;
		const policy = this.state.policy;
		if (!init || !policy) throw new SignerError("not_initialized");
		return { init, policy };
	}

	private requireNotFrozen() {
		if (this.state.frozen) throw new SignerError("frozen");
	}

	// ── Übersicht ─────────────────────────────────────────────────────────

	hello() {
		const policy = this.state.policy;
		return {
			v: 1,
			initialized: Boolean(this.state.init),
			orgId: this.state.init?.orgId ?? null,
			rpId: this.state.init?.rpId ?? null,
			origin: this.state.init?.origin ?? null,
			dev: this.cfg.dev,
			networks: this.keys.networks(),
			frozen: this.state.frozen,
			policyHash: policy ? policyHash(policy) : null,
			bundleHash: this.cfg.bundleHash ?? null,
			...this.head,
		};
	}

	status() {
		const now = this.now();
		return {
			...this.hello(),
			policy: this.state.policy,
			keys: [...this.state.keys.values()].map((k) => ({
				credId: k.credId,
				person: k.person,
				active: k.active,
				aaguid: k.aaguid,
				enrolledAt: k.enrolledAt,
			})),
			accounts: [...this.state.accounts.values()],
			openIntents: [...this.state.intents.values()]
				.filter((r) => this.isOpen(r, now))
				.map((r) => this.intentView(r)),
		};
	}

	private isOpen(r: IntentRecord, now: number) {
		if (r.cancelled || r.vetoed) return false;
		if (r.intent.kind === "whitelist")
			return r.approvedAt === null && now <= r.intent.expiresAt;
		if (r.signatures.length > 0) return false;
		return r.approvedAt === null
			? now <= r.intent.expiresAt
			: now <= (r.signUntil ?? 0);
	}

	private intentView(r: IntentRecord) {
		const last = r.signatures[r.signatures.length - 1];
		return {
			intentId: r.intentId,
			kind: r.intent.kind,
			text: r.text,
			createdAt: r.createdAt,
			expiresAt: r.intent.expiresAt,
			approvals: r.approvals.map((a) => ({ person: a.person, at: a.at })),
			approvedAt: r.approvedAt,
			signableAt: r.signableAt,
			signUntil: r.signUntil,
			activeFrom: r.activeFrom,
			cancelled: r.cancelled,
			vetoed: r.vetoed,
			signed: last
				? { mode: last.mode, txid: last.txid, fee: last.fee, at: last.at }
				: null,
		};
	}

	// ── Konten ────────────────────────────────────────────────────────────

	accountCreate(raw: unknown) {
		const a = obj(raw);
		const { init } = this.requireInit();
		if (uuid(a.orgId, "orgId") !== init.orgId)
			throw new SignerError("wrong_org");
		const accountId = uuid(a.accountId, "accountId");
		const net = networkArg(a.network);
		if (!this.keys.fingerprint(net)) throw new SignerError("network_unknown");
		const existing = this.state.accounts.get(accountId);
		if (existing) {
			if (existing.network !== net) throw new SignerError("account_network");
			return { ...existing, fingerprint: this.keys.fingerprint(net) };
		}
		const index = this.state.nextIndex[net] ?? 0;
		const xpub = this.keys.accountXpub(net, index);
		this.record({ type: "account", accountId, network: net, index, xpub });
		return {
			accountId,
			network: net,
			index,
			xpub,
			fingerprint: this.keys.fingerprint(net),
		};
	}

	// ── Absichten ─────────────────────────────────────────────────────────

	// aktive Zieladresse (freigegeben, Wartezeit vorbei, kein Veto)
	activeDestination(net: WalletNetwork, destination: string, now: number) {
		for (const r of this.state.intents.values())
			if (
				r.intent.kind === "whitelist" &&
				r.intent.network === net &&
				r.intent.destination === destination &&
				!r.vetoed &&
				!r.cancelled &&
				r.activeFrom !== null &&
				r.activeFrom <= now
			)
				return r;
		return null;
	}

	private feeCeiling(net: WalletNetwork, policy: Policy): bigint {
		if (NETWORKS[net].chain === "bitcoin")
			return (
				BigInt(policy.feeCaps.btcSatPerVb) *
				BigInt(estimateVsize(MAX_BTC_INPUTS, 2))
			);
		return BigInt(policy.feeCaps.ethMaxFeeGwei) * GWEI * MAX_ETH_GAS;
	}

	intentCreate(raw: unknown) {
		const a = obj(raw);
		const { init, policy } = this.requireInit();
		this.requireNotFrozen();
		const now = this.now();
		const all = [...this.state.intents.values()];
		if (all.filter((r) => this.isOpen(r, now)).length >= MAX_OPEN)
			throw new SignerError("too_many_open");
		if (all.filter((r) => r.createdAt > now - 86_400).length >= MAX_PER_DAY)
			throw new SignerError("too_many_today");
		const initiator = uuid(a.initiator, "initiator");
		const intentId = randomBytes(16).toString("hex");
		const nonce = randomBytes(16).toString("hex");
		let intent: Intent;
		if (a.kind === "whitelist") {
			const net = networkArg(a.network);
			this.checkNetwork(net, policy);
			const destination =
				typeof a.destination === "string" ? a.destination : "";
			const taken = all.some(
				(r) =>
					r.intent.kind === "whitelist" &&
					r.intent.network === net &&
					r.intent.destination === destination &&
					!r.vetoed &&
					!r.cancelled &&
					(r.approvedAt !== null || now <= r.intent.expiresAt),
			);
			if (taken) throw new SignerError("destination_exists");
			intent = {
				kind: "whitelist",
				orgId: init.orgId,
				accountId: null,
				network: net,
				chainId: NETWORKS[net].chainId ?? null,
				asset: null,
				amount: null,
				destination,
				destinationActiveSince: null,
				feeCap: null,
				initiator,
				intentId,
				nonce,
				expiresAt: now + WHITELIST_TTL,
			};
		} else if (a.kind === "payout") {
			const accountId = uuid(a.accountId, "accountId");
			const account = this.state.accounts.get(accountId);
			if (!account) throw new SignerError("account_unknown");
			const net = account.network;
			this.checkNetwork(net, policy);
			const code = assetArg(net, a.asset);
			const amount = posUint(a.amount, "amount");
			const feeCap = uint(a.feeCap, "feeCap");
			if (feeCap > this.feeCeiling(net, policy))
				throw new SignerError("fee_cap");
			const allowed = spendAllowed(policy, code, amount, 0n);
			if (allowed !== "ok") throw new SignerError(allowed);
			const destination =
				typeof a.destination === "string" ? a.destination : "";
			const active = this.activeDestination(net, destination, now);
			if (!active) throw new SignerError("destination_inactive");
			intent = {
				kind: "payout",
				orgId: init.orgId,
				accountId,
				network: net,
				chainId: NETWORKS[net].chainId ?? null,
				asset: code,
				amount,
				destination,
				destinationActiveSince: active.activeFrom as number,
				feeCap,
				initiator,
				intentId,
				nonce,
				expiresAt: now + PAYOUT_TTL,
			};
		} else return bad("kind");
		let text: string;
		try {
			text = encodeIntent(intent);
		} catch (e) {
			if (e instanceof IntentError) return bad(e.field);
			throw e;
		}
		this.record({ type: "intent", intentId, text });
		return {
			intentId,
			text,
			challenge: b64u.encode(intentChallenge(text)),
			expiresAt: intent.expiresAt,
		};
	}

	private checkNetwork(net: WalletNetwork, policy: Policy) {
		if (!policy.networks.includes(net)) throw new SignerError("network_off");
		if (NETWORKS[net].live) throw new SignerError("live_off");
		if (!this.keys.fingerprint(net)) throw new SignerError("network_unknown");
	}

	private intentOf(raw: unknown) {
		const id = hex128(raw, "intentId");
		const r = this.state.intents.get(id);
		if (!r) throw new SignerError("intent_unknown");
		return r;
	}

	// für die Bestätigungsseite (über das Relay in Klick)
	intentGet(raw: unknown) {
		const a = obj(raw);
		const { init } = this.requireInit();
		const r = this.intentOf(a.intentId);
		return {
			...this.intentView(r),
			rpId: init.rpId,
			challenge: b64u.encode(intentChallenge(r.text)),
			allowCredentials: [...this.state.keys.values()]
				.filter((k) => k.active)
				.map((k) => k.credId),
			frozen: Boolean(this.state.frozen),
		};
	}

	approve(raw: unknown) {
		const a = obj(raw);
		const { init } = this.requireInit();
		this.requireNotFrozen();
		const r = this.intentOf(a.intentId);
		const now = this.now();
		if (r.cancelled || r.vetoed) throw new SignerError("intent_closed");
		if (now > r.intent.expiresAt) throw new SignerError("intent_expired");
		const credId = b64uStr(a.credId, "credId", 1400);
		const key = this.state.keys.get(credId);
		if (!key?.active) throw new SignerError("key_unknown");
		// derselbe Schlüssel nie zweimal; Personen zählt das Quorum ohnehin
		// nur einmal (Vier-Augen braucht zwei verschiedene)
		if (r.approvals.some((x) => x.credId === credId))
			throw new SignerError("already_approved");
		let counter: number;
		try {
			({ counter } = verifyAssertion(
				{
					authenticatorData: b64uStr(a.authenticatorData, "authenticatorData"),
					clientDataJSON: b64uStr(a.clientDataJSON, "clientDataJSON"),
					signature: b64uStr(a.signature, "signature", 200),
				},
				{
					rpId: init.rpId,
					origin: init.origin,
					challenge: intentChallenge(r.text),
					spki: key.spki,
					storedCounter: key.counter,
				},
			));
		} catch (e) {
			if (e instanceof WebAuthnFailure)
				throw new SignerError("webauthn", e.code);
			throw e;
		}
		this.record({
			type: "approval",
			intentId: r.intentId,
			credId,
			person: key.person,
			counter,
		});
		return this.intentView(r);
	}

	intentCancel(raw: unknown, by: "app" | "admin" = "app") {
		const r = this.intentOf(obj(raw).intentId);
		if (r.signatures.length > 0) throw new SignerError("already_signed");
		if (r.cancelled) return this.intentView(r);
		this.record({ type: "cancel", intentId: r.intentId, by });
		return this.intentView(r);
	}

	whitelistVeto(raw: unknown) {
		const r = this.intentOf(obj(raw).intentId);
		if (r.intent.kind !== "whitelist") throw new SignerError("not_whitelist");
		if (!r.vetoed) this.record({ type: "veto", intentId: r.intentId });
		return this.intentView(r);
	}

	// ── Signieren ─────────────────────────────────────────────────────────

	private signedLast24h(code: AssetCode, now: number): bigint {
		let sum = 0n;
		for (const r of this.state.intents.values()) {
			const first = r.signatures.find((s) => s.mode === "first");
			if (first && first.asset === code && first.at > now - 86_400)
				sum += BigInt(first.amount);
		}
		return sum;
	}

	sign(raw: unknown): SignResult {
		const a = obj(raw);
		const { policy } = this.requireInit();
		this.requireNotFrozen();
		const r = this.intentOf(a.intentId);
		const mode = (SIGN_MODES as readonly string[]).includes(String(a.mode))
			? (a.mode as SignMode)
			: bad("mode");
		const i = r.intent;
		if (i.kind !== "payout" || !i.accountId || !i.asset || i.amount === null)
			throw new SignerError("not_payout");
		if (r.cancelled || r.vetoed) throw new SignerError("intent_closed");
		const account = this.state.accounts.get(i.accountId);
		if (!account) throw new SignerError("account_unknown");
		const now = this.now();
		const first = r.signatures.find((s) => s.mode === "first");
		const last = r.signatures[r.signatures.length - 1];
		if (mode === "first") {
			// schon signiert (z. B. Absturz der App nach der Antwort): dieselbe
			// Signatur noch einmal, nie eine zweite Zahlung
			if (last) return this.resultOf(last);
			if (!quorum(this.state, r) || r.signableAt === null)
				throw new SignerError("not_approved");
			if (now < r.signableAt) throw new SignerError("too_early");
			if (now > (r.signUntil ?? 0)) throw new SignerError("window_closed");
			if (!this.activeDestination(i.network, i.destination, now))
				throw new SignerError("destination_inactive");
			this.checkNetwork(i.network, policy);
			const allowed = spendAllowed(
				policy,
				i.asset,
				i.amount,
				this.signedLast24h(i.asset, now),
			);
			if (allowed !== "ok") throw new SignerError(allowed);
		} else {
			if (!first || !last) throw new SignerError("not_signed");
			if (last.mode === "cancel" && mode === "bump")
				throw new SignerError("cancelled");
		}
		const plan = obj(a.plan, "plan");
		const draft =
			NETWORKS[i.network].chain === "bitcoin"
				? this.signBtc(r, account.index, mode, plan, policy, first, last)
				: this.signEth(r, account.index, mode, plan, policy, first, last);
		const entry = this.record({
			type: "signed",
			intentId: r.intentId,
			mode,
			accountId: account.accountId,
			network: i.network,
			asset: i.asset,
			amount: i.amount.toString(),
			...draft,
		});
		return this.resultOf(entry.event as EventOf<"signed">);
	}

	private resultOf(e: EventOf<"signed">): SignResult {
		return {
			intentId: e.intentId,
			mode: e.mode,
			raw: e.raw,
			txid: e.txid,
			fee: e.fee,
			...(e.outpoints ? { outpoints: e.outpoints } : {}),
			...(e.changeIndex !== undefined ? { changeIndex: e.changeIndex } : {}),
			...(e.nonce !== undefined ? { nonce: e.nonce } : {}),
		};
	}

	private signBtc(
		r: IntentRecord,
		accountIndex: number,
		mode: SignMode,
		plan: Args,
		policy: Policy,
		first: EventOf<"signed"> | undefined,
		last: EventOf<"signed"> | undefined,
	) {
		const i = r.intent;
		const net = i.network;
		if (!Array.isArray(plan.inputs) || plan.inputs.length === 0)
			return bad("inputs");
		if (plan.inputs.length > MAX_BTC_INPUTS) return bad("inputs");
		const inputs = plan.inputs.map((x, n) => {
			const o = obj(x, `inputs.${n}`);
			return {
				txid: txidArg(o.txid, `inputs.${n}.txid`),
				vout: int(o.vout, `inputs.${n}.vout`, 0, 100_000),
				prevTxHex: hexData(o.prevTxHex, `inputs.${n}.prevTxHex`),
				branch: int(o.branch, `inputs.${n}.branch`, 0, 1) as 0 | 1,
				index: int(o.index, `inputs.${n}.index`, 0, 2 ** 31 - 1),
			};
		});
		const fee = uint(plan.fee, "fee");
		const outpoints = inputs.map((x) => `${x.txid}:${x.vout}`);
		const keyAt = this.keys.btcKeys(net, accountIndex);
		const own = (branch: 0 | 1, index: number) =>
			p2wpkh(
				keyAt(branch, index).pub,
				NETWORKS[net].live ? BTC_MAIN : TEST_NETWORK,
			).address as string;
		let changeIndex: number | null;
		// Abbruch: Index der eigenen Adresse, an die alles zurückgeht
		let cancelIndex: number | null = null;
		let destination = i.destination;
		let amount = i.amount as bigint;
		if (mode === "first") {
			for (const o of outpoints) {
				const holder = this.state.reserved.get(o);
				if (holder && holder !== r.intentId)
					throw new SignerError("input_reserved");
			}
			changeIndex = this.state.nextChange.get(i.accountId as string) ?? 0;
		} else {
			// gleiche Eingänge wie die erste Signatur → höchstens eine bestätigt
			const before = new Set(first?.outpoints ?? []);
			if (
				outpoints.length !== before.size ||
				outpoints.some((o) => !before.has(o))
			)
				throw new SignerError("inputs_differ");
			if (fee <= BigInt(last?.fee ?? "0"))
				throw new SignerError("fee_not_higher");
			changeIndex =
				first?.changeIndex ??
				this.state.nextChange.get(i.accountId as string) ??
				0;
			if (mode === "cancel") {
				// alles an die eigene Wechselgeld-Adresse zurück
				let total = 0n;
				for (const x of inputs) {
					const prev = Transaction.fromRaw(hex.decode(x.prevTxHex), {
						allowUnknownOutputs: true,
					});
					total += prev.getOutput(x.vout)?.amount ?? 0n;
				}
				cancelIndex = changeIndex;
				destination = own(1, cancelIndex);
				amount = total - fee;
				changeIndex = null;
				if (amount <= 0n) throw new SignerError("insufficient");
			}
		}
		try {
			const s = buildBtcSpend(
				{
					network: net,
					destination,
					amount,
					inputs,
					changeIndex,
					fee,
					feeCap: i.feeCap as bigint,
					maxSatPerVb: policy.feeCaps.btcSatPerVb,
				},
				keyAt,
			);
			return {
				txid: s.txid,
				raw: s.raw,
				fee: s.fee.toString(),
				outpoints,
				changeIndex:
					mode === "cancel" ? cancelIndex : s.change > 0n ? changeIndex : null,
			};
		} catch (e) {
			if (e instanceof SpendError) throw new SignerError("spend", e.code);
			throw e;
		}
	}

	private signEth(
		r: IntentRecord,
		accountIndex: number,
		mode: SignMode,
		plan: Args,
		policy: Policy,
		first: EventOf<"signed"> | undefined,
		last: EventOf<"signed"> | undefined,
	) {
		const i = r.intent;
		const nonce = uint(plan.nonce, "nonce");
		const gasLimit = posUint(plan.gasLimit, "gasLimit");
		const maxFeePerGas = posUint(plan.maxFeePerGas, "maxFeePerGas");
		const maxPriorityFeePerGas = uint(
			plan.maxPriorityFeePerGas,
			"maxPriorityFeePerGas",
		);
		const priv = this.keys.ethPrivateKey(i.network, accountIndex);
		if (mode === "first") {
			const max = this.state.nonces.get(i.accountId as string);
			const expected = max === undefined ? null : max + 1n;
			if (expected !== null && nonce !== expected)
				throw new SignerError("nonce", `expected ${expected}`);
		} else {
			if (nonce !== BigInt(first?.nonce ?? "-1"))
				throw new SignerError("nonce_differs");
			// wie die Knoten: Ersetzen nur mit mindestens 10 % mehr
			if (
				maxFeePerGas * 10n < BigInt(last?.maxFeePerGas ?? "0") * 11n ||
				maxPriorityFeePerGas * 10n <
					BigInt(last?.maxPriorityFeePerGas ?? "0") * 11n
			)
				throw new SignerError("fee_not_higher");
		}
		const self = addr.fromPrivateKey(priv);
		try {
			const s = buildEthSpend(
				{
					network: i.network,
					asset: mode === "cancel" ? "ETH" : (i.asset as AssetCode),
					// Abbruch: 1 Wei an sich selbst mit derselben Nonce
					destination: mode === "cancel" ? self : i.destination,
					amount: mode === "cancel" ? 1n : (i.amount as bigint),
					nonce,
					gasLimit,
					maxFeePerGas,
					maxPriorityFeePerGas,
					feeCap: i.feeCap as bigint,
					maxFeePerGasCap: BigInt(policy.feeCaps.ethMaxFeeGwei) * GWEI,
				},
				priv,
			);
			return {
				txid: s.hash,
				raw: s.raw,
				fee: s.maxFee.toString(),
				nonce: nonce.toString(),
				maxFeePerGas: maxFeePerGas.toString(),
				maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
				gasLimit: gasLimit.toString(),
			};
		} catch (e) {
			if (e instanceof SpendError) throw new SignerError("spend", e.code);
			throw e;
		}
	}

	// ── Bremsen (App) ─────────────────────────────────────────────────────

	freeze(raw: unknown, by: "app" | "admin") {
		const reason = shortText(obj(raw).reason, "reason");
		this.requireInit();
		if (!this.state.frozen) this.record({ type: "freeze", reason, by });
		return { frozen: this.state.frozen };
	}

	private checkPolicyChain(next: Policy) {
		const { policy } = this.requireInit();
		if (next.version !== policy.version + 1)
			throw new SignerError("policy_version");
		if (next.prev !== policyHash(policy)) throw new SignerError("policy_prev");
		const issues = policyIssues(next, { dev: this.cfg.dev });
		if (issues.length > 0)
			throw new SignerError("policy_invalid", issues.join(","));
		return policy;
	}

	policyTighten(raw: unknown) {
		const next = obj(obj(raw).policy, "policy") as unknown as Policy;
		const current = this.checkPolicyChain(next);
		if (!isTightening(current, next)) throw new SignerError("not_tightening");
		this.record({ type: "policy", policy: next, by: "app" });
		return { policy: next, policyHash: policyHash(next) };
	}

	// ── Einrichtung eines Sicherheitsschlüssels ──────────────────────────

	enrolInfo(raw: unknown) {
		const a = obj(raw);
		const { init } = this.requireInit();
		const id = hex128(a.enrolId, "enrolId");
		const en = this.state.enrolments.get(id);
		if (!en) throw new SignerError("enrol_unknown");
		return {
			enrolId: id,
			person: en.person,
			expiresAt: en.expiresAt,
			done: en.done,
			rpId: init.rpId,
			// derselbe Schlüssel zählt nie doppelt (auch nicht für andere)
			exclude: [...this.state.keys.keys()],
		};
	}

	enrolFinish(raw: unknown) {
		const a = obj(raw);
		const { init } = this.requireInit();
		const id = hex128(a.enrolId, "enrolId");
		const en = this.state.enrolments.get(id);
		if (!en) throw new SignerError("enrol_unknown");
		if (en.done) throw new SignerError("enrol_done");
		if (this.now() > en.expiresAt) throw new SignerError("enrol_expired");
		let out: ReturnType<typeof verifyEnrolment>;
		try {
			out = verifyEnrolment(
				{
					enrolId: id,
					credId: b64uStr(a.credId, "credId", 1400),
					spki: b64uStr(a.spki, "spki", 200),
					authenticatorData: b64uStr(a.authenticatorData, "authenticatorData"),
					clientDataJSON: b64uStr(a.clientDataJSON, "clientDataJSON"),
					mac: b64uStr(a.mac, "mac", 64),
				},
				{ rpId: init.rpId, origin: init.origin, secret: en.secret },
			);
		} catch (e) {
			if (e instanceof WebAuthnFailure)
				throw new SignerError("webauthn", e.code);
			throw e;
		}
		if (this.state.keys.has(out.credId)) throw new SignerError("key_exists");
		this.record({
			type: "key",
			enrolId: id,
			person: en.person,
			credId: out.credId,
			spki: out.spki,
			aaguid: out.aaguid,
			counter: out.counter,
		});
		return {
			person: en.person,
			credId: out.credId,
			activeKeys: activeKeysByPerson(this.state).get(en.person) ?? 0,
		};
	}

	// ── Nur root (admin.sock) ────────────────────────────────────────────

	// Schritt 1: Seeds erzeugen und die Wörter einmal zeigen (nichts gespeichert)
	seedPrepare(raw: unknown) {
		const a = obj(raw);
		if (!Array.isArray(a.networks) || a.networks.length === 0) bad("networks");
		const networks = (a.networks as unknown[]).map((n) => networkArg(n));
		for (const n of networks) {
			if (NETWORKS[n].live) throw new SignerError("live_off");
			if (this.keys.fingerprint(n)) throw new SignerError("network_exists");
		}
		const dice =
			a.dice === undefined ? undefined : shortText(a.dice, "dice", 400);
		const entropy: Partial<Record<WalletNetwork, Uint8Array>> = {};
		for (const n of networks) entropy[n] = newEntropy(dice);
		const token = randomBytes(16).toString("hex");
		this.prepared = { token, entropy, expiresAt: this.now() + 15 * 60 };
		return {
			token,
			words: Object.fromEntries(
				networks.map((n) => [n, mnemonicOf(entropy[n] as Uint8Array)]),
			),
			fingerprints: Object.fromEntries(
				networks.map((n) => [n, fingerprintOf(n, entropy[n] as Uint8Array)]),
			),
		};
	}

	// Schritt 2: drei Wörter je Netz bestätigt → Seeds speichern
	private takePrepared(a: Args) {
		const p = this.prepared;
		if (!p || p.token !== hex128(a.token, "token") || this.now() > p.expiresAt)
			throw new SignerError("prepare_expired");
		const checks = obj(a.checks, "checks");
		for (const [n, e] of Object.entries(p.entropy)) {
			const words = mnemonicOf(e as Uint8Array).split(" ");
			const c = obj(checks[n], `checks.${n}`);
			const positions = Object.keys(c);
			if (positions.length < 3) bad(`checks.${n}`);
			for (const pos of positions) {
				const idx = Number(pos);
				if (!Number.isInteger(idx) || idx < 1 || idx > 24) bad(`checks.${n}`);
				if (String(c[pos]).trim().toLowerCase() !== words[idx - 1])
					throw new SignerError("word_mismatch", `${n}:${idx}`);
			}
		}
		this.prepared = null;
		const file: SeedFile = {
			v: 1,
			seeds: { ...this.seedFile.seeds },
		};
		for (const [n, e] of Object.entries(p.entropy))
			file.seeds[n as WalletNetwork] = sealSeed(
				this.cfg.kek,
				n as WalletNetwork,
				e as Uint8Array,
			);
		writeSeedFile(join(this.cfg.dir, "seeds.json"), file);
		this.seedFile = file;
		this.keys = KeyRing.load(file, this.cfg.kek);
		this.keys.selfTest();
		return Object.fromEntries(
			Object.entries(p.entropy).map(([n, e]) => [
				n,
				fingerprintOf(n as WalletNetwork, e as Uint8Array),
			]),
		) as Partial<Record<WalletNetwork, string>>;
	}

	initCommit(raw: unknown) {
		const a = obj(raw);
		if (this.state.init) throw new SignerError("already_initialized");
		const orgId = uuid(a.orgId, "orgId");
		const rpId = rpIdOf(a.rpId);
		const origin = originOf(a.origin ?? `https://${rpId}`);
		if (new URL(origin).hostname !== rpId) bad("origin");
		const fingerprints = this.takePrepared(a);
		const networks = Object.keys(fingerprints) as WalletNetwork[];
		const policy = defaultPolicy(networks, this.cfg.dev);
		this.record({
			type: "init",
			orgId,
			rpId,
			origin,
			dev: this.cfg.dev,
			fingerprints,
			policy,
		});
		return { orgId, rpId, origin, fingerprints, policy };
	}

	networkCommit(raw: unknown) {
		this.requireInit();
		const fingerprints = this.takePrepared(obj(raw));
		for (const [n, f] of Object.entries(fingerprints))
			this.record({
				type: "network_added",
				network: n as WalletNetwork,
				fingerprint: f as string,
			});
		return { fingerprints };
	}

	enrolStart(raw: unknown) {
		const a = obj(raw);
		const { init } = this.requireInit();
		const person = uuid(a.person, "person");
		const ttl =
			a.ttlSec === undefined ? 3600 : int(a.ttlSec, "ttlSec", 300, 86_400);
		const enrolId = randomBytes(16).toString("hex");
		const secret = randomBytes(32).toString("hex");
		const expiresAt = this.now() + ttl;
		this.record({ type: "enrol_start", enrolId, person, secret, expiresAt });
		return {
			enrolId,
			person,
			expiresAt,
			url: `${init.origin}/enrol.html#e=${enrolId}&t=${secret}&p=${person}`,
		};
	}

	keyRevoke(raw: unknown) {
		const credId = b64uStr(obj(raw).credId, "credId", 1400);
		const k = this.state.keys.get(credId);
		if (!k) throw new SignerError("key_unknown");
		if (k.active) this.record({ type: "key_revoked", credId });
		return { credId, active: false };
	}

	policySet(raw: unknown) {
		const next = obj(obj(raw).policy, "policy") as unknown as Policy;
		this.checkPolicyChain(next);
		this.record({ type: "policy", policy: next, by: "admin" });
		return { policy: next, policyHash: policyHash(next) };
	}

	unfreeze() {
		this.requireInit();
		if (this.state.frozen) this.record({ type: "unfreeze" });
		return { frozen: null };
	}

	journalVerify() {
		const path = join(this.cfg.dir, "journal.log");
		const parsed = parseJournal(readFileSync(path, "utf8"));
		const replayed = replay(parsed.entries.map((e) => e.event));
		return {
			ok: parsed.head === this.journal.head && parsed.tornBytes === 0,
			seq: parsed.seq,
			head: parsed.head,
			intents: replayed.intents.size,
			keys: replayed.keys.size,
		};
	}

	exportXpubs() {
		return {
			fingerprints: this.state.fingerprints,
			accounts: [...this.state.accounts.values()],
		};
	}

	// KEK wechseln: Seeds mit dem nächsten KEK neu verschlüsseln
	rekey() {
		const path = this.cfg.kekNextPath;
		if (!path || !existsSync(path)) throw new SignerError("kek_next_missing");
		const raw = readFileSync(path);
		const text = raw.toString("utf8").trim();
		const next = /^[0-9a-f]{64}$/i.test(text)
			? Buffer.from(text, "hex")
			: raw.length === 32
				? raw
				: bad("kek_next");
		const file: SeedFile = { v: 1, seeds: {} };
		for (const [n, s] of Object.entries(this.seedFile.seeds)) {
			if (!s) continue;
			const entropy = openSeed(this.cfg.kek, n as WalletNetwork, s);
			file.seeds[n as WalletNetwork] = sealSeed(
				next,
				n as WalletNetwork,
				entropy,
			);
		}
		writeSeedFile(join(this.cfg.dir, "seeds.json"), file);
		this.seedFile = file;
		this.cfg.kek = next;
		this.record({
			type: "rekey",
			fingerprints: Object.fromEntries(
				Object.entries(file.seeds).map(([n, s]) => [n, s?.fingerprint ?? ""]),
			),
		});
		return { ok: true, fingerprints: this.state.fingerprints };
	}
}

// Sha256 eines Bundles (Anzeige in Klick, Vergleich mit CI)
export const fileSha256 = (path: string) =>
	createHash("sha256").update(readFileSync(path)).digest("hex");
