import { type Intent, parseIntent } from "../lib/wallet/core/intent";
import type { WalletNetwork } from "../lib/wallet/core/networks";
import { approvalsSatisfied, type Policy } from "../lib/wallet/core/policy";
import type { EventOf, InitEvent, SignerEvent } from "./events";

// Zustand des Signers als reine Faltung über das Journal. Beim Start wird
// jedes Ereignis in Reihenfolge angewandt; dieselbe Funktion läuft nach
// jedem neuen Eintrag — es gibt keinen zweiten Speicher.

export type KeyRecord = {
	credId: string;
	person: string;
	spki: string;
	aaguid: string;
	counter: number;
	active: boolean;
	enrolledAt: number;
};

export type IntentRecord = {
	intentId: string;
	text: string;
	intent: Intent;
	createdAt: number;
	approvals: { credId: string; person: string; at: number }[];
	// Freigabe erreicht (Quorum nach der Richtlinie zu diesem Zeitpunkt)
	approvedAt: number | null;
	// Auszahlung: frühestens/spätestens erste Signatur; Ziel: aktiv ab
	signableAt: number | null;
	signUntil: number | null;
	activeFrom: number | null;
	cancelled: boolean;
	vetoed: boolean;
	signatures: EventOf<"signed">[];
};

export type AccountRecord = {
	accountId: string;
	network: WalletNetwork;
	index: number;
	xpub: string;
};

export type SignerState = {
	init: InitEvent | null;
	fingerprints: Partial<Record<WalletNetwork, string>>;
	policy: Policy | null;
	accounts: Map<string, AccountRecord>;
	nextIndex: Partial<Record<WalletNetwork, number>>;
	enrolments: Map<
		string,
		{
			enrolId: string;
			person: string;
			secret: string;
			expiresAt: number;
			done: boolean;
		}
	>;
	keys: Map<string, KeyRecord>;
	intents: Map<string, IntentRecord>;
	frozen: { reason: string; at: number; by: "app" | "admin" } | null;
	// Bitcoin-Ausgang → Absicht, die ihn signiert ausgibt
	reserved: Map<string, string>;
	// Ethereum: höchste signierte Nonce je Konto
	nonces: Map<string, bigint>;
	// Bitcoin: nächster Wechselgeld-Index je Konto
	nextChange: Map<string, number>;
};

export function emptyState(): SignerState {
	return {
		init: null,
		fingerprints: {},
		policy: null,
		accounts: new Map(),
		nextIndex: {},
		enrolments: new Map(),
		keys: new Map(),
		intents: new Map(),
		frozen: null,
		reserved: new Map(),
		nonces: new Map(),
		nextChange: new Map(),
	};
}

export function activeKeysByPerson(s: SignerState): Map<string, number> {
	const out = new Map<string, number>();
	for (const k of s.keys.values())
		if (k.active) out.set(k.person, (out.get(k.person) ?? 0) + 1);
	return out;
}

// Freigabe mit den jetzt aktiven Schlüsseln erreicht? (gesperrte zählen nie)
export function quorum(s: SignerState, rec: IntentRecord): boolean {
	if (!s.policy) return false;
	const valid = rec.approvals
		.filter((a) => s.keys.get(a.credId)?.active)
		.map((a) => ({ personId: a.person, credentialId: a.credId }));
	return approvalsSatisfied(s.policy, valid, activeKeysByPerson(s));
}

// Quorum prüfen und Zeiten setzen (Richtlinie zum Zeitpunkt der Freigabe)
function settle(s: SignerState, rec: IntentRecord, at: number) {
	if (rec.approvedAt !== null || !s.policy) return;
	if (!quorum(s, rec)) return;
	rec.approvedAt = at;
	if (rec.intent.kind === "payout") {
		const delay = s.policy.mode === "solo" ? s.policy.soloDelaySec : 0;
		rec.signableAt = at + delay;
		rec.signUntil = rec.signableAt + s.policy.approvalWindowSec;
	} else {
		rec.activeFrom = at + s.policy.whitelistCooldownSec;
	}
}

export function apply(s: SignerState, e: SignerEvent): SignerState {
	switch (e.type) {
		case "init":
			s.init = e;
			s.fingerprints = { ...e.fingerprints };
			s.policy = e.policy;
			break;
		case "network_added":
			s.fingerprints[e.network] = e.fingerprint;
			break;
		case "account":
			s.accounts.set(e.accountId, {
				accountId: e.accountId,
				network: e.network,
				index: e.index,
				xpub: e.xpub,
			});
			s.nextIndex[e.network] = Math.max(
				s.nextIndex[e.network] ?? 0,
				e.index + 1,
			);
			break;
		case "enrol_start":
			s.enrolments.set(e.enrolId, {
				enrolId: e.enrolId,
				person: e.person,
				secret: e.secret,
				expiresAt: e.expiresAt,
				done: false,
			});
			break;
		case "key": {
			const en = s.enrolments.get(e.enrolId);
			if (en) en.done = true;
			s.keys.set(e.credId, {
				credId: e.credId,
				person: e.person,
				spki: e.spki,
				aaguid: e.aaguid,
				counter: e.counter,
				active: true,
				enrolledAt: e.at,
			});
			break;
		}
		case "key_revoked": {
			const k = s.keys.get(e.credId);
			if (k) k.active = false;
			break;
		}
		case "policy":
			s.policy = e.policy;
			break;
		case "intent":
			s.intents.set(e.intentId, {
				intentId: e.intentId,
				text: e.text,
				intent: parseIntent(e.text),
				createdAt: e.at,
				approvals: [],
				approvedAt: null,
				signableAt: null,
				signUntil: null,
				activeFrom: null,
				cancelled: false,
				vetoed: false,
				signatures: [],
			});
			break;
		case "approval": {
			const rec = s.intents.get(e.intentId);
			const k = s.keys.get(e.credId);
			if (k) k.counter = e.counter;
			if (!rec) break;
			rec.approvals.push({ credId: e.credId, person: e.person, at: e.at });
			settle(s, rec, e.at);
			break;
		}
		case "cancel": {
			const rec = s.intents.get(e.intentId);
			if (rec) rec.cancelled = true;
			break;
		}
		case "veto": {
			const rec = s.intents.get(e.intentId);
			if (rec) rec.vetoed = true;
			break;
		}
		case "freeze":
			s.frozen = { reason: e.reason, at: e.at, by: e.by };
			break;
		case "unfreeze":
			s.frozen = null;
			break;
		case "signed": {
			const rec = s.intents.get(e.intentId);
			if (rec) rec.signatures.push(e);
			for (const o of e.outpoints ?? []) s.reserved.set(o, e.intentId);
			if (e.nonce !== undefined) {
				const n = BigInt(e.nonce);
				const prev = s.nonces.get(e.accountId);
				if (prev === undefined || n > prev) s.nonces.set(e.accountId, n);
			}
			if (e.changeIndex !== undefined && e.changeIndex !== null)
				s.nextChange.set(
					e.accountId,
					Math.max(s.nextChange.get(e.accountId) ?? 0, e.changeIndex + 1),
				);
			break;
		}
		case "rekey":
			break;
	}
	return s;
}

export const replay = (events: readonly SignerEvent[]): SignerState =>
	events.reduce(apply, emptyState());
