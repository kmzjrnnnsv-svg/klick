import { randomBytes, randomUUID } from "node:crypto";
import { addr } from "micro-eth-signer";
import { describe, expect, it } from "vitest";
import {
	encodeMandate,
	type Mandate,
	normalizeDestinations,
} from "@/lib/wallet/core/mandate";
import { type Policy, policyHash } from "@/lib/wallet/core/policy";
import { MANDATE_TTL } from "@/signer/service";
import type { SoftSecurityKey } from "./helpers/security-key";
import {
	ALICE,
	approve,
	BOB,
	code,
	ETH_DEST,
	enrol,
	ORG,
	ORIGIN,
	RP,
	type SignerEnv,
	setup,
	T0,
	whitelist,
} from "./helpers/signer";

// Vollmacht im Signer (Härtung W, Schritt 2): eigener Journal-Eintrag,
// freigegeben über das Quorum der Sicherheitsschlüssel; danach gelten
// Auszahlungen der bevollmächtigten Person im Rahmen als vorab freigegeben.
// Pause, Fenster und Grenzen der Richtlinie gelten weiter; Widerruf und
// gesperrte Schlüssel nehmen die Freigabe auch noch beim Signieren.

const OTHER_DEST = addr.addChecksum(
	"0x00000000000000000000000000000000000000dd",
);
const DAY = 86_400;

function mandateText(over: Partial<Mandate> = {}): Mandate {
	return {
		orgId: ORG,
		mandateId: randomUUID(),
		grantee: BOB,
		network: "ethereum_sepolia",
		chainId: 11155111,
		asset: "ETH",
		perPayout: 1000n,
		total: 2500n,
		destinations: normalizeDestinations("ethereum_sepolia", [ETH_DEST]),
		validFrom: T0,
		validUntil: T0 + 30 * DAY,
		issuer: ALICE,
		nonce: randomBytes(16).toString("hex"),
		...over,
	};
}

function approveMandate(
	env: SignerEnv,
	key: SoftSecurityKey,
	mandateId: string,
) {
	const g = env.s.mandateGet({ mandateId });
	return env.s.mandateApprove({
		mandateId,
		...key.assert({
			rpId: RP,
			origin: ORIGIN,
			challenge: Buffer.from(g.challenge, "base64url"),
		}),
	});
}

// Solo mit zwei Schlüsseln (Alice), Bob = Bedienung mit eigenem Schlüssel
function ready() {
	const env = setup();
	const a1 = enrol(env.s, ALICE);
	const a2 = enrol(env.s, ALICE);
	const b1 = enrol(env.s, BOB);
	const account = randomUUID();
	env.s.accountCreate({
		orgId: ORG,
		accountId: account,
		network: "ethereum_sepolia",
	});
	whitelist(env, a1, "ethereum_sepolia", ETH_DEST);
	const issue = (over: Partial<Mandate> = {}) => {
		const m = mandateText(over);
		const text = encodeMandate(m);
		env.s.mandateCreate({ text });
		return { ...m, text };
	};
	const grant = (over: Partial<Mandate> = {}) => {
		const m = issue(over);
		approveMandate(env, a1, m.mandateId);
		approveMandate(env, a2, m.mandateId);
		return m;
	};
	const payout = (
		mandateId: string | undefined,
		over: { amount?: string; initiator?: string; destination?: string } = {},
	) =>
		env.s.intentCreate({
			kind: "payout",
			accountId: account,
			asset: "ETH",
			amount: over.amount ?? "1000",
			destination: over.destination ?? ETH_DEST,
			feeCap: "1000000000000000",
			initiator: over.initiator ?? BOB,
			...(mandateId ? { mandateId } : {}),
		});
	const plan = (nonce: string) => ({
		nonce,
		gasLimit: "21000",
		maxFeePerGas: "2000000000",
		maxPriorityFeePerGas: "1000000000",
	});
	return { ...env, a1, a2, b1, account, issue, grant, payout, plan };
}

describe("Vollmacht anlegen und freigeben", () => {
	it("Solo: eine Freigabe der Person mit zwei Schlüsseln, nie durch die bevollmächtigte Person", () => {
		const env = ready();
		const m = env.issue();
		expect(env.s.mandateGet({ mandateId: m.mandateId }).active).toBe(false);
		expect(code(() => approveMandate(env, env.b1, m.mandateId))).toBe(
			"mandate_self",
		);
		const view = approveMandate(env, env.a1, m.mandateId);
		expect(view.active).toBe(true);
		expect(view.approvedAt).toBe(T0 + DAY);
		expect(code(() => approveMandate(env, env.a1, m.mandateId))).toBe(
			"already_approved",
		);
		expect(env.s.status().mandates.map((x) => x.mandateId)).toContain(
			m.mandateId,
		);
	});

	it("Vier-Augen: zwei Personen, die bevollmächtigte zählt nicht", () => {
		const env = ready();
		const carol = randomUUID();
		const c1 = enrol(env.s, carol);
		const cur = env.s.state.policy as Policy;
		env.s.policySet({
			policy: {
				...cur,
				mode: "four_eyes",
				version: cur.version + 1,
				prev: policyHash(cur),
			},
		});
		const m = env.issue();
		approveMandate(env, env.a1, m.mandateId);
		approveMandate(env, env.a2, m.mandateId);
		expect(env.s.mandateGet({ mandateId: m.mandateId }).active).toBe(false);
		expect(code(() => approveMandate(env, env.b1, m.mandateId))).toBe(
			"mandate_self",
		);
		expect(approveMandate(env, c1, m.mandateId).active).toBe(true);
	});

	it("Text geprüft: fremde Org, gleiche ID mit anderem Text, Ziel nicht aktiv", () => {
		const env = ready();
		const foreign = encodeMandate(mandateText({ orgId: randomUUID() }));
		expect(code(() => env.s.mandateCreate({ text: foreign }))).toBe(
			"wrong_org",
		);
		expect(code(() => env.s.mandateCreate({ text: "both-mandate/v1|x" }))).toBe(
			"bad_request:format",
		);
		const m = env.issue();
		// derselbe Text noch einmal: kein zweiter Eintrag
		expect(code(() => env.s.mandateCreate({ text: m.text }))).toBe("ok");
		const changed = encodeMandate({ ...m, total: 5000n });
		expect(code(() => env.s.mandateCreate({ text: changed }))).toBe(
			"mandate_exists",
		);
		const other = encodeMandate(
			mandateText({
				destinations: normalizeDestinations("ethereum_sepolia", [OTHER_DEST]),
			}),
		);
		expect(code(() => env.s.mandateCreate({ text: other }))).toBe(
			"destination_inactive",
		);
		const ended = encodeMandate(
			mandateText({ validFrom: T0 - 3 * DAY, validUntil: T0 }),
		);
		expect(code(() => env.s.mandateCreate({ text: ended }))).toBe(
			"mandate_expired",
		);
	});

	it("Freigabe nur binnen 24 h nach dem Anlegen", () => {
		const env = ready();
		const m = env.issue();
		env.clock.t += MANDATE_TTL + 1;
		expect(code(() => approveMandate(env, env.a1, m.mandateId))).toBe(
			"mandate_expired",
		);
		expect(code(() => env.s.mandateGet({ mandateId: randomUUID() }))).toBe(
			"mandate_unknown",
		);
	});
});

describe("Auszahlung über die Vollmacht", () => {
	it("vorab freigegeben; Pause der Richtlinie bleibt; Schlüssel zählen nicht", () => {
		const env = ready();
		const m = env.grant();
		const p = env.payout(m.mandateId);
		expect(p.approved).toBe(true);
		const view = env.s.intentGet({ intentId: p.intentId });
		expect(view.mandateId).toBe(m.mandateId);
		expect(view.signableAt).toBe(env.clock.t + 30 * 60);
		expect(code(() => approve(env.s, env.a1, p.intentId))).toBe(
			"mandate_intent",
		);
		expect(
			code(() =>
				env.s.sign({
					intentId: p.intentId,
					mode: "first",
					plan: env.plan("0"),
				}),
			),
		).toBe("too_early");
		env.clock.t += 30 * 60;
		const signed = env.s.sign({
			intentId: p.intentId,
			mode: "first",
			plan: env.plan("0"),
		});
		expect(signed.txid).toMatch(/^0x[0-9a-f]{64}$/);
	});

	it("Rahmen: Person, Ziel, je Auszahlung, insgesamt, Zeitraum", () => {
		const env = ready();
		const m = env.grant();
		expect(code(() => env.payout(m.mandateId, { initiator: ALICE }))).toBe(
			"mandate_grantee",
		);
		expect(code(() => env.payout(m.mandateId, { amount: "1001" }))).toBe(
			"mandate_per_payout",
		);
		// zweites Ziel freigegeben, aber nicht in der Vollmacht
		whitelist(env, env.a1, "ethereum_sepolia", OTHER_DEST);
		expect(
			code(() => env.payout(m.mandateId, { destination: OTHER_DEST })),
		).toBe("mandate_destination");
		expect(code(() => env.payout(m.mandateId))).toBe("ok");
		expect(code(() => env.payout(m.mandateId))).toBe("ok");
		// 2000 offen, 1000 dazu überschreitet 2500
		expect(code(() => env.payout(m.mandateId))).toBe("mandate_total");
		expect(code(() => env.payout(m.mandateId, { amount: "500" }))).toBe("ok");
		expect(env.s.mandateGet({ mandateId: m.mandateId }).used).toBe("2500");
		env.clock.t = m.validUntil;
		expect(code(() => env.payout(m.mandateId, { amount: "1" }))).toBe(
			"mandate_expired",
		);
	});

	it("abgebrochene Auszahlung gibt den Betrag frei", () => {
		const env = ready();
		const m = env.grant({ total: 1000n });
		const p = env.payout(m.mandateId);
		expect(code(() => env.payout(m.mandateId, { amount: "1" }))).toBe(
			"mandate_total",
		);
		env.s.intentCancel({ intentId: p.intentId });
		expect(code(() => env.payout(m.mandateId))).toBe("ok");
	});

	it("noch nicht freigegeben oder unbekannt: keine Auszahlung", () => {
		const env = ready();
		const m = env.issue();
		expect(code(() => env.payout(m.mandateId))).toBe("mandate_not_approved");
		expect(code(() => env.payout(randomUUID()))).toBe("mandate_unknown");
	});

	it("Ende der Vollmacht gilt auch beim Signieren", () => {
		const env = ready();
		const m = env.grant({ validUntil: T0 + DAY + 600 });
		const p = env.payout(m.mandateId);
		env.clock.t += 30 * 60;
		expect(
			code(() =>
				env.s.sign({
					intentId: p.intentId,
					mode: "first",
					plan: env.plan("0"),
				}),
			),
		).toBe("mandate_expired");
	});
});

describe("Widerruf und gesperrte Schlüssel", () => {
	it("Widerruf nimmt offenen Auszahlungen die Freigabe", () => {
		const env = ready();
		const m = env.grant();
		const p = env.payout(m.mandateId);
		const view = env.s.mandateRevoke({ mandateId: m.mandateId });
		expect(view.revoked).toBe(true);
		expect(view.active).toBe(false);
		// zweimal widerrufen schreibt nichts Neues
		const before = env.s.head.seq;
		env.s.mandateRevoke({ mandateId: m.mandateId }, "admin");
		expect(env.s.head.seq).toBe(before);
		env.clock.t += 30 * 60;
		expect(
			code(() =>
				env.s.sign({
					intentId: p.intentId,
					mode: "first",
					plan: env.plan("0"),
				}),
			),
		).toBe("not_approved");
		expect(code(() => env.payout(m.mandateId))).toBe("mandate_not_approved");
		expect(code(() => approveMandate(env, env.a1, m.mandateId))).toBe(
			"mandate_revoked",
		);
	});

	it("gesperrter Schlüssel: die Vollmacht trägt nicht mehr", () => {
		const env = ready();
		const m = env.grant();
		const p = env.payout(m.mandateId);
		env.s.keyRevoke({ credId: env.a2.id });
		expect(env.s.mandateGet({ mandateId: m.mandateId }).active).toBe(false);
		env.clock.t += 30 * 60;
		expect(
			code(() =>
				env.s.sign({
					intentId: p.intentId,
					mode: "first",
					plan: env.plan("0"),
				}),
			),
		).toBe("not_approved");
	});

	it("eingefroren: weder anlegen noch freigeben", () => {
		const env = ready();
		const m = env.issue();
		env.s.freeze({ reason: "Test" }, "app");
		expect(code(() => approveMandate(env, env.a1, m.mandateId))).toBe("frozen");
		expect(code(() => env.issue())).toBe("frozen");
	});
});

describe("Journal", () => {
	it("Neustart spielt Vollmacht, Freigaben, Nutzung und Widerruf nach", () => {
		const env = ready();
		const m = env.grant();
		const r = env.grant();
		env.payout(m.mandateId, { amount: "700" });
		env.s.mandateRevoke({ mandateId: r.mandateId });
		const seq = env.s.head.seq;
		env.s.close();
		const s2 = env.open();
		expect(s2.head.seq).toBe(seq);
		const v = s2.mandateGet({ mandateId: m.mandateId });
		expect(v.active).toBe(true);
		expect(v.used).toBe("700");
		expect(s2.mandateGet({ mandateId: r.mandateId }).revoked).toBe(true);
		expect(s2.journalVerify().ok).toBe(true);
	});
});
