import { AppShell } from "@wallet/components/shell/app-shell";
import { SignerBanner } from "@wallet/components/wallet/signer-banner";
import { requireOrgPage } from "@wallet/lib/auth/gates";
import { toOrgCtx } from "@wallet/lib/auth/guards";
import { readOrg } from "@wallet/lib/db/with-org";
import { myNotifications } from "@wallet/lib/orgs/members";
import { listMemberships } from "@wallet/lib/orgs/memberships";
import {
	isOwnSigner,
	loadSignerAnchor,
} from "@wallet/lib/wallet/signer/context";
import { signerState } from "@wallet/lib/wallet/signer/status";

// Angemeldeter Bereich: Org-Kontext + Rahmen. Wallet-Daten verlangt jede
// Seite selbst entsperrt (Layout und Seite rendern parallel); Senden gibt
// es nur mit dem eigenen Signer dieser Org.
export default async function AppLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const ctx = await requireOrgPage("/");
	const [orgs, bell, signer, anchor] = await Promise.all([
		listMemberships(ctx.userId),
		myNotifications({ orgId: ctx.orgId, userId: ctx.userId }),
		signerState(ctx.orgId),
		readOrg(toOrgCtx(ctx), (tx) => loadSignerAnchor(tx, ctx.orgId)),
	]);
	const own = isOwnSigner(signer.state, anchor);
	return (
		<AppShell
			ctx={ctx}
			orgs={orgs}
			send={own}
			banner={
				own &&
				(signer.state === "frozen" || signer.state === "unreachable") && (
					<SignerBanner
						state={signer.state}
						reason={signer.hello?.frozen?.reason}
						since={anchor?.unreachableSince}
					/>
				)
			}
			bell={{
				unread: bell.unread,
				items: bell.items.map((n) => ({
					id: n.id,
					title: n.title,
					body: n.body,
					link: n.link,
					read: Boolean(n.readAt),
					at: n.createdAt.toISOString(),
				})),
			}}
		>
			{children}
		</AppShell>
	);
}
