import { AppShell } from "@wallet/components/shell/app-shell";
import { requireOrgPage } from "@wallet/lib/auth/gates";
import { myNotifications } from "@wallet/lib/orgs/members";
import { listMemberships } from "@wallet/lib/orgs/memberships";

// Angemeldeter Bereich: Org-Kontext + Rahmen. Seiten prüfen zusätzlich
// selbst (Layout und Seite rendern parallel).
export default async function AppLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const ctx = await requireOrgPage("/");
	const [orgs, bell] = await Promise.all([
		listMemberships(ctx.userId),
		myNotifications({ orgId: ctx.orgId, userId: ctx.userId }),
	]);
	return (
		<AppShell
			ctx={ctx}
			orgs={orgs}
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
