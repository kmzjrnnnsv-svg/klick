import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CmsEditor } from "@/components/admin/cms-editor";
import { requirePlatformAdminPage } from "@/lib/auth/gates";
import { getCmsPageBySlug, listCmsPages } from "@/lib/db/global";
import { cn } from "@/lib/utils";

export default async function AdminCmsPage({
	searchParams,
}: {
	searchParams: Promise<{ slug?: string }>;
}) {
	await requirePlatformAdminPage();
	const t = await getTranslations("Admin");
	const { slug } = await searchParams;
	const pages = await listCmsPages();
	const editing = slug ? await getCmsPageBySlug(slug) : null;
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	});
	return (
		<>
			<h1 className="mb-6 font-bold text-title-1">{t("cms")}</h1>
			<div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_2fr]">
				<nav
					aria-label={t("cms")}
					className="min-w-0 lg:sticky lg:top-20 lg:self-start"
				>
					<ul className="flex flex-col gap-1.5">
						{pages.map((p) => {
							const on = editing?.slug === p.slug;
							return (
								<li key={p.id}>
									<Link
										href={`/admin/cms?slug=${p.slug}`}
										scroll={false}
										aria-current={on ? "page" : undefined}
										className={cn(
											"flex flex-col gap-0.5 rounded-xl bg-card px-3 py-2.5 text-subhead transition-colors",
											on
												? "border-primary/50 bg-muted/60"
												: "border-border/60 hover:bg-muted/40",
										)}
									>
										<span className="truncate font-medium">{p.title}</span>
										<span className="flex min-w-0 flex-wrap gap-x-2 text-muted-foreground text-footnote">
											<span className="truncate font-mono" translate="no">
												{p.slug}
											</span>
											<span>{fmt.format(p.updatedAt)}</span>
										</span>
									</Link>
								</li>
							);
						})}
					</ul>
				</nav>
				<CmsEditor
					key={editing?.slug ?? "new"}
					initial={
						editing
							? { slug: editing.slug, title: editing.title, body: editing.body }
							: undefined
					}
				/>
			</div>
		</>
	);
}
