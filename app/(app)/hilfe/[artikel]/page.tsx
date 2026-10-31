import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { NavIcon } from "@/components/shell/nav-icon";
import { ContainedScroll } from "@/components/ui/contained-scroll";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import {
	FRAMEWORK_BY_SLUG,
	REQUIREMENT_BY_KEY,
} from "@/lib/compliance/catalog";
import { readOrg } from "@/lib/db/with-org";
import { articleBySlug, articleVisible } from "@/lib/help";
import { HELP_ICONS } from "@/lib/help/icons";
import { routesForArticle } from "@/lib/help/routes";
import type { HelpSection } from "@/lib/help/types";
import type { NavIcon as NavIconName } from "@/lib/nav";
import { loadOrgNav } from "@/lib/org/nav";

// Seiten ohne eigenen Navigationseintrag (Unterseiten von Heute, Suche)
const SUBPAGES: Record<
	string,
	{
		label:
			| "route_tasks"
			| "route_approvals"
			| "route_responsibility"
			| "route_author"
			| "route_search";
		icon: NavIconName;
	}
> = {
	"/heute/aufgaben": { label: "route_tasks", icon: "list-checks" },
	"/heute/freigaben": { label: "route_approvals", icon: "git-pull-request" },
	"/heute/verantwortung": { label: "route_responsibility", icon: "users" },
	"/nachweise/verfassen": { label: "route_author", icon: "file-text" },
	"/suche": { label: "route_search", icon: "search" },
};

// /hilfe/<artikel> — ein Artikel des Hilfe-Wikis: Abschnitte mit Schritten,
// Rollen, Automatik, Fragen, Normbezüge mit Link in den Katalog und die
// Seiten in Klick, die der Artikel erklärt (nur die, die es in dieser
// Organisation gibt).
export default async function HelpArticlePage({
	params,
}: {
	params: Promise<{ artikel: string }>;
}) {
	const { artikel } = await params;
	const ctx = await requireOrgPage(undefined, { employees: true });
	const a = articleBySlug(artikel);
	if (!a || !articleVisible(a, ctx.orgRole)) notFound();
	const t = await getTranslations("Help");
	const tn = await getTranslations("Nav");
	const { groups } = await readOrg(toOrgCtx(ctx), (tx) => loadOrgNav(tx, ctx));
	const routes = routesForArticle(a.slug);
	const navItems = groups.flatMap((g) => g.items).filter((i) => !i.phase);
	const pages = routes.flatMap((href) => {
		const item = navItems.find((i) => i.href === href);
		if (item)
			return [
				{
					href,
					icon: item.icon,
					label: item.label ?? (item.labelKey ? tn(item.labelKey) : item.key),
				},
			];
		// Unterseiten nur, wenn ihre Elternseite in dieser Org sichtbar ist
		const sub = SUBPAGES[href];
		const parent = `/${href.split("/")[1]}`;
		return sub && navItems.some((i) => i.href === parent)
			? [{ href, icon: sub.icon, label: t(sub.label) }]
			: [];
	});
	// Katalogseiten sind für Mitarbeitende gesperrt: dort ohne Link
	const linkNorms = ctx.orgRole !== "employee";
	const norms = (a.norms ?? []).flatMap((n) => {
		const req = REQUIREMENT_BY_KEY.get(n.key);
		if (!req) return [];
		const fw = FRAMEWORK_BY_SLUG.get(req.framework);
		// „DORA — Digital Operational Resilience Act“ → „DORA“
		const fwName = (fw?.name ?? req.framework).split(" — ")[0];
		return [{ ...n, req, fwName }];
	});
	const related = (a.related ?? [])
		.map((s) => articleBySlug(s))
		.filter(
			(r): r is NonNullable<typeof r> =>
				r !== undefined && articleVisible(r, ctx.orgRole),
		);
	const toc = [
		...a.sections.map((s) => ({ id: s.id, label: s.heading })),
		...(a.roles?.length ? [{ id: "rollen", label: t("roles") }] : []),
		...(a.automation?.length
			? [{ id: "automatik", label: t("automation") }]
			: []),
		...(a.faq?.length ? [{ id: "fragen", label: t("faq") }] : []),
		...(norms.length ? [{ id: "normen", label: t("norms") }] : []),
	];
	return (
		<>
			<PageHeader
				back={{ href: "/hilfe", label: t("title") }}
				title={a.title}
				lead={a.summary}
			/>
			<div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
				<article className="flex min-w-0 max-w-prose flex-col gap-10">
					{a.sections.map((s) => (
						<Section key={s.id} section={s} tip={t("tip")} />
					))}
					{a.roles?.length ? (
						<Block id="rollen" title={t("roles")}>
							<Bullets items={a.roles} />
						</Block>
					) : null}
					{a.automation?.length ? (
						<Block id="automatik" title={t("automation")}>
							<Bullets items={a.automation} />
						</Block>
					) : null}
					{a.faq?.length ? (
						<Block id="fragen" title={t("faq")}>
							<div className="list-inset overflow-hidden rounded-2xl bg-card">
								{a.faq.map((f) => (
									<details key={f.q} className="group">
										<summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
											<span className="min-w-0">{f.q}</span>
											<ChevronDown
												aria-hidden="true"
												className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
											/>
										</summary>
										<p className="px-4 pb-4 text-body text-pretty text-muted-foreground">
											{f.a}
										</p>
									</details>
								))}
							</div>
						</Block>
					) : null}
					{norms.length ? (
						<Block id="normen" title={t("norms")}>
							<p className="text-body text-pretty text-muted-foreground">
								{t("normsLead")}
							</p>
							<ListGroup>
								<ListSection footer={t("normsNote")}>
									{norms.map((n) => (
										<ListRow
											key={n.key}
											title={
												<>
													<span className="font-medium">{n.fwName}</span>{" "}
													<span className="whitespace-nowrap">
														{n.req.code}
													</span>
													{" · "}
													{n.req.title}
												</>
											}
											subtitle={n.why}
											href={
												linkNorms
													? `/rahmenwerke/${n.req.framework}/${encodeURIComponent(n.req.code)}`
													: undefined
											}
										/>
									))}
								</ListSection>
							</ListGroup>
						</Block>
					) : null}
					{related.length ? (
						<ListGroup>
							<ListSection title={t("related")}>
								{related.map((r) => (
									<ListRow
										key={r.slug}
										icon={
											<NavIcon name={HELP_ICONS[r.slug] ?? "circle-help"} />
										}
										title={r.title}
										href={`/hilfe/${r.slug}`}
									/>
								))}
							</ListSection>
						</ListGroup>
					) : null}
				</article>
				<ContainedScroll
					as="aside"
					className="order-first flex flex-col gap-6 self-start lg:sticky lg:top-20 lg:order-none lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pb-4"
				>
					{pages.length ? (
						<ListGroup>
							<ListSection title={t("toPage")}>
								{pages.map((p) => (
									<ListRow
										key={p.href}
										icon={<NavIcon name={p.icon} />}
										title={p.label}
										href={p.href}
									/>
								))}
							</ListSection>
						</ListGroup>
					) : null}
					{toc.length > 1 && (
						<nav aria-label={t("onThisPage")} className="hidden lg:block">
							<h2 className="mb-2 px-4 font-semibold text-foreground text-subhead">
								{t("onThisPage")}
							</h2>
							<ul className="flex flex-col">
								{toc.map((x) => (
									<li key={x.id}>
										<Link
											href={`#${x.id}`}
											className="block rounded-lg px-4 py-1.5 text-footnote text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											{x.label}
										</Link>
									</li>
								))}
							</ul>
						</nav>
					)}
				</ContainedScroll>
			</div>
		</>
	);
}

function Block({
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section
			id={id}
			aria-labelledby={`${id}-h`}
			className="flex flex-col gap-3"
		>
			<h2
				id={`${id}-h`}
				className="scroll-mt-20 font-semibold text-foreground text-title-3 text-balance"
			>
				{title}
			</h2>
			{children}
		</section>
	);
}

function Bullets({ items }: { items: readonly string[] }) {
	return (
		<ul className="flex list-disc flex-col gap-1.5 pl-6 text-body text-pretty marker:text-muted-foreground">
			{items.map((x) => (
				<li key={x}>{x}</li>
			))}
		</ul>
	);
}

function Section({ section: s, tip }: { section: HelpSection; tip: string }) {
	return (
		<Block id={s.id} title={s.heading}>
			{s.body?.map((p) => (
				<p key={p} className="text-body text-pretty">
					{p}
				</p>
			))}
			{s.steps?.length ? (
				<ol className="flex list-decimal flex-col gap-2 pl-6 text-body text-pretty marker:font-semibold marker:text-muted-foreground">
					{s.steps.map((x) => (
						<li key={x} className="pl-1">
							{x}
						</li>
					))}
				</ol>
			) : null}
			{s.list?.length ? <Bullets items={s.list} /> : null}
			{s.tip && (
				<p className="rounded-2xl bg-card px-4 py-3 text-subhead text-pretty">
					<span className="font-semibold">{tip}: </span>
					{s.tip}
				</p>
			)}
		</Block>
	);
}
