import { and, eq, inArray, lte, or } from "drizzle-orm";
import {
	type AddressBookStatus,
	type WalletAddressBookEntry,
	walletAddressBook,
} from "@/db/schema/wallet";
import { audit } from "@/lib/audit";
import type { OrgTx } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { membersAllowed } from "@/lib/org/roles";
import type { WalletNetwork } from "@/lib/wallet/core/networks";
import type { SignerIntentView } from "@/lib/wallet/signer/client";

// Adressbuch (Plan Wallet, Phase 2): Stand jeder Zieladresse kommt aus dem
// Signer (Absicht „whitelist“). Aktiv erst nach Freigabe per
// Sicherheitsschlüssel und Ablauf der Wartezeit; Veto jederzeit.

// Stand aus der Sicht des Signers (rein)
export function addressBookStatus(
	view: Pick<
		SignerIntentView,
		"vetoed" | "cancelled" | "approvedAt" | "activeFrom" | "expiresAt"
	>,
	nowSec: number,
): AddressBookStatus {
	if (view.vetoed || view.cancelled) return "vetoed";
	if (view.approvedAt !== null)
		return view.activeFrom !== null && view.activeFrom <= nowSec
			? "active"
			: "cooling";
	if (nowSec > view.expiresAt) return "expired";
	return "proposed";
}

// Für die Anzeige: Wartezeit vorbei, aber der Job hat noch nicht gespeichert
export function effectiveStatus(
	row: Pick<WalletAddressBookEntry, "status" | "activeFrom">,
	now: Date,
): AddressBookStatus {
	if (row.status === "cooling" && row.activeFrom && row.activeFrom <= now)
		return "active";
	return row.status;
}

export async function listAddressBook(tx: OrgTx, orgId: string) {
	return tx
		.select()
		.from(walletAddressBook)
		.where(eq(walletAddressBook.organizationId, orgId))
		.orderBy(walletAddressBook.createdAt);
}

// aktive Ziele eines Netzes (für Senden)
export async function activeDestinations(
	tx: OrgTx,
	orgId: string,
	network: WalletNetwork,
	now = new Date(),
) {
	return tx
		.select()
		.from(walletAddressBook)
		.where(
			and(
				eq(walletAddressBook.organizationId, orgId),
				eq(walletAddressBook.network, network),
				or(
					eq(walletAddressBook.status, "active"),
					and(
						eq(walletAddressBook.status, "cooling"),
						lte(walletAddressBook.activeFrom, now),
					),
				),
			),
		);
}

export async function openAddressBookIntents(tx: OrgTx, orgId: string) {
	return tx
		.select({
			id: walletAddressBook.id,
			intentId: walletAddressBook.intentId,
			status: walletAddressBook.status,
		})
		.from(walletAddressBook)
		.where(
			and(
				eq(walletAddressBook.organizationId, orgId),
				inArray(walletAddressBook.status, ["proposed", "cooling"]),
			),
		);
}

// Stand aus dem Signer übernehmen (Job wallet-payouts); Übergänge ins Audit
export async function applyAddressBookViews(
	tx: OrgTx,
	orgId: string,
	views: ReadonlyMap<string, SignerIntentView>,
	now = new Date(),
): Promise<number> {
	const rows = await tx
		.select()
		.from(walletAddressBook)
		.where(
			and(
				eq(walletAddressBook.organizationId, orgId),
				inArray(walletAddressBook.status, ["proposed", "cooling"]),
			),
		);
	let changed = 0;
	const nowSec = Math.floor(now.getTime() / 1000);
	for (const row of rows) {
		const view = views.get(row.intentId);
		if (!view) continue;
		const status = addressBookStatus(view, nowSec);
		const approvedAt = view.approvedAt
			? new Date(view.approvedAt * 1000)
			: null;
		const activeFrom = view.activeFrom
			? new Date(view.activeFrom * 1000)
			: null;
		if (
			status === row.status &&
			approvedAt?.getTime() === row.approvedAt?.getTime() &&
			activeFrom?.getTime() === row.activeFrom?.getTime()
		)
			continue;
		changed += 1;
		await tx
			.update(walletAddressBook)
			.set({ status, approvedAt, activeFrom })
			.where(eq(walletAddressBook.id, row.id));
		await audit(
			tx,
			{ userId: null },
			{
				organizationId: orgId,
				action: `wallet.whitelist_${status}`,
				target: `wallet_address:${row.id}`,
				before: { status: row.status },
				after: {
					status,
					approvedAt: approvedAt?.toISOString() ?? null,
					activeFrom: activeFrom?.toISOString() ?? null,
				},
			},
		);
		if (status === "cooling" && row.status === "proposed")
			await notify(tx, {
				orgId,
				recipients: await membersAllowed(tx, orgId, { wallet: ["read"] }),
				actorUserId: null,
				kind: "security_alert",
				title: `Zieladresse freigegeben: „${row.label}“`,
				body: `Aktiv ab ${activeFrom?.toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) ?? "—"}. Bis dahin ist ein Veto im Adressbuch möglich.`,
				link: "/wallet/adressbuch",
			});
	}
	return changed;
}
