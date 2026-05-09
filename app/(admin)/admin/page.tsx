import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import {
	getPlatformStats,
	listAuditActions,
	listAuditEntries,
} from "@/app/actions/admin";
import { auth } from "@/auth";
import { AuditFilters } from "@/components/admin/audit-filters";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { db } from "@/db";
import { users } from "@/db/schema";

export default async function AdminPage({
	searchParams,
}: {
	searchParams: Promise<{ action?: string; q?: string; since?: string }>;
}) {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");

	const [user] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (user?.role !== "admin") redirect("/post-login");

	const t = await getTranslations("Admin");
	const fmt = await getFormatter();
	const params = await searchParams;
	const since =
		params.since === "1h" ||
		params.since === "24h" ||
		params.since === "7d" ||
		params.since === "30d"
			? params.since
			: undefined;
	const [entries, actions, stats] = await Promise.all([
		listAuditEntries({
			action: params.action || undefined,
			q: params.q || undefined,
			since,
		}),
		listAuditActions(),
		getPlatformStats(),
	]);

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-4xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-5 sm:mb-7">
					<h1 className="font-semibold text-xl tracking-tight sm:text-3xl">
						{t("title")}
					</h1>
					<p className="mt-1.5 text-muted-foreground text-sm leading-snug">
						{t("subtitle")}
					</p>
				</header>

				<dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
					<div className="rounded-sm border border-border bg-background p-3">
						<dt className="lv-eyebrow text-[0.5rem] text-muted-foreground">
							{t("statUsers")}
						</dt>
						<dd className="mt-1 font-serif-display text-2xl">
							{stats.users.total}
						</dd>
						<p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
							{stats.users.candidates}c · {stats.users.employers}e ·{" "}
							{stats.users.admins}a
						</p>
					</div>
					<div className="rounded-sm border border-border bg-background p-3">
						<dt className="lv-eyebrow text-[0.5rem] text-muted-foreground">
							{t("statCompanies")}
						</dt>
						<dd className="mt-1 font-serif-display text-2xl">
							{stats.companies}
						</dd>
						<p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
							{stats.tenants} {t("tenants")}
						</p>
					</div>
					<div className="rounded-sm border border-border bg-background p-3">
						<dt className="lv-eyebrow text-[0.5rem] text-muted-foreground">
							{t("statJobs")}
						</dt>
						<dd className="mt-1 font-serif-display text-2xl">
							{stats.jobs.total}
						</dd>
						<p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
							{stats.jobs.published} {t("statPublished")}
						</p>
					</div>
					<div className="rounded-sm border border-border bg-background p-3">
						<dt className="lv-eyebrow text-[0.5rem] text-muted-foreground">
							{t("statApplications")}
						</dt>
						<dd className="mt-1 font-serif-display text-2xl">
							{stats.applications.total}
						</dd>
						<p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
							{stats.applications.open} {t("statOpen")}
						</p>
					</div>
				</dl>

				<nav className="mb-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
					<Link
						href="/admin/users"
						className="rounded-sm border border-border bg-background p-4 transition-colors hover:bg-muted/30"
					>
						<p className="font-medium text-sm">{t("navUsers")}</p>
						<p className="mt-1 text-muted-foreground text-xs">
							{t("navUsersHint")}
						</p>
					</Link>
					<Link
						href="/admin/companies"
						className="rounded-sm border border-border bg-background p-4 transition-colors hover:bg-muted/30"
					>
						<p className="font-medium text-sm">{t("navCompanies")}</p>
						<p className="mt-1 text-muted-foreground text-xs">
							{t("navCompaniesHint")}
						</p>
					</Link>
					<Link
						href="/admin/processes"
						className="rounded-sm border border-border bg-background p-4 transition-colors hover:bg-muted/30"
					>
						<p className="font-medium text-sm">{t("navProcesses")}</p>
						<p className="mt-1 text-muted-foreground text-xs">
							{t("navProcessesHint")}
						</p>
					</Link>
					<Link
						href="/admin/insights"
						className="rounded-sm border border-border bg-background p-4 transition-colors hover:bg-muted/30"
					>
						<p className="font-medium text-sm">{t("insightsLink")}</p>
						<p className="mt-1 text-muted-foreground text-xs">
							{t("navInsightsHint")}
						</p>
					</Link>
					<Link
						href="/admin/cms"
						className="rounded-sm border border-border bg-background p-4 transition-colors hover:bg-muted/30"
					>
						<p className="font-medium text-sm">{t("cmsLink")}</p>
						<p className="mt-1 text-muted-foreground text-xs">
							{t("navCmsHint")}
						</p>
					</Link>
				</nav>

				<section>
					<h2 className="mb-2 font-medium text-sm">{t("auditTitle")}</h2>
					<AuditFilters actions={actions} />
					{entries.length === 0 ? (
						<div className="rounded-lg border border-border border-dashed p-8 text-center sm:p-14">
							<p className="text-muted-foreground text-sm">{t("auditEmpty")}</p>
						</div>
					) : (
						<ul className="divide-y divide-border rounded-lg border border-border bg-background font-mono text-xs">
							{entries.map((e) => {
								const payloadStr =
									e.payload && Object.keys(e.payload).length > 0
										? JSON.stringify(e.payload)
										: null;
								return (
									<li
										key={e.id}
										className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-3 py-2.5 sm:grid-cols-[170px_180px_1fr]"
									>
										<span className="text-muted-foreground">
											{fmt.dateTime(e.at, {
												dateStyle: "short",
												timeStyle: "medium",
											})}
										</span>
										<span className="font-semibold">{e.action}</span>
										<span className="col-span-2 truncate text-muted-foreground sm:col-span-1">
											{e.target ?? ""}
											{e.actorUserId ? ` · ${e.actorUserId.slice(0, 8)}…` : ""}
											{payloadStr && (
												<details className="mt-1">
													<summary className="cursor-pointer text-foreground/80">
														payload
													</summary>
													<pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-sm bg-muted p-2 text-[10px]">
														{payloadStr}
													</pre>
												</details>
											)}
										</span>
									</li>
								);
							})}
						</ul>
					)}
					<p className="mt-3 text-muted-foreground text-xs">
						{t("auditFootnote")}
					</p>
				</section>
			</main>
			<Footer />
		</>
	);
}
