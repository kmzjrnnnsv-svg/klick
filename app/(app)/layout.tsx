import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { gateApp } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import { roleAllows } from "@/lib/auth/permissions";
import { getJourneyCached } from "@/lib/compliance/page-data";
import { readOrg } from "@/lib/db/with-org";
import { buildNav } from "@/lib/nav";
import {
	listNotifications,
	overdueTaskCount,
	unreadCount,
} from "@/lib/notifications/query";
import { getOrgSettings, listOrgFrameworks } from "@/lib/org/queries";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
	const ctx = await gateApp();
	const org = await getOrgSummary(ctx.orgId);
	const { settings, fws, bell, overdueTasks } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => ({
			settings: await getOrgSettings(tx, ctx.orgId),
			fws: await listOrgFrameworks(tx, ctx.orgId),
			bell: {
				items: await listNotifications(tx, ctx.userId),
				unread: await unreadCount(tx, ctx.userId),
			},
			overdueTasks: await overdueTaskCount(tx, ctx.orgId, ctx.userId),
		}),
	);
	const groups = buildNav({
		frameworks: fws.map((f) => ({ slug: f.slug, name: f.name })),
		licenceStage: settings?.licenceStage ?? "0_vorbereitung",
		caspServices: settings?.caspServices ?? [],
		role: ctx.orgRole,
		// „Heute“ zählt überfällige eigene Aufgaben
		counts: { today: overdueTasks || undefined },
	});
	// Fortschritts-Chip (Etappe · %) nur für alle, die etwas tun können
	const journey = roleAllows(ctx.orgRole, { task: ["create"] })
		? await getJourneyCached(ctx)
		: null;
	return (
		<AppShell
			ctx={ctx}
			orgName={org?.name ?? "Organisation"}
			groups={groups}
			bell={bell}
			journey={
				journey
					? {
							stage: Math.min(journey.current + 1, journey.stages.length),
							total: journey.stages.length,
							pct: journey.pct,
						}
					: null
			}
		>
			{children}
		</AppShell>
	);
}
