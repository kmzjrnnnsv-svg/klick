import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addr } from "micro-eth-signer";
import { Signer } from "@/signer/service";
import { SignerError } from "@/signer/validate";
import { SoftSecurityKey } from "./security-key";

// Gemeinsamer Aufbau der Signer-Tests: Journal im Temp-Ordner, eigene Uhr,
// Software-Schlüssel, Freigabe und Zieladressen mit Wartezeit.

export const RP = "freigabe.raza.work";
export const ORIGIN = `https://${RP}`;
export const ORG = randomUUID();
export const ALICE = randomUUID();
export const BOB = randomUUID();
export const T0 = 1_800_000_000;
export const ETH_DEST = addr.addChecksum(
	"0x00000000000000000000000000000000000000cc",
);
export const BTC_DEST = "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx";

export function code(fn: () => unknown): string {
	try {
		fn();
	} catch (e) {
		if (e instanceof SignerError)
			return e.detail ? `${e.code}:${e.detail}` : e.code;
		throw e;
	}
	return "ok";
}

export function setup(opts: { dev?: boolean } = {}) {
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

export function enrol(s: Signer, person: string, key = new SoftSecurityKey()) {
	const { enrolId, url } = s.enrolStart({ person });
	const secret = new URL(url).hash.match(/t=([0-9a-f]{64})/)?.[1] as string;
	s.enrolFinish(key.enrol({ rpId: RP, origin: ORIGIN, enrolId, secret }));
	return key;
}

export function approve(s: Signer, key: SoftSecurityKey, intentId: string) {
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
export function whitelist(
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
export type SignerEnv = ReturnType<typeof setup>;
