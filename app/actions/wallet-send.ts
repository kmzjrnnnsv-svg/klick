"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	walletAccounts,
	walletAddressBook,
	walletAddresses,
} from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { AuthError, requireWallet, toOrgCtx } from "@/lib/auth/guards";
import { loadSanctionSet } from "@/lib/db/sanctions";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { membersAllowed } from "@/lib/org/roles";
import { type ActionResult, fail, fromZod } from "@/lib/validation/common";
import {
	hotAccountSchema,
	proposeDestinationSchema,
	vetoDestinationSchema,
} from "@/lib/validation/wallet";
import { checkAddress } from "@/lib/wallet/core/address";
import { deriveAddress, parseAccountKey } from "@/lib/wallet/core/derive";
import { NETWORKS } from "@/lib/wallet/core/networks";
import { configuredNetworks } from "@/lib/wallet/node-clients";
import { screenSources } from "@/lib/wallet/screening";
import { recordAnchor } from "@/lib/wallet/signer/anchor";
import {
	type SignerHello,
	type SignerIntentView,
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

// Zieladresse vorschlagen: Sanktionsprüfung, dann Absicht im Signer. Aktiv
// erst nach Bestätigung per Sicherheitsschlüssel und Wartezeit (Signer);
// alle im Wallet-Bereich werden benachrichtigt und können ein Veto einlegen.
async function proposeDestinationImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; intentId: string }>> {
	const parsed = proposeDestinationSchema.safeParse(input);
	const c = await requireWallet({ wallet: ["initiate"] });
	if (!parsed.success) return fromZod(parsed.error);
	const { network, label } = parsed.data;
	if (NETWORKS[network].live) return fail("network_live");
	const checked = checkAddress(network, parsed.data.address);
	if (!checked.ok)
		return fail(`address_${checked.error}`, {
			address: [`address_${checked.error}`],
		});
	const address = checked.address;
	const s = await helloForOrg(c.orgId);
	if ("error" in s) return fail(s.error as string);
	const screening = screenSources(
		NETWORKS[network].chain,
		[address],
		await loadSanctionSet(),
	);
	if (screening.result === "hit") {
		await mutateOrg(toOrgCtx(c), async () => ({
			result: null,
			audit: {
				action: "wallet.whitelist_blocked",
				target: `wallet_address:${network}:${address}`,
				after: { network, address, screeningRef: screening.ref },
			},
		}));
		return fail("sanctioned");
	}
	const dup = await readOrg(toOrgCtx(c), (tx) =>
		tx
			.select({ id: walletAddressBook.id })
			.from(walletAddressBook)
			.where(
				and(
					eq(walletAddressBook.organizationId, c.orgId),
					eq(walletAddressBook.network, network),
					eq(walletAddressBook.address, address),
					inArray(walletAddressBook.status, ["proposed", "cooling", "active"]),
				),
			)
			.limit(1),
	);
	if (dup.length > 0) return fail("destination_exists");
	let created: {
		result: { intentId: string; text: string; expiresAt: number };
		seq: number;
		head: string;
	};
	try {
		created = await signerCall("intent.create", {
			kind: "whitelist",
			network,
			destination: address,
			initiator: c.userId,
		});
	} catch (e) {
		return fail(signerErrorCode(e));
	}
	const res = await mutateOrg<ActionResult<{ id: string; intentId: string }>>(
		toOrgCtx(c),
		async (tx) => {
			if ((await recordAnchor(tx, c.orgId, created)) !== "ok")
				return { result: fail("signer_journal"), audit: [] };
			const [row] = await tx
				.insert(walletAddressBook)
				.values({
					organizationId: c.orgId,
					network,
					address,
					label,
					intentId: created.result.intentId,
					expiresAt: new Date(created.result.expiresAt * 1000),
					screening: "clear",
					proposedByUserId: c.userId,
				})
				.returning({ id: walletAddressBook.id });
			if (!row) throw new Error("insert failed");
			await notify(tx, {
				orgId: c.orgId,
				recipients: await membersAllowed(tx, c.orgId, { wallet: ["read"] }),
				actorUserId: c.userId,
				kind: "security_alert",
				title: `Neue Zieladresse vorgeschlagen: „${label}“`,
				body: `${NETWORKS[network].label}, ${address}. Freigabe nur per Sicherheitsschlüssel; ein Veto ist im Adressbuch jederzeit möglich.`,
				link: "/wallet/adressbuch",
				payload: { addressBookId: row.id },
			});
			return {
				result: {
					ok: true,
					data: { id: row.id, intentId: created.result.intentId },
				},
				audit: {
					action: "wallet.whitelist_proposed",
					target: `wallet_address:${row.id}`,
					after: {
						network,
						address,
						label,
						intentId: created.result.intentId,
					},
				},
			};
		},
	);
	if (res.ok) revalidatePath(`${PATH}/adressbuch`);
	return res;
}

// Veto: bremst nur, darf daher jede:r im Wallet-Bereich. Im Signer endgültig.
async function vetoDestinationImpl(input: unknown): Promise<ActionResult> {
	const parsed = vetoDestinationSchema.safeParse(input);
	const c = await requireWallet();
	if (!parsed.success) return fromZod(parsed.error);
	const { id, reason } = parsed.data;
	const [row] = await readOrg(toOrgCtx(c), (tx) =>
		tx
			.select()
			.from(walletAddressBook)
			.where(
				and(
					eq(walletAddressBook.id, id),
					eq(walletAddressBook.organizationId, c.orgId),
				),
			)
			.limit(1),
	);
	if (!row) return fail("notFound");
	if (row.status === "vetoed") return { ok: true, data: undefined };
	let vetoed: { result: SignerIntentView; seq: number; head: string };
	try {
		vetoed = await signerCall("whitelist.veto", { intentId: row.intentId });
	} catch (e) {
		return fail(signerErrorCode(e));
	}
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		await recordAnchor(tx, c.orgId, vetoed);
		await tx
			.update(walletAddressBook)
			.set({
				status: "vetoed",
				vetoedByUserId: c.userId,
				vetoedAt: new Date(),
				vetoReason: reason,
			})
			.where(eq(walletAddressBook.id, id));
		await notify(tx, {
			orgId: c.orgId,
			recipients: await membersAllowed(tx, c.orgId, { wallet: ["read"] }),
			actorUserId: c.userId,
			kind: "security_alert",
			title: `Veto gegen Zieladresse „${row.label}“`,
			body: reason,
			link: "/wallet/adressbuch",
		});
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "wallet.whitelist_vetoed",
				target: `wallet_address:${id}`,
				before: { status: row.status },
				after: { status: "vetoed", reason },
			},
		};
	});
	if (res.ok) revalidatePath(`${PATH}/adressbuch`);
	return res;
}

export const createHotWalletAccount = safeAction(
	"createHotWalletAccount",
	createHotWalletAccountImpl,
);
export const proposeDestination = safeAction(
	"proposeDestination",
	proposeDestinationImpl,
);
export const vetoDestination = safeAction(
	"vetoDestination",
	vetoDestinationImpl,
);
