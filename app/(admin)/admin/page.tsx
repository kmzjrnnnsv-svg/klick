import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { ListRow, ListSection } from "@/components/ui/list";
import { requirePlatformAdminPage } from "@/lib/auth/gates";
import { platformCounts } from "@/lib/db/global";

// Plattform-Admin: großer Titel, darunter die Bereiche als gruppierte Liste
// (Drill-down mit Chevron, Zahlen rechts in Grau) — Apple HIG
export default async function AdminHome() {
	await requirePlatformAdminPage();
	const t = await getTranslations("Admin");
	const counts = await platformCounts();
	const num = new Intl.NumberFormat("de-DE");
	return (
		<div className="flex max-w-2xl flex-col gap-6">
			<PageHeader title={t("title")} lead={t("lead")} />
			<ListSection>
				<ListRow
					href="/admin/orgs"
					title={t("orgs")}
					value={num.format(counts.organizations)}
				/>
				<ListRow
					href="/admin/users"
					title={t("users")}
					value={num.format(counts.users)}
				/>
				<ListRow href="/admin/audit" title={t("audit")} />
				<ListRow href="/admin/anfragen" title={t("inquiries")} />
				<ListRow href="/admin/preise" title={t("prices")} />
				<ListRow href="/admin/cms" title={t("cms")} />
			</ListSection>
		</div>
	);
}
