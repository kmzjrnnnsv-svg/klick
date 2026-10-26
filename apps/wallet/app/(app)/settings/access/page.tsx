import { AccessPanel } from "@wallet/components/settings/access-panel";
import { requireOrgPage } from "@wallet/lib/auth/gates";
import { toOrgCtx } from "@wallet/lib/auth/guards";
import { deviceBoundByUser } from "@wallet/lib/auth/security-keys";
import { currentAccessPolicy } from "@wallet/lib/orgs/access";
import { listMembers } from "@wallet/lib/orgs/members";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { normalizeIp } from "@/lib/net/ip";

export const metadata: Metadata = { title: "Zugang" };

// /settings/access — Zugangsregeln der Org (Härtung W): IP-Liste, nur
// Sicherheitsschlüssel, erlaubte Assets. Nur Inhaber:innen; Speichern mit
// Step-up und Aussperr-Schutz (eigene Adresse, eigene Schlüssel).
export default async function AccessSettingsPage() {
	const ctx = await requireOrgPage("/settings/access", "settings:update");
	const t = await getTranslations("Access");
	const tShell = await getTranslations("Shell");
	const [policy, members] = await Promise.all([
		currentAccessPolicy(ctx.orgId),
		listMembers(toOrgCtx(ctx)),
	]);
	const bound = await deviceBoundByUser(members.map((m) => m.userId));
	return (
		<>
			<PageHeader
				back={{ href: "/settings", label: tShell("settings") }}
				title={t("title")}
				lead={t("lead")}
			/>
			<AccessPanel
				policy={{
					network: policy.network.members,
					securityKeysOnly: policy.securityKeysOnly,
					allowedAssets: policy.allowedAssets,
					mandatesRequired: policy.mandatesRequired,
				}}
				myIp={normalizeIp(ctx.ip)}
				selfDeviceBound={bound.get(ctx.userId) === true}
				withoutKey={members
					.filter((m) => bound.get(m.userId) !== true)
					.map((m) => m.name || m.email)}
			/>
		</>
	);
}
