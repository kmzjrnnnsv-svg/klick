import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { WalletLockStrip } from "@/components/wallet/lock-strip";
import { requireWalletAreaPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { roleLabel } from "@/lib/auth/memberships";
import { getOrgSummary, listUserMemberships } from "@/lib/auth/org";
import { WALLET_UNLOCK_MS } from "@/lib/auth/session-rules";
import { readOrg } from "@/lib/db/with-org";
import { buildWalletNav } from "@/lib/nav";
import { listNotifications, unreadCount } from "@/lib/notifications/query";

export const dynamic = "force-dynamic";

// Wallet-Bereich: eigene Navigation, gleicher Kopf wie Compliance. Das
// Layout verlangt nur wallet:read — entsperrt (Passkey) wird je Seite über
// requireWalletPage, damit /wallet/entsperren erreichbar bleibt.
export default async function WalletLayout({
	children,
}: {
	children: ReactNode;
}) {
	const ctx = await requireWalletAreaPage();
	const [org, memberships] = await Promise.all([
		getOrgSummary(ctx.orgId),
		listUserMemberships(ctx.userId),
	]);
	const bell = await readOrg(toOrgCtx(ctx), async (tx) => ({
		items: await listNotifications(tx, ctx.userId),
		unread: await unreadCount(tx, ctx.userId),
	}));
	const closesAt =
		ctx.walletUnlocked && ctx.walletUnlockedAt
			? new Date(ctx.walletUnlockedAt.getTime() + WALLET_UNLOCK_MS)
			: null;
	return (
		<AppShell
			ctx={ctx}
			orgName={org?.name ?? "Organisation"}
			orgs={memberships.map((m) => ({
				organizationId: m.organizationId,
				orgName: m.orgName,
				roleLabel: roleLabel(m.role),
				expired: m.expired,
			}))}
			groups={buildWalletNav()}
			bell={bell}
			area="wallet"
			walletEnabled
		>
			{closesAt && <WalletLockStrip closesAt={closesAt.toISOString()} />}
			{children}
		</AppShell>
	);
}
