import { and, eq } from "drizzle-orm";
import { notificationPreferences, teamsIntegrations } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { teamsConfigured } from "@/lib/teams/config";
import type { ChannelPrefs } from "./channels";

// Einstellungen je Person einer Org und ob Teams dort zustellt — gelesen
// im Org-Kontext (RLS), von Mail-Jobs, Teams-Job und Einstellungen.

export async function loadChannelPrefs(
	tx: OrgTx,
	orgId: string,
): Promise<Map<string, ChannelPrefs>> {
	const rows = await tx
		.select({
			userId: notificationPreferences.userId,
			channels: notificationPreferences.channels,
			digestEnabled: notificationPreferences.digestEnabled,
		})
		.from(notificationPreferences)
		.where(eq(notificationPreferences.organizationId, orgId));
	return new Map(
		rows.map((r) => [
			r.userId,
			{ channels: r.channels ?? {}, digestEnabled: r.digestEnabled },
		]),
	);
}

// Teams stellt zu, wenn Klick konfiguriert ist und die Org freigegeben und
// eingeschaltet hat
export async function teamsActiveFor(
	tx: OrgTx,
	orgId: string,
): Promise<boolean> {
	if (!teamsConfigured()) return false;
	const [row] = await tx
		.select({ id: teamsIntegrations.id })
		.from(teamsIntegrations)
		.where(
			and(
				eq(teamsIntegrations.organizationId, orgId),
				eq(teamsIntegrations.status, "active"),
				eq(teamsIntegrations.enabled, true),
			),
		)
		.limit(1);
	return Boolean(row);
}
