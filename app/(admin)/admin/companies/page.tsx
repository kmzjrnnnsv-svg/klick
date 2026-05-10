import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { listAllCompanies } from "@/app/actions/admin";
import { auth } from "@/auth";
import { EmployerActions } from "@/components/admin/employer-actions";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { users } from "@/db/schema";
import { cn } from "@/lib/utils";

export default async function AdminCompaniesPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string }>;
}) {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");
	const [me] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (me?.role !== "admin") redirect("/post-login");

	const t = await getTranslations("AdminCompanies");
	const fmt = await getFormatter();
	const params = await searchParams;
	const list = await listAllCompanies({ q: params.q });

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-5xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-5 flex items-end justify-between gap-3">
					<div>
						<Link
							href="/admin"
							className="text-muted-foreground text-xs hover:text-foreground"
						>
							← {t("backToAdmin")}
						</Link>
						<h1 className="mt-1 font-semibold text-xl tracking-tight sm:text-3xl">
							{t("title")}
						</h1>
						<p className="mt-1.5 text-muted-foreground text-sm leading-snug">
							{t("subtitle")}
						</p>
					</div>
					<Link
						href="/admin/companies/new"
						className={cn(buttonVariants({ size: "sm" }))}
					>
						{t("newCompany")}
					</Link>
				</header>

				<form className="mb-4 flex gap-2" action="/admin/companies">
					<input
						type="search"
						name="q"
						defaultValue={params.q ?? ""}
						placeholder={t("searchPlaceholder")}
						className="flex-1 rounded-sm border border-border bg-background px-3 py-2 text-sm"
					/>
					<button
						type="submit"
						className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
					>
						{t("search")}
					</button>
				</form>

				{list.length === 0 ? (
					<p className="rounded-sm border border-border border-dashed p-8 text-center text-muted-foreground text-sm">
						{t("empty")}
					</p>
				) : (
					<ul className="space-y-2">
						{list.map((c) => (
							<li
								key={c.id}
								className="rounded-sm border border-border bg-background"
							>
								<Link
									href={`/admin/companies/${c.id}`}
									className="block p-4 transition-colors hover:bg-muted/30"
								>
									<div className="flex items-baseline justify-between gap-3">
										<div className="min-w-0">
											<div className="flex flex-wrap items-center gap-2">
												<h2 className="font-serif-display text-lg sm:text-xl">
													{c.companyName}
												</h2>
												{c.isAgency && (
													<span className="rounded-sm bg-primary/15 px-2 py-0.5 font-mono text-[10px] text-primary uppercase">
														{t("agency")}
													</span>
												)}
												{c.blockedAt && (
													<span className="rounded-sm bg-rose-500/10 px-2 py-0.5 font-mono text-[10px] text-rose-700 uppercase dark:text-rose-300">
														{t("blocked")}
													</span>
												)}
												{c.demoBatchId && (
													<span className="rounded-sm bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary uppercase">
														{t("demo")}
													</span>
												)}
											</div>
											<p className="mt-1 text-muted-foreground text-xs">
												{c.ownerEmail ?? "—"}
												{c.ownerName ? ` · ${c.ownerName}` : ""}
												{c.tenantSlug ? ` · ${c.tenantSlug}` : ""}
											</p>
										</div>
										<div className="shrink-0 text-right">
											<p className="font-mono text-[11px]">
												{c.publishedCount}/{c.jobCount}{" "}
												<span className="text-muted-foreground">
													{t("jobs")}
												</span>
											</p>
											<p className="mt-1 font-mono text-[10px] text-muted-foreground">
												{fmt.dateTime(c.createdAt, { dateStyle: "short" })}
											</p>
										</div>
									</div>
								</Link>
								<div className="border-border border-t px-4 py-2">
									<EmployerActions
										employerId={c.id}
										isBlocked={!!c.blockedAt}
									/>
								</div>
							</li>
						))}
					</ul>
				)}
				<p className="mt-3 text-muted-foreground text-xs">
					{t("footnote", { count: list.length })}
				</p>
			</main>
			<Footer />
		</>
	);
}
