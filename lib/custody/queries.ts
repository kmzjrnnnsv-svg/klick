import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
	controlImplementations,
	controls,
	custodyReconciliations,
	keyCeremonies,
	type Wallet,
	type WalletKeyHolder,
	walletKeyHolders,
	wallets,
} from "@/db/schema";
import type { ImplStatus } from "@/db/schema/enums";
import { decryptMany, fieldAad } from "@/lib/crypto/org-dek";
import type { OrgTx } from "@/lib/db/with-org";
import { CUSTODY_CONTROLS, walletIssues } from "./wallet-rules";

// Verwahrung — Lader für Seiten und Actions (mit Org-Kontext).

export const holderLocationAad = (id: string) =>
	fieldAad("wallet_key_holders", id, "location");

export async function listWallets(tx: OrgTx, orgId: string, now = new Date()) {
	const [rows, holders] = await Promise.all([
		tx
			.select()
			.from(wallets)
			.where(eq(wallets.organizationId, orgId))
			.orderBy(asc(wallets.status), asc(wallets.code)),
		tx
			.select({
				walletId: walletKeyHolders.walletId,
				role: walletKeyHolders.role,
				status: walletKeyHolders.status,
				siteId: walletKeyHolders.siteId,
				vettedAt: walletKeyHolders.vettedAt,
				until: walletKeyHolders.until,
			})
			.from(walletKeyHolders)
			.where(eq(walletKeyHolders.organizationId, orgId)),
	]);
	return rows.map((w) => {
		const hs = holders.filter((h) => h.walletId === w.id);
		return {
			wallet: w,
			activeHolders: hs.filter((h) => h.status === "active").length,
			issues: walletIssues(w, hs, now),
		};
	});
}

export type WalletDetail = {
	wallet: Wallet;
	holders: (WalletKeyHolder & { location: string | null })[];
	ceremonies: (typeof keyCeremonies.$inferSelect)[];
};

export async function getWallet(
	tx: OrgTx,
	orgId: string,
	id: string,
): Promise<WalletDetail | null> {
	const [w] = await tx
		.select()
		.from(wallets)
		.where(and(eq(wallets.id, id), eq(wallets.organizationId, orgId)))
		.limit(1);
	if (!w) return null;
	const [holders, ceremonies] = await Promise.all([
		tx
			.select()
			.from(walletKeyHolders)
			.where(
				and(
					eq(walletKeyHolders.organizationId, orgId),
					eq(walletKeyHolders.walletId, id),
				),
			)
			.orderBy(asc(walletKeyHolders.status), asc(walletKeyHolders.createdAt)),
		tx
			.select()
			.from(keyCeremonies)
			.where(
				and(
					eq(keyCeremonies.organizationId, orgId),
					eq(keyCeremonies.walletId, id),
				),
			)
			.orderBy(desc(keyCeremonies.heldAt), desc(keyCeremonies.createdAt)),
	]);
	const locations = await decryptMany<{ location: string }>(
		tx,
		orgId,
		holders.map((h) => ({
			stored: h.locationEnc,
			aad: holderLocationAad(h.id),
		})),
	);
	return {
		wallet: w,
		holders: holders.map((h, i) => ({
			...h,
			location: locations[i]?.location ?? null,
		})),
		ceremonies,
	};
}

export async function listReconciliations(
	tx: OrgTx,
	orgId: string,
	limit = 60,
) {
	return tx
		.select()
		.from(custodyReconciliations)
		.where(eq(custodyReconciliations.organizationId, orgId))
		.orderBy(desc(custodyReconciliations.day))
		.limit(limit);
}

export async function lastReconciliationDay(
	tx: OrgTx,
	orgId: string,
): Promise<string | null> {
	const [r] = await tx
		.select({ day: custodyReconciliations.day })
		.from(custodyReconciliations)
		.where(eq(custodyReconciliations.organizationId, orgId))
		.orderBy(desc(custodyReconciliations.day))
		.limit(1);
	return r?.day ?? null;
}

// Status der Controls, die das Register belegt; ohne Umsetzung = null.
export async function custodyControlStatus(
	tx: OrgTx,
	orgId: string,
): Promise<{ code: string; title: string; status: ImplStatus | null }[]> {
	const rows = await tx
		.select({
			code: controls.code,
			title: controls.title,
			status: controlImplementations.status,
		})
		.from(controls)
		.leftJoin(
			controlImplementations,
			and(
				eq(controlImplementations.controlId, controls.id),
				eq(controlImplementations.organizationId, orgId),
			),
		)
		.where(inArray(controls.code, [...CUSTODY_CONTROLS]));
	return CUSTODY_CONTROLS.flatMap((code) => {
		const r = rows.find((x) => x.code === code);
		return r ? [{ code, title: r.title, status: r.status ?? null }] : [];
	});
}

// Umsetzung eines Controls der Org (für Wirksamkeitstests aus Zeremonien).
export async function implementationIdFor(
	tx: OrgTx,
	orgId: string,
	controlCode: string,
): Promise<string | null> {
	const [r] = await tx
		.select({ id: controlImplementations.id })
		.from(controlImplementations)
		.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
		.where(
			and(
				eq(controlImplementations.organizationId, orgId),
				eq(controls.code, controlCode),
			),
		)
		.limit(1);
	return r?.id ?? null;
}
