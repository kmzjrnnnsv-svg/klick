import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { getCompanyDetail } from "@/app/actions/admin";
import { auth } from "@/auth";
import { CompanyEditForm } from "@/components/admin/company-edit-form";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { db } from "@/db";
import { users } from "@/db/schema";

const STATUS_TONES: Record<string, string> = {
	draft: "bg-muted text-muted-foreground",
	published: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	archived: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export default async function AdminCompanyDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");
	const [me] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (me?.role !== "admin") redirect("/post-login");

	const { id } = await params;
	const t = await getTranslations("AdminCompanies");
	const fmt = await getFormatter();
	const detail = await getCompanyDetail(id);
	if (!detail) notFound();

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<Link
					href="/admin/companies"
					className="text-muted-foreground text-xs hover:text-foreground"
				>
					← {t("title")}
				</Link>
				<header className="mt-1 mb-6 border-border border-b pb-6">
					<div className="flex flex-wrap items-baseline justify-between gap-3">
						<h1 className="font-semibold text-xl tracking-tight sm:text-3xl">
							{detail.employer.companyName}
						</h1>
						{detail.employer.isAgency && (
							<span className="rounded-sm bg-primary/15 px-2 py-0.5 font-mono text-[10px] text-primary uppercase">
								{t("agency")}
							</span>
						)}
					</div>
					<p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-muted-foreground text-sm">
						<span>
							{t("owner")}: {detail.owner?.email ?? t("noOwner")}
							{detail.owner?.name ? ` (${detail.owner.name})` : ""}
						</span>
						<Link
							href={`/admin/companies/${detail.employer.id}/owner`}
							className="text-primary text-xs hover:underline"
						>
							{t("manageTeam")} →
						</Link>
					</p>
					<p className="mt-1 text-muted-foreground text-xs">
						{t("tenant")}: {detail.tenantSlug ?? "—"} · ID:{" "}
						<span className="font-mono">{detail.employer.id.slice(0, 8)}</span>
					</p>
					<p className="mt-1 text-muted-foreground text-xs">
						{t("memberSince")}:{" "}
						{fmt.dateTime(detail.employer.createdAt, { dateStyle: "long" })}
					</p>
				</header>

				<dl className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
					<div className="rounded-sm border border-border bg-background p-3">
						<dt className="lv-eyebrow text-[0.5rem] text-muted-foreground">
							{t("statJobs")}
						</dt>
						<dd className="mt-1 font-serif-display text-2xl">
							{detail.jobs.length}
						</dd>
					</div>
					<div className="rounded-sm border border-border bg-background p-3">
						<dt className="lv-eyebrow text-[0.5rem] text-muted-foreground">
							{t("statApplications")}
						</dt>
						<dd className="mt-1 font-serif-display text-2xl">
							{detail.applicationsTotal}
						</dd>
					</div>
					<div className="rounded-sm border border-border bg-background p-3">
						<dt className="lv-eyebrow text-[0.5rem] text-muted-foreground">
							{t("statTemplates")}
						</dt>
						<dd className="mt-1 font-serif-display text-2xl">
							{detail.templatesCount}
						</dd>
					</div>
				</dl>

				<section className="mb-8">
					<h2 className="mb-3 font-medium text-sm">{t("editTitle")}</h2>
					<CompanyEditForm
						employerId={detail.employer.id}
						initial={{
							companyName: detail.employer.companyName,
							website: detail.employer.website,
							description: detail.employer.description,
							isAgency: detail.employer.isAgency,
						}}
					/>
				</section>

				<section className="mb-8">
					<h2 className="mb-3 font-medium text-sm">{t("jobsTitle")}</h2>
					{detail.jobs.length === 0 ? (
						<p className="rounded-sm border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
							{t("noJobs")}
						</p>
					) : (
						<ul className="divide-y divide-border rounded-sm border border-border bg-background">
							{detail.jobs.map((j) => (
								<li
									key={j.id}
									className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-3 py-2 text-xs"
								>
									<span className="truncate">{j.title}</span>
									<span
										className={`shrink-0 rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase ${
											STATUS_TONES[j.status] ?? ""
										}`}
									>
										{j.status}
									</span>
									<span className="shrink-0 font-mono text-[10px] text-muted-foreground">
										{j.applicationCount} {t("apps")}
									</span>
									<span className="shrink-0 font-mono text-[10px] text-muted-foreground">
										{fmt.dateTime(j.createdAt, { dateStyle: "short" })}
									</span>
								</li>
							))}
						</ul>
					)}
				</section>
			</main>
			<Footer />
		</>
	);
}
