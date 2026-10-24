import {
	type SignerHello,
	type SignerMeta,
	signerCall,
	signerConfigured,
} from "@wallet/lib/wallet/signer/client";

// Stand des Signers für Seiten und Banner (15 s im Prozess gemerkt, damit
// nicht jede Seite den Socket fragt). Senden ist nur möglich, wenn der
// Signer eingerichtet ist, zur Org gehört und nicht eingefroren ist.

export type SignerState =
	| "off"
	| "unreachable"
	| "uninitialized"
	| "other_org"
	| "frozen"
	| "ready";

type Cached = { at: number; hello: (SignerHello & SignerMeta) | null };
let cache: Cached | null = null;
const TTL_MS = 15_000;

export async function signerHello(
	opts: { fresh?: boolean } = {},
): Promise<(SignerHello & SignerMeta) | null> {
	if (!signerConfigured()) return null;
	const now = Date.now();
	if (!opts.fresh && cache && now - cache.at < TTL_MS) return cache.hello;
	try {
		const r = await signerCall<SignerHello>("hello", {}, { timeoutMs: 3000 });
		cache = { at: now, hello: { ...r.result, seq: r.seq, head: r.head } };
	} catch {
		cache = { at: now, hello: null };
	}
	return cache.hello;
}

export function signerStateFor(
	hello: SignerHello | null,
	orgId: string,
): SignerState {
	if (!signerConfigured()) return "off";
	if (!hello) return "unreachable";
	if (!hello.initialized) return "uninitialized";
	if (hello.orgId !== orgId) return "other_org";
	if (hello.frozen) return "frozen";
	return "ready";
}

export async function signerState(orgId: string): Promise<{
	state: SignerState;
	hello: (SignerHello & SignerMeta) | null;
}> {
	const hello = await signerHello();
	return { state: signerStateFor(hello, orgId), hello };
}

export function resetSignerCache() {
	cache = null;
}
