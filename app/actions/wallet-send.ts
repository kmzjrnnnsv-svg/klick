"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { walletAccounts, walletAddresses } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { AuthError, requireWallet, toOrgCtx } from "@/lib/auth/guards";
import { mutateOrg } from "@/lib/db/with-org";
import { type ActionResult, fail, fromZod } from "@/lib/validation/common";
import { hotAccountSchema } from "@/lib/validation/wallet";
import { deriveAddress, parseAccountKey } from "@/lib/wallet/core/derive";
import { NETWORKS } from "@/lib/wallet/core/networks";
import { configuredNetworks } from "@/lib/wallet/node-clients";
import { recordAnchor } from "@/lib/wallet/signer/anchor";
import {
	type SignerHello,
	signerCall,
	signerConfigured,
	signerErrorCode,
} from "@/lib/wallet/signer/client";
import { resetSignerCache } from "@/lib/wallet/signer/status";

// Senden (Plan Wallet, Phase 2). Der Signer ist die einzige Instanz, die
// signiert und Freigaben zählt; diese Actions legen Absichten an, reichen
// Bremsen weiter und spiegeln den Stand. Jede Action verlangt den
// entsperrten Bereich (requireWallet); wer den Signer nicht besitzt (andere
// Org), kann nichts anlegen.

const PATH = "/wallet";

async function helloForOrg(orgId: string) {
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

// Hot-Konto: der Signer erzeugt den Kontoschlüssel aus seiner Seed, Klick
// bekommt nur die xpub und leitet Adressen selbst ab. Nur Inhaber:innen mit
// frischem Step-up, nur Testnetz, nur eigene Bestände (Kundengelder hot =
// Verwahrung, CASP-Erlaubnis).
async function createHotWalletAccountImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; address: string }>> {
	const parsed = hotAccountSchema.safeParse(input);
	const c = await requireWallet({ wallet: ["manage"] });
	if (!c.stepUpFresh) throw new AuthError("step_up_required");
	if (!parsed.success) return fromZod(parsed.error);
	const { name, network } = parsed.data;
	if (!configuredNetworks().includes(network))
		return fail("network_unavailable");
	if (NETWORKS[network].live) return fail("network_live");
	const s = await helloForOrg(c.orgId);
	if ("error" in s) return fail(s.error as string);
	if (!s.hello.networks.includes(network)) return fail("signer_network");

	const accountId = randomUUID();
	let created: {
		result: { index: number; xpub: string; fingerprint: string };
		seq: number;
		head: string;
	};
	try {
		created = await signerCall("account.create", {
			orgId: c.orgId,
			accountId,
			network,
		});
	} catch (e) {
		return fail(signerErrorCode(e));
	}
	let key: ReturnType<typeof parseAccountKey>;
	try {
		key = parseAccountKey(created.result.xpub, network);
	} catch {
		return fail("signer_key");
	}
	const address = deriveAddress(key.hd, network, 0, 0);
	const fingerprint = key.hd.fingerprint.toString(16).padStart(8, "0");
	const res = await mutateOrg<ActionResult<{ id: string; address: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const anchor = await recordAnchor(tx, c.orgId, created);
			if (anchor !== "ok") return { result: fail("signer_journal"), audit: [] };
			const now = new Date();
			await tx.insert(walletAccounts).values({
				id: accountId,
				organizationId: c.orgId,
				name,
				network,
				kind: "hot",
				purpose: "own",
				accountKey: key.standard,
				keyFingerprint: fingerprint,
				nextReceiveIndex: 1,
				historyFrom: now,
				createdByUserId: c.userId,
			});
			await tx.insert(walletAddresses).values({
				organizationId: c.orgId,
				accountId,
				branch: 0,
				index: 0,
				address,
				issuedAt: now,
				issuedByUserId: c.userId,
			});
			return {
				result: { ok: true, data: { id: accountId, address } },
				audit: {
					action: "wallet.hot_account_created",
					target: `wallet_account:${accountId}`,
					after: {
						name,
						network,
						kind: "hot",
						signerIndex: created.result.index,
						signerFingerprint: created.result.fingerprint,
						keyFingerprint: fingerprint,
						firstAddress: address,
					},
				},
			};
		},
	);
	resetSignerCache();
	if (res.ok) revalidatePath(PATH, "layout");
	return res;
}

export const createHotWalletAccount = safeAction(
	"createHotWalletAccount",
	createHotWalletAccountImpl,
);
