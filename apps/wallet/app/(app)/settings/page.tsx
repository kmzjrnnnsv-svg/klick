import { NavIcon } from "@wallet/components/shell/nav-icon";
import { requireOrgPage } from "@wallet/lib/auth/gates";
import { toOrgCtx } from "@wallet/lib/auth/guards";
import { roleAllows } from "@wallet/lib/auth/permissions";
import { readOrg } from "@wallet/lib/db/with-org";
import { settingsGroups, walletNav } from "@wallet/lib/nav";
import {
	isOwnSigner,
	loadSignerAnchor,
} from "@wallet/lib/wallet/signer/context";
import { signerState } from "@wallet/lib/wallet/signer/status";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";

export const metadata: Metadata = { title: "Einstellungen" };

// /settings — Ziel des Tabs „Einstellungen“: alle Seiten ohne eigenen Tab als
// gruppierte Liste (Kurse, Auszahlungen, Adressbuch, Sicherheit, Mitglieder,
// Protokoll, Compliance-Export), gleiche Ableitung wie die Seitenleiste.
export default async function SettingsPage() {
	const ctx = await requireOrgPage("/settings");
	const [signer, anchor] = await Promise.all([
		signerState(ctx.orgId),
		readOrg(toOrgCtx(ctx), (tx) => loadSignerAnchor(tx, ctx.orgId)),
	]);
	const send = isOwnSigner(signer.state, anchor);
	const groups = settingsGroups(
		walletNav({
			send,
			members: roleAllows(ctx.role, "members:read"),
			audit: roleAllows(ctx.role, "audit:read"),
			exportManage: roleAllows(ctx.role, "export:manage"),
			access: roleAllows(ctx.role, "settings:update"),
			mandates: roleAllows(ctx.role, "wallet:initiate"),
		}),
		send,
	);
	const t = await getTranslations("Shell");
	return (
		<>
			<PageHeader title={t("settings")} />
			<ListGroup className="max-w-2xl">
				{groups.map((g) => (
					<ListSection key={g.key} title={t(g.labelKey ?? "groupWallet")}>
						{g.items.map((i) => (
							<ListRow
								key={i.key}
								icon={<NavIcon name={i.icon} />}
								title={t(i.labelKey)}
								href={i.href}
							/>
						))}
					</ListSection>
				))}
			</ListGroup>
		</>
	);
}
