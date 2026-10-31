import type { ReactNode } from "react";
import {
	AnnouncementBanner,
	type BannerItem,
} from "@/components/announcements/announcement-banner";
import { ResponsibleOptionsProvider } from "@/components/entity/responsible-context";
import { AppShell } from "@/components/shell/app-shell";
import { bannersFor, needsAcknowledgement } from "@/lib/announcements/rules";
import { gateApp } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { roleLabel } from "@/lib/auth/memberships";
import { getOrgSummary, listUserMemberships } from "@/lib/auth/org";
import { responsibleOptions } from "@/lib/compliance/function-holders-service";
import { acknowledgedIds, openAnnouncementsFor } from "@/lib/db/announcements";
import { deciderIds } from "@/lib/db/platform-access";
import { readOrg } from "@/lib/db/with-org";
import { listNotifications, unreadCount } from "@/lib/notifications/query";
import { loadOrgNav } from "@/lib/org/nav";
import { orgRoleNames } from "@/lib/org/roles";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
	const ctx = await gateApp();
	const now = new Date();
	const [org, memberships, announcements] = await Promise.all([
		getOrgSummary(ctx.orgId),
		listUserMemberships(ctx.userId),
		openAnnouncementsFor(ctx.orgId, now),
	]);
	const { groups, bell, functions, roleNames, acked } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => ({
			...(await loadOrgNav(tx, ctx)),
			functions: await responsibleOptions(tx, ctx.orgId),
			roleNames: await orgRoleNames(tx, ctx.orgId),
			acked:
				announcements.length > 0
					? await acknowledgedIds(tx, ctx.orgId)
					: new Set<string>(),
			bell: {
				items: await listNotifications(tx, ctx.userId),
				unread: await unreadCount(tx, ctx.userId),
			},
		}),
	);
	// Mitteilungen von Klick (Admin-Portal, Teil 6)
	const banners = bannersFor(announcements, ctx.orgId, now, acked);
	const canAcknowledge = banners.some((b) => needsAcknowledgement(b.kind))
		? (await deciderIds(ctx.orgId)).includes(ctx.userId)
		: false;
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	});
	const items: BannerItem[] = banners.map((b) => ({
		id: b.id,
		kind: b.kind,
		title: b.title,
		body: b.body,
		window:
			b.kind === "maintenance"
				? b.endsAt
					? fmt.formatRange(b.startsAt, b.endsAt)
					: fmt.format(b.startsAt)
				: null,
	}));
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
				{items.length > 0 && (
					<div className="mb-6 flex flex-col gap-3">
						{items.map((item) => (
							<AnnouncementBanner
								key={item.id}
								item={item}
								canAcknowledge={canAcknowledge}
							/>
						))}
					</div>
				)}
				{children}
			</ResponsibleOptionsProvider>
		</AppShell>
	);
}
