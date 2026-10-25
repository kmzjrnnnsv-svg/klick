import type { ReactNode } from "react";
import { ResponsibleOptionsProvider } from "@/components/entity/responsible-context";
import { AppShell } from "@/components/shell/app-shell";
import { gateApp } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { roleLabel } from "@/lib/auth/memberships";
import { getOrgSummary, listUserMemberships } from "@/lib/auth/org";
import { responsibleOptions } from "@/lib/compliance/function-holders-service";
import { readOrg } from "@/lib/db/with-org";
import { listNotifications, unreadCount } from "@/lib/notifications/query";
import { loadOrgNav } from "@/lib/org/nav";
import { orgRoleNames } from "@/lib/org/roles";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
	const ctx = await gateApp();
	const [org, memberships] = await Promise.all([
		getOrgSummary(ctx.orgId),
		listUserMemberships(ctx.userId),
	]);
	const { groups, bell, functions, roleNames } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => ({
			...(await loadOrgNav(tx, ctx)),
			functions: await responsibleOptions(tx, ctx.orgId),
			roleNames: await orgRoleNames(tx, ctx.orgId),
			bell: {
				items: await listNotifications(tx, ctx.userId),
				unread: await unreadCount(tx, ctx.userId),
			},
		}),
	);
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
			groups={groups}
			bell={bell}
		>
			<ResponsibleOptionsProvider value={functions} roleNames={roleNames}>
				{children}
			</ResponsibleOptionsProvider>
		</AppShell>
	);
}
