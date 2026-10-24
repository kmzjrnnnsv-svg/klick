"use server";

// Legacy (bis K6): Wallet-Bereich in Klick, ersetzt durch both.money —
// Änderungen nur noch in apps/wallet/app/actions/wallet-send.ts.
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
	walletAccounts,
	walletAddressBook,
	walletAddresses,
	walletPayouts,
} from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { AuthError, requireWallet, toOrgCtx } from "@/lib/auth/guards";
import { loadSanctionSet } from "@/lib/db/sanctions";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { membersAllowed } from "@/lib/org/roles";
import { type ActionResult, fail, fromZod } from "@/lib/validation/common";
import {
	freezeSignerSchema,
	hotAccountSchema,
	payoutIdSchema,
	payoutSchema,
	proposeDestinationSchema,
	vetoDestinationSchema,
} from "@/lib/validation/wallet";
import { effectiveStatus } from "@/lib/wallet/address-book";
import { checkAddress } from "@/lib/wallet/core/address";
import { AmountError, parseAmount } from "@/lib/wallet/core/amount";
import { assetOf } from "@/lib/wallet/core/assets";
import { deriveAddress, parseAccountKey } from "@/lib/wallet/core/derive";
import { NETWORKS } from "@/lib/wallet/core/networks";
import { type Policy, spendAllowed } from "@/lib/wallet/core/policy";
import { amountText } from "@/lib/wallet/display";
import {
	configuredNetworks,
	nodeClientsFromEnv,
} from "@/lib/wallet/node-clients";
import {
	addressIndex,
	btcCapForPayout,
	ethCapForPayout,
	excludedOutpoints,
} from "@/lib/wallet/payouts/build";
import { OPEN_PAYOUT_STATUS } from "@/lib/wallet/payouts/plan";
import { screenSources } from "@/lib/wallet/screening";
import { anchorOk, recordAnchor } from "@/lib/wallet/signer/anchor";
import {
	SignerCallError,
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
			if (!anchorOk(anchor))
				return { result: fail("signer_journal"), audit: [] };
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
			if (!anchorOk(await recordAnchor(tx, c.orgId, created)))
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

// Auszahlung anlegen: Absicht im Signer (Ziel und Betrag stehen darin fest),
// Freigabe per Sicherheitsschlüssel auf der Bestätigungsseite. Signieren und
// senden übernimmt der Job wallet-payouts.
async function createPayoutImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const parsed = payoutSchema.safeParse(input);
	const c = await requireWallet({ wallet: ["initiate"] });
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const s = await helloForOrg(c.orgId);
	if ("error" in s) return fail(s.error as string);
	if (s.hello.frozen) return fail("signer_frozen");
	const loaded = await readOrg(toOrgCtx(c), async (tx) => {
		const [account] = await tx
			.select()
			.from(walletAccounts)
			.where(
				and(
					eq(walletAccounts.id, d.accountId),
					eq(walletAccounts.organizationId, c.orgId),
					eq(walletAccounts.status, "active"),
				),
			)
			.limit(1);
		const [dest] = await tx
			.select()
			.from(walletAddressBook)
			.where(
				and(
					eq(walletAddressBook.id, d.addressBookId),
					eq(walletAddressBook.organizationId, c.orgId),
				),
			)
			.limit(1);
		const open = account
			? await tx
					.select({ amount: walletPayouts.amount })
					.from(walletPayouts)
					.where(
						and(
							eq(walletPayouts.accountId, account.id),
							eq(walletPayouts.asset, d.asset),
							inArray(walletPayouts.status, [...OPEN_PAYOUT_STATUS]),
						),
					)
			: [];
		return { account, dest, open };
	});
	const { account, dest } = loaded;
	if (!account) return fail("notFound");
	if (account.kind !== "hot") return fail("not_hot");
	if (
		!dest ||
		dest.network !== account.network ||
		effectiveStatus(dest, new Date()) !== "active"
	)
		return fail("destination_inactive");
	const info = assetOf(account.network, d.asset);
	if (!info) return fail("asset");
	let amount: bigint;
	try {
		amount = parseAmount(d.amount, info.decimals);
	} catch (e) {
		if (e instanceof AmountError)
			return fail(`amount_${e.code}`, { amount: [`amount_${e.code}`] });
		throw e;
	}
	// verfügbar = bestätigt laut Knoten minus offene Auszahlungen
	const reserved = loaded.open.reduce((sum, p) => sum + BigInt(p.amount), 0n);
	const confirmed = BigInt(account.balances?.[d.asset]?.confirmed ?? "0");
	if (confirmed - reserved < amount) return fail("insufficient");
	let policy: Policy;
	try {
		policy = (await signerCall<{ policy: Policy }>("status")).result.policy;
	} catch (e) {
		return fail(signerErrorCode(e));
	}
	const allowed = spendAllowed(policy, d.asset, amount, 0n);
	if (allowed !== "ok") return fail(allowed);
	const client = nodeClientsFromEnv()[account.network];
	if (!client) return fail("network_unavailable");
	let feeCap: bigint;
	if (client.chain === "bitcoin") {
		const { index, exclude } = await readOrg(toOrgCtx(c), async (tx) => ({
			index: await addressIndex(tx, account.id),
			exclude: await excludedOutpoints(tx, c.orgId, account.id),
		}));
		const cap = await btcCapForPayout(
			client.btc,
			account.id,
			index,
			amount,
			d.speed,
			policy,
			exclude,
		);
		if ("error" in cap) return fail(`plan_${cap.error}`);
		feeCap = cap.feeCap;
	} else {
		const [from] = await readOrg(toOrgCtx(c), (tx) =>
			tx
				.select({ address: walletAddresses.address })
				.from(walletAddresses)
				.where(
					and(
						eq(walletAddresses.accountId, account.id),
						eq(walletAddresses.branch, 0),
						eq(walletAddresses.index, 0),
					),
				)
				.limit(1),
		);
		if (!from) return fail("notFound");
		const cap = await ethCapForPayout(
			client.eth,
			{
				network: account.network,
				asset: d.asset,
				from: from.address,
				destination: dest.address,
				amount,
				speed: d.speed,
			},
			policy,
		);
		if ("error" in cap) return fail(`plan_${cap.error}`);
		feeCap = cap.feeCap;
	}
	let created: {
		result: { intentId: string; text: string; expiresAt: number };
		seq: number;
		head: string;
	};
	try {
		created = await signerCall("intent.create", {
			kind: "payout",
			accountId: account.id,
			asset: d.asset,
			amount: amount.toString(),
			destination: dest.address,
			feeCap: feeCap.toString(),
			initiator: c.userId,
		});
	} catch (e) {
		return fail(signerErrorCode(e));
	}
	const text = amountText(account.network, d.asset, amount);
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			if (!anchorOk(await recordAnchor(tx, c.orgId, created)))
				return { result: fail("signer_journal"), audit: [] };
			const [row] = await tx
				.insert(walletPayouts)
				.values({
					organizationId: c.orgId,
					accountId: account.id,
					addressBookId: dest.id,
					asset: d.asset,
					amount: amount.toString(),
					destination: dest.address,
					destinationLabel: dest.label,
					feeCap: feeCap.toString(),
					speed: d.speed,
					intentId: created.result.intentId,
					intentText: created.result.text,
					expiresAt: new Date(created.result.expiresAt * 1000),
					createdByUserId: c.userId,
				})
				.returning({ id: walletPayouts.id });
			if (!row) throw new Error("insert failed");
			await notify(tx, {
				orgId: c.orgId,
				recipients: await membersAllowed(tx, c.orgId, { wallet: ["approve"] }),
				actorUserId: c.userId,
				kind: "approval_requested",
				title: `Auszahlung wartet auf Freigabe: ${text}`,
				body: `An „${dest.label}“. Bestätigen nur mit Sicherheitsschlüssel auf der Bestätigungsseite.`,
				link: `/wallet/auszahlungen/${row.id}`,
				payload: { payoutId: row.id },
			});
			return {
				result: { ok: true, data: { id: row.id } },
				audit: {
					action: "wallet.payout_created",
					target: `wallet_payout:${row.id}`,
					after: {
						accountId: account.id,
						asset: d.asset,
						amount: amount.toString(),
						destination: dest.address,
						feeCap: feeCap.toString(),
						speed: d.speed,
						intentId: created.result.intentId,
					},
				},
			};
		},
	);
	if (res.ok) revalidatePath(`${PATH}/auszahlungen`);
	return res;
}

async function loadPayout(
	orgId: string,
	c: Parameters<typeof toOrgCtx>[0],
	id: string,
) {
	const [row] = await readOrg(toOrgCtx(c), (tx) =>
		tx
			.select()
			.from(walletPayouts)
			.where(
				and(eq(walletPayouts.id, id), eq(walletPayouts.organizationId, orgId)),
			)
			.limit(1),
	);
	return row ?? null;
}

// Abbrechen: vor dem Signieren im Signer, danach als Abbruch-Transaktion
// (gleiche Eingänge/Nonce an das eigene Konto) über den Job. Bremst nur.
async function cancelPayoutImpl(input: unknown): Promise<ActionResult> {
	const parsed = payoutIdSchema.safeParse(input);
	const c = await requireWallet();
	if (!parsed.success) return fromZod(parsed.error);
	const p = await loadPayout(c.orgId, c, parsed.data.id);
	if (!p) return fail("notFound");
	if (p.status === "awaiting_approval" || p.status === "approved") {
		let meta: { seq: number; head: string };
		try {
			const r = await signerCall("intent.cancel", { intentId: p.intentId });
			meta = { seq: r.seq, head: r.head };
		} catch (e) {
			// schon signiert (Job war schneller): als Abbruch-Transaktion
			if (!(e instanceof SignerCallError && e.signerCode === "already_signed"))
				return fail(signerErrorCode(e));
			meta = { seq: -1, head: "" };
		}
		const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
			if (meta.seq >= 0) await recordAnchor(tx, c.orgId, meta);
			const set =
				meta.seq >= 0
					? { status: "cancelled" as const }
					: { cancelRequested: true };
			await tx.update(walletPayouts).set(set).where(eq(walletPayouts.id, p.id));
			return {
				result: { ok: true, data: undefined },
				audit: {
					action:
						meta.seq >= 0
							? "wallet.payout_cancelled"
							: "wallet.payout_cancel_requested",
					target: `wallet_payout:${p.id}`,
					before: { status: p.status },
				},
			};
		});
		revalidatePath(`${PATH}/auszahlungen`, "layout");
		return res;
	}
	if (p.status === "signed" || p.status === "broadcast") {
		const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
			await tx
				.update(walletPayouts)
				.set({ cancelRequested: true })
				.where(eq(walletPayouts.id, p.id));
			return {
				result: { ok: true, data: undefined },
				audit: {
					action: "wallet.payout_cancel_requested",
					target: `wallet_payout:${p.id}`,
					before: { status: p.status },
				},
			};
		});
		revalidatePath(`${PATH}/auszahlungen`, "layout");
		return res;
	}
	return fail("not_open");
}

// Beschleunigen: höhere Gebühr mit denselben Eingängen bzw. derselben Nonce
// (Job), höchstens bis zum Gebühren-Deckel der Absicht
async function bumpPayoutImpl(input: unknown): Promise<ActionResult> {
	const parsed = payoutIdSchema.safeParse(input);
	const c = await requireWallet({ wallet: ["initiate"] });
	if (!parsed.success) return fromZod(parsed.error);
	const p = await loadPayout(c.orgId, c, parsed.data.id);
	if (!p) return fail("notFound");
	if (p.status !== "broadcast" || p.cancelRequested) return fail("not_open");
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		await tx
			.update(walletPayouts)
			.set({ bumpRequested: true })
			.where(eq(walletPayouts.id, p.id));
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "wallet.payout_bump_requested",
				target: `wallet_payout:${p.id}`,
				after: { fee: p.fee, feeCap: p.feeCap },
			},
		};
	});
	revalidatePath(`${PATH}/auszahlungen`, "layout");
	return res;
}

// Alles stoppen: Signer einfrieren. Bremsen darf jede:r im entsperrten
// Bereich ohne Sicherheitsschlüssel; auftauen nur root am Server-Terminal.
async function freezeSignerImpl(input: unknown): Promise<ActionResult> {
	const parsed = freezeSignerSchema.safeParse(input);
	const c = await requireWallet();
	if (!parsed.success) return fromZod(parsed.error);
	const s = await helloForOrg(c.orgId);
	if ("error" in s) return fail(s.error as string);
	// der Signer nimmt nur druckbaren Text (Buchstaben, Ziffern, Satzzeichen)
	const reason = parsed.data.reason
		.replace(/[^\p{L}\p{N}\p{P}\p{Zs}]+/gu, " ")
		.trim();
	let r: {
		result: { frozen: SignerHello["frozen"] };
		seq: number;
		head: string;
	};
	try {
		r = await signerCall("freeze", { reason: reason || "Gestoppt in Klick" });
	} catch (e) {
		return fail(signerErrorCode(e));
	}
	resetSignerCache();
	return mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		await recordAnchor(tx, c.orgId, { ...r, frozen: r.result.frozen });
		await notify(tx, {
			orgId: c.orgId,
			recipients: await membersAllowed(tx, c.orgId, { wallet: ["read"] }),
			actorUserId: c.userId,
			kind: "security_alert",
			title: "Signer eingefroren",
			body: `Alle Auszahlungen gestoppt. Grund: ${reason}. Auftauen nur am Server-Terminal.`,
			link: "/wallet/sicherheit",
		});
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "wallet.signer_frozen",
				target: `wallet_signer:${c.orgId}`,
				after: { reason, by: "app" },
			},
		};
	});
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
export const createPayout = safeAction("createPayout", createPayoutImpl);
export const cancelPayout = safeAction("cancelPayout", cancelPayoutImpl);
export const bumpPayout = safeAction("bumpPayout", bumpPayoutImpl);
export const freezeSigner = safeAction("freezeSigner", freezeSignerImpl);
