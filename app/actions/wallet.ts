"use server";

// Legacy (bis K6): Wallet-Bereich in Klick, ersetzt durch both.money —
// Änderungen nur noch in apps/wallet/app/actions/wallet.ts.
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { walletAccounts, walletAddresses, wallets } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireWallet, toOrgCtx } from "@/lib/auth/guards";
import { mutateOrg, type OrgTx } from "@/lib/db/with-org";
import { type ActionResult, fail, fromZod } from "@/lib/validation/common";
import {
	accountIdSchema,
	introStepSchema,
	receiveAddressSchema,
	walletAccountSchema,
	walletAccountUpdateSchema,
	watchlistSchema,
} from "@/lib/validation/wallet";
import {
	deriveAddress,
	ExtendedKeyError,
	GAP_LIMIT,
	parseAccountKey,
} from "@/lib/wallet/core/derive";
import {
	clientFundsAllowed,
	NETWORKS,
	networkAllowed,
} from "@/lib/wallet/core/networks";
import { INTRO_STEPS, laterStep } from "@/lib/wallet/intro";
import { configuredNetworks } from "@/lib/wallet/node-clients";
import {
	getWalletPreferences,
	upsertWalletPreferences,
} from "@/lib/wallet/preferences";

// Wallet-Bereich (Plan Wallet, Phase 1). Jede Action verlangt den
// entsperrten Bereich (requireWallet: Passkey ≤ 15 min, nur diese Org).
// Konten anlegen/ändern/stilllegen bleibt Inhaber:innen (wallet:manage),
// Empfangsadressen ausgeben darf, wer den Bereich lesen darf.

const PATH = "/wallet";

async function custodyWalletOf(tx: OrgTx, orgId: string, id: string | null) {
	if (!id) return null;
	const [w] = await tx
		.select({ id: wallets.id })
		.from(wallets)
		.where(and(eq(wallets.id, id), eq(wallets.organizationId, orgId)))
		.limit(1);
	return w?.id ?? null;
}

async function createWalletAccountImpl(
	input: unknown,
): Promise<ActionResult<{ id: string; address: string }>> {
	const parsed = walletAccountSchema.safeParse(input);
	const c = await requireWallet({ wallet: ["manage"] });
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	if (!configuredNetworks().includes(d.network))
		return fail("network_unavailable");
	// Echtgeld erst mit signierter Richtlinie (Phase 3); Kundengelder nur im
	// Testnetz bzw. mit CASP-Erlaubnis
	if (!networkAllowed(d.network, { liveEnabled: false }))
		return fail("network_live");
	if (
		d.purpose === "client" &&
		!clientFundsAllowed(d.network, {
			caspLicensed: false,
			zagLicensed: false,
			emt: false,
		})
	)
		return fail("client_funds");
	let key: ReturnType<typeof parseAccountKey>;
	try {
		key = parseAccountKey(d.accountKey, d.network);
	} catch (e) {
		if (e instanceof ExtendedKeyError)
			return fail(`key_${e.code}`, { accountKey: [`key_${e.code}`] });
		throw e;
	}
	const fingerprint = key.hd.fingerprint.toString(16).padStart(8, "0");
	const address = deriveAddress(key.hd, d.network, 0, 0);
	const res = await mutateOrg<ActionResult<{ id: string; address: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const [dup] = await tx
				.select({ id: walletAccounts.id })
				.from(walletAccounts)
				.where(
					and(
						eq(walletAccounts.organizationId, c.orgId),
						eq(walletAccounts.network, d.network),
						eq(walletAccounts.accountKey, key.standard),
					),
				)
				.limit(1);
			if (dup) return { result: fail("duplicate"), audit: [] };
			const now = new Date();
			const [row] = await tx
				.insert(walletAccounts)
				.values({
					organizationId: c.orgId,
					name: d.name,
					network: d.network,
					kind: "cold",
					purpose: d.purpose,
					accountKey: key.standard,
					keyFingerprint: fingerprint,
					custodyWalletId: await custodyWalletOf(
						tx,
						c.orgId,
						d.custodyWalletId,
					),
					// Index 0 ist gleich ausgegeben (erste Empfangsadresse)
					nextReceiveIndex: 1,
					historyFrom: d.historyFrom
						? new Date(`${d.historyFrom}T00:00:00Z`)
						: now,
					createdByUserId: c.userId,
				})
				.returning({ id: walletAccounts.id });
			if (!row) throw new Error("insert failed");
			await tx.insert(walletAddresses).values({
				organizationId: c.orgId,
				accountId: row.id,
				branch: 0,
				index: 0,
				address,
				issuedAt: now,
				issuedByUserId: c.userId,
			});
			return {
				result: { ok: true, data: { id: row.id, address } },
				audit: {
					action: "wallet.account_created",
					target: `wallet_account:${row.id}`,
					after: {
						name: d.name,
						network: d.network,
						kind: "cold",
						purpose: d.purpose,
						keyFingerprint: fingerprint,
						firstAddress: address,
						historyFrom: d.historyFrom,
					},
				},
			};
		},
	);
	if (res.ok) revalidatePath(PATH, "layout");
	return res;
}

async function updateWalletAccountImpl(input: unknown): Promise<ActionResult> {
	const parsed = walletAccountUpdateSchema.safeParse(input);
	const c = await requireWallet({ wallet: ["manage"] });
	if (!parsed.success) return fromZod(parsed.error);
	const { id, name, custodyWalletId } = parsed.data;
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select({
				name: walletAccounts.name,
				custodyWalletId: walletAccounts.custodyWalletId,
			})
			.from(walletAccounts)
			.where(
				and(
					eq(walletAccounts.id, id),
					eq(walletAccounts.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!before) return { result: fail("notFound"), audit: [] };
		const after = {
			name,
			custodyWalletId: await custodyWalletOf(tx, c.orgId, custodyWalletId),
		};
		await tx.update(walletAccounts).set(after).where(eq(walletAccounts.id, id));
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "wallet.account_updated",
				target: `wallet_account:${id}`,
				before,
				after,
			},
		};
	});
	if (res.ok) revalidatePath(PATH, "layout");
	return res;
}

// Stilllegen: der Job liest das Konto nicht mehr; Bewegungen bleiben.
async function retireWalletAccountImpl(input: unknown): Promise<ActionResult> {
	const parsed = accountIdSchema.safeParse(input);
	const c = await requireWallet({ wallet: ["manage"] });
	if (!parsed.success) return fromZod(parsed.error);
	const { id } = parsed.data;
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const [row] = await tx
			.update(walletAccounts)
			.set({ status: "retired" })
			.where(
				and(
					eq(walletAccounts.id, id),
					eq(walletAccounts.organizationId, c.orgId),
					eq(walletAccounts.status, "active"),
				),
			)
			.returning({ id: walletAccounts.id, name: walletAccounts.name });
		if (!row) return { result: fail("notFound"), audit: [] };
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "wallet.account_retired",
				target: `wallet_account:${id}`,
				before: { status: "active" },
				after: { status: "retired", name: row.name },
			},
		};
	});
	if (res.ok) revalidatePath(PATH, "layout");
	return res;
}

// Empfangsadresse ausgeben. Bitcoin: je Zahlung eine neue Adresse (keine
// Wiederverwendung); höchstens GAP_LIMIT unbenutzte am Stück — danach kommt
// die älteste unbenutzte zurück, damit jede Wallet-Software sie beim
// Wiederherstellen aus der Seed-Phrase noch findet. Ethereum: eine Adresse
// je Konto (Kontomodell).
async function issueReceiveAddressImpl(
	input: unknown,
): Promise<ActionResult<{ address: string; index: number; reused: boolean }>> {
	const parsed = receiveAddressSchema.safeParse(input);
	const c = await requireWallet();
	if (!parsed.success) return fromZod(parsed.error);
	const { accountId, label } = parsed.data;
	const res = await mutateOrg<
		ActionResult<{ address: string; index: number; reused: boolean }>
	>(toOrgCtx(c), async (tx) => {
		const [account] = await tx
			.select()
			.from(walletAccounts)
			.where(
				and(
					eq(walletAccounts.id, accountId),
					eq(walletAccounts.organizationId, c.orgId),
					eq(walletAccounts.status, "active"),
				),
			)
			.limit(1);
		if (!account) return { result: fail("notFound"), audit: [] };
		const branch0 = and(
			eq(walletAddresses.accountId, account.id),
			eq(walletAddresses.branch, 0),
		);
		if (NETWORKS[account.network].chain === "ethereum") {
			const [first] = await tx
				.select({ address: walletAddresses.address })
				.from(walletAddresses)
				.where(and(branch0, eq(walletAddresses.index, 0)))
				.limit(1);
			if (!first) return { result: fail("notFound"), audit: [] };
			return {
				result: {
					ok: true,
					data: { address: first.address, index: 0, reused: true },
				},
				audit: [],
			};
		}
		const [used] = await tx
			.select({ max: sql<number | null>`max(${walletAddresses.index})` })
			.from(walletAddresses)
			.where(and(branch0, isNotNull(walletAddresses.firstSeenAt)));
		const unusedRun = account.nextReceiveIndex - ((used?.max ?? -1) + 1);
		if (unusedRun >= GAP_LIMIT) {
			const [oldest] = await tx
				.select({
					address: walletAddresses.address,
					index: walletAddresses.index,
				})
				.from(walletAddresses)
				.where(
					and(
						branch0,
						isNotNull(walletAddresses.issuedAt),
						isNull(walletAddresses.firstSeenAt),
					),
				)
				.orderBy(asc(walletAddresses.index))
				.limit(1);
			if (oldest)
				return {
					result: { ok: true, data: { ...oldest, reused: true } },
					audit: [],
				};
		}
		const index = account.nextReceiveIndex;
		const { hd } = parseAccountKey(account.accountKey, account.network);
		const address = deriveAddress(hd, account.network, 0, index);
		// Index fortschreiben — nur wenn ihn niemand parallel vergeben hat
		const bumped = await tx
			.update(walletAccounts)
			.set({ nextReceiveIndex: index + 1 })
			.where(
				and(
					eq(walletAccounts.id, account.id),
					eq(walletAccounts.nextReceiveIndex, index),
				),
			)
			.returning({ id: walletAccounts.id });
		if (bumped.length === 0) return { result: fail("busy"), audit: [] };
		const now = new Date();
		await tx
			.insert(walletAddresses)
			.values({
				organizationId: c.orgId,
				accountId: account.id,
				branch: 0,
				index,
				address,
				label,
				issuedAt: now,
				issuedByUserId: c.userId,
			})
			.onConflictDoUpdate({
				target: [
					walletAddresses.accountId,
					walletAddresses.branch,
					walletAddresses.index,
				],
				set: { label, issuedAt: now, issuedByUserId: c.userId },
			});
		return {
			result: { ok: true, data: { address, index, reused: false } },
			audit: {
				action: "wallet.address_issued",
				target: `wallet_account:${account.id}`,
				after: { index, address, label },
			},
		};
	});
	if (res.ok) revalidatePath(`${PATH}/empfangen`);
	return res;
}

// Watchlist der Person (nur Paare aus dem Katalog, Reihenfolge wie gewählt)
async function saveWatchlistImpl(input: unknown): Promise<ActionResult> {
	const parsed = watchlistSchema.safeParse(input);
	const c = await requireWallet();
	if (!parsed.success) return fromZod(parsed.error);
	await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		await upsertWalletPreferences(tx, c.orgId, c.userId, {
			pairs: parsed.data.pairs,
		});
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "wallet.watchlist_updated",
				target: `user:${c.userId}`,
				after: { pairs: parsed.data.pairs },
			},
		};
	});
	revalidatePath(PATH, "layout");
	return { ok: true, data: undefined };
}

// Einführung: Schritt abgeschlossen (Stand läuft nie rückwärts); der letzte
// Schritt schließt die Einführung ab
async function advanceWalletIntroImpl(input: unknown): Promise<ActionResult> {
	const parsed = introStepSchema.safeParse(input);
	const c = await requireWallet();
	if (!parsed.success) return fromZod(parsed.error);
	const { step } = parsed.data;
	const last = step === INTRO_STEPS[INTRO_STEPS.length - 1];
	await mutateOrg(toOrgCtx(c), async (tx) => {
		const prefs = await getWalletPreferences(tx, c.orgId, c.userId);
		await upsertWalletPreferences(tx, c.orgId, c.userId, {
			introStep: laterStep(prefs.introStep, step),
			...(last && !prefs.introCompletedAt
				? { introCompletedAt: new Date() }
				: {}),
		});
		return {
			result: null,
			audit:
				last && !prefs.introCompletedAt
					? { action: "wallet.intro_completed", target: `user:${c.userId}` }
					: [],
		};
	});
	revalidatePath(PATH, "layout");
	return { ok: true, data: undefined };
}

// „Später“: Startseite ohne Umleitung; die Einführung bleibt erreichbar
async function deferWalletIntroImpl(): Promise<ActionResult> {
	const c = await requireWallet();
	await mutateOrg(toOrgCtx(c), async (tx) => {
		await upsertWalletPreferences(tx, c.orgId, c.userId, {
			introDeferredAt: new Date(),
		});
		return {
			result: null,
			audit: { action: "wallet.intro_deferred", target: `user:${c.userId}` },
		};
	});
	revalidatePath(PATH, "layout");
	return { ok: true, data: undefined };
}

export const createWalletAccount = safeAction(
	"createWalletAccount",
	createWalletAccountImpl,
);
export const updateWalletAccount = safeAction(
	"updateWalletAccount",
	updateWalletAccountImpl,
);
export const retireWalletAccount = safeAction(
	"retireWalletAccount",
	retireWalletAccountImpl,
);
export const issueReceiveAddress = safeAction(
	"issueReceiveAddress",
	issueReceiveAddressImpl,
);
export const saveWatchlist = safeAction("saveWatchlist", saveWatchlistImpl);
export const advanceWalletIntro = safeAction(
	"advanceWalletIntro",
	advanceWalletIntroImpl,
);
export const deferWalletIntro = safeAction(
	"deferWalletIntro",
	deferWalletIntroImpl,
);
