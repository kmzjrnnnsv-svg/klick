import {
	type SignerHello,
	signerCall,
	signerConfigured,
	signerErrorCode,
} from "./client";

// Gehört der Signer dieser Org? (ein Signer, eine Org — ADR-022)
export async function helloForOrg(orgId: string) {
	if (!signerConfigured()) return { error: "signer_off" } as const;
	try {
		const r = await signerCall<SignerHello>("hello");
		if (!r.result.initialized)
			return { error: "signer_uninitialized" } as const;
		if (r.result.orgId !== orgId) return { error: "signer_other_org" } as const;
		return { hello: r.result, meta: { seq: r.seq, head: r.head } } as const;
	} catch (e) {
		return { error: signerErrorCode(e) } as const;
	}
}
