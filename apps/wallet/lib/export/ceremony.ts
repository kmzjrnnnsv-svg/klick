import {
	isWalletNetwork,
	type WalletNetwork,
} from "@/lib/wallet/core/networks";
import type { EventData } from "@/lib/wallet-link/events";

// Zeremonie des Signers für den Export (pure): Richtlinie, aktive
// Sicherheitsschlüssel und Netze — nie Schlüsselmaterial. Ändert sich der
// Stand, meldet der Auszahlungs-Job ceremony.recorded.

export type CeremonySnapshot = {
	policyVersion: number;
	mode: string;
	policyHash: string | null;
	keysActive: number;
	persons: number;
	networks: WalletNetwork[];
};

export function ceremonySnapshot(s: {
	policy: { version: number; mode: string } | null;
	policyHash: string | null;
	keys: readonly { person: string; active: boolean }[];
	networks: readonly string[];
}): CeremonySnapshot {
	const active = s.keys.filter((k) => k.active);
	return {
		policyVersion: s.policy?.version ?? 0,
		mode: s.policy?.mode ?? "none",
		policyHash: s.policyHash,
		keysActive: active.length,
		persons: new Set(active.map((k) => k.person)).size,
		networks: s.networks.filter(isWalletNetwork).sort(),
	};
}

const same = (a: CeremonySnapshot, b: CeremonySnapshot) =>
	JSON.stringify(a) === JSON.stringify(b);

// null = nichts Neues
export function ceremonyChange(
	prev: CeremonySnapshot | null,
	next: CeremonySnapshot,
	now: Date,
): EventData<"ceremony.recorded"> | null {
	if (prev && same(prev, next)) return null;
	const reason: EventData<"ceremony.recorded">["reason"] = !prev
		? "initialised"
		: prev.policyHash !== next.policyHash ||
				prev.policyVersion !== next.policyVersion
			? "policy_changed"
			: "keys_changed";
	return {
		recordedAt: now.toISOString(),
		reason,
		policy: {
			version: next.policyVersion,
			mode: next.mode,
			hash: next.policyHash,
		},
		keys: { active: next.keysActive, persons: next.persons },
		networks: next.networks,
		fingerprints: {},
	};
}
