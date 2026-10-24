import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { NavIcon } from "@/components/shell/nav-icon";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { readOrg } from "@/lib/db/with-org";
import { LIST_TABS, navTabs } from "@/lib/nav";
import { loadOrgNav } from "@/lib/org/nav";

// /bereich/<tab> — Ziel der Tabs „Umsetzen“, „Register“ und „Steuerung“ in
// der Tab-Leiste am Handy: die Seiten des Bereichs als gruppierte Liste (wie
// die iOS-Einstellungen). Inhalt aus derselben Navigation wie die Seitenleiste.
export default async function AreaPage({
	params,
}: {
	params: Promise<{ tab: string }>;
}) {
	const { tab } = await params;
	if (!(LIST_TABS as readonly string[]).includes(tab)) notFound();
	const ctx = await requireOrgPage();
	const { groups } = await readOrg(toOrgCtx(ctx), (tx) => loadOrgNav(tx, ctx));
	const area = navTabs(groups).find((x) => x.key === tab);
	if (!area) notFound();
	const t = await getTranslations("Nav");
	return (
		<>
			<PageHeader title={t(area.labelKey)} />
			<ListGroup className="max-w-2xl">
				{area.groups.map((g) => (
					<ListSection
						key={g.key}
						title={
							g.labelKey && g.labelKey !== area.labelKey
								? t(g.labelKey)
								: undefined
						}
					>
						{g.items.map((item) => (
							<ListRow
								key={item.key}
								icon={<NavIcon name={item.icon} />}
								title={
									item.label ?? (item.labelKey ? t(item.labelKey) : item.key)
								}
								href={item.phase ? undefined : item.href}
								value={item.phase ? t("comingSoon") : item.count || undefined}
							/>
						))}
					</ListSection>
				))}
			</ListGroup>
		</>
	);
}
