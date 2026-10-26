import type { AssetCode } from "../lib/wallet/core/assets";
import type { WalletNetwork } from "../lib/wallet/core/networks";
import type { Policy } from "../lib/wallet/core/policy";

// Ereignisse im Journal des Signers. `at` = Unix-Sekunden der eigenen Uhr.
// Nie Schlüsselmaterial: Seeds liegen verschlüsselt in seeds.json, das
// Journal enthält nur Fingerprints und öffentliche Schlüssel.

type Base = { seq: number; at: number };

export type InitEvent = Base & {
	type: "init";
	orgId: string;
	// WebAuthn: rpId = Host der Bestätigungsseite, origin = https://<rpId>
	rpId: string;
	origin: string;
	dev: boolean;
	fingerprints: Partial<Record<WalletNetwork, string>>;
	policy: Policy;
};

export type SignerEvent =
	| InitEvent
	| (Base & {
			type: "network_added";
			network: WalletNetwork;
			fingerprint: string;
	  })
	| (Base & {
			type: "account";
			accountId: string;
			network: WalletNetwork;
			index: number;
			xpub: string;
	  })
	| (Base & {
			type: "enrol_start";
			enrolId: string;
			person: string;
			// HMAC-Schlüssel des Einrichtungslinks (nur bis expiresAt nutzbar)
			secret: string;
			expiresAt: number;
	  })
	| (Base & {
			type: "key";
			enrolId: string;
			person: string;
			credId: string;
			// SubjectPublicKeyInfo (DER, base64url), nur P-256/ES256
			spki: string;
			aaguid: string;
			counter: number;
	  })
	| (Base & { type: "key_revoked"; credId: string })
	| (Base & { type: "policy"; policy: Policy; by: "admin" | "app" })
	| (Base & {
			type: "intent";
			intentId: string;
			// kanonischer Text (lib/wallet/core/intent.ts)
			text: string;
			// Auszahlung im Rahmen einer freigegebenen Vollmacht (vorab
			// freigegeben, Härtung W); fehlt bei älteren Einträgen
			mandateId?: string;
	  })
	| (Base & {
			type: "approval";
			intentId: string;
			credId: string;
			person: string;
			counter: number;
	  })
	| (Base & { type: "cancel"; intentId: string; by: "app" | "admin" })
	| (Base & { type: "veto"; intentId: string })
	| (Base & { type: "freeze"; reason: string; by: "app" | "admin" })
	| (Base & { type: "unfreeze" })
	| (Base & {
			type: "signed";
			intentId: string;
			mode: SignMode;
			accountId: string;
			network: WalletNetwork;
			asset: AssetCode;
			amount: string;
			txid: string;
			raw: string;
			fee: string;
			// Bitcoin: ausgegebene Ausgänge und Index des Wechselgelds
			outpoints?: string[];
			changeIndex?: number | null;
			// Ethereum: Nonce und Gebühren (Wei)
			nonce?: string;
			maxFeePerGas?: string;
			maxPriorityFeePerGas?: string;
			gasLimit?: string;
	  })
	| (Base & { type: "rekey"; fingerprints: Record<string, string> })
	// Vollmacht (lib/wallet/core/mandate.ts): angelegt von der App, freigegeben
	// wie eine Absicht über das Quorum der Sicherheitsschlüssel
	| (Base & { type: "mandate"; mandateId: string; text: string })
	| (Base & {
			type: "mandate_approval";
			mandateId: string;
			credId: string;
			person: string;
			counter: number;
	  })
	| (Base & {
			type: "mandate_revoked";
			mandateId: string;
			by: "app" | "admin";
	  });

// erste Signatur, Gebührenerhöhung (gleiche Eingänge/Nonce), Abbruch
// (gleiche Eingänge/Nonce an sich selbst)
export const SIGN_MODES = ["first", "bump", "cancel"] as const;
export type SignMode = (typeof SIGN_MODES)[number];

export type EventOf<T extends SignerEvent["type"]> = Extract<
	SignerEvent,
	{ type: T }
>;
