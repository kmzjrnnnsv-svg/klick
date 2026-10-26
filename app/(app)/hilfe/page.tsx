import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { NavIcon } from "@/components/shell/nav-icon";
import { Input } from "@/components/ui/input";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { requireOrgPage } from "@/lib/auth/gates";
import { articlesByArea, articlesFor, searchHelp } from "@/lib/help";
import { HELP_ICONS } from "@/lib/help/icons";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// /hilfe — Inhaltsverzeichnis des Hilfe-Wikis nach Bereichen, mit Suche
// (?q=). Für alle Rollen; Mitarbeitende sehen nur ihre Artikel.
export default async function HelpPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage(undefined, { employees: true });
	const q = (one((await searchParams).q) ?? "").trim();
	const t = await getTranslations("Help");
	const visible = articlesFor(ctx.orgRole);
	const hits = q.length >= 2 ? searchHelp(visible, q) : null;
	return (
		<>
			<PageHeader
				title={t("title")}
				lead={ctx.orgRole === "employee" ? t("leadEmployee") : t("lead")}
			/>
			<form method="get" action="/hilfe" className="mb-6 flex max-w-2xl gap-2">
				<Input
					name="q"
					type="search"
					defaultValue={q}
					placeholder={t("placeholder")}
					aria-label={t("searchLabel")}
					autoComplete="off"
				/>
			</form>
			<ListGroup className="max-w-2xl">
				{hits ? (
					<ListSection
						title={t("count", { n: hits.length, q })}
						footer={hits.length === 0 ? t("none", { q }) : undefined}
					>
						{hits.map((a) => (
							<ListRow
								key={a.slug}
								icon={<NavIcon name={HELP_ICONS[a.slug] ?? "circle-help"} />}
								title={a.title}
								subtitle={a.summary}
								href={`/hilfe/${a.slug}`}
							/>
						))}
					</ListSection>
				) : (
					articlesByArea(visible).map(({ area, articles }) => (
						<ListSection key={area} title={t(`area_${area}`)}>
							{articles.map((a) => (
								<ListRow
									key={a.slug}
									icon={<NavIcon name={HELP_ICONS[a.slug] ?? "circle-help"} />}
									title={a.title}
									subtitle={a.summary}
									href={`/hilfe/${a.slug}`}
								/>
							))}
						</ListSection>
					))
				)}
			</ListGroup>
		</>
	);
}
