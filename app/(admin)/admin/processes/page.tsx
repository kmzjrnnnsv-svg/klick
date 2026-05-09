import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { listAllTemplates } from "@/app/actions/admin";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { db } from "@/db";
import { users } from "@/db/schema";

export default async function AdminProcessesPage() {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");
	const [me] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (me?.role !== "admin") redirect("/post-login");

	const t = await getTranslations("AdminProcesses");
	const fmt = await getFormatter();
	const list = await listAllTemplates();

	const byCompany = new Map<string, typeof list>();
	for (const r of list) {
		const arr = byCompany.get(r.companyName) ?? [];
		arr.push(r);
		byCompany.set(r.companyName, arr);
	}

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-4xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-5">
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
				</header>

				{list.length === 0 ? (
					<p className="rounded-sm border border-border border-dashed p-8 text-center text-muted-foreground text-sm">
						{t("empty")}
					</p>
				) : (
					<div className="space-y-6">
						{Array.from(byCompany.entries()).map(([company, templates]) => (
							<section key={company}>
								<h2 className="mb-2 font-serif-display text-base">
									{company}{" "}
									<Link
										href={`/admin/companies/${templates[0]?.employerId}`}
										className="ml-1 font-mono text-[10px] text-muted-foreground hover:text-foreground hover:underline"
									>
										[#]
									</Link>
								</h2>
								<ul className="space-y-2">
									{templates.map((tt) => (
										<li
											key={tt.template.id}
											className="rounded-sm border border-border bg-background p-3"
										>
											<div className="flex items-baseline justify-between gap-3">
												<div>
													<p className="font-medium text-sm">
														{tt.template.name}
														{tt.template.isDefault && (
															<span className="ml-2 rounded-sm bg-primary/15 px-2 py-0.5 font-mono text-[10px] text-primary uppercase">
																{t("default")}
															</span>
														)}
													</p>
													{tt.template.description && (
														<p className="mt-0.5 text-muted-foreground text-xs">
															{tt.template.description}
														</p>
													)}
												</div>
												<span className="font-mono text-[10px] text-muted-foreground">
													{tt.stagesCount} {t("stages")} ·{" "}
													{fmt.dateTime(tt.template.updatedAt, {
														dateStyle: "short",
													})}
												</span>
											</div>
										</li>
									))}
								</ul>
							</section>
						))}
					</div>
				)}
				<p className="mt-3 text-muted-foreground text-xs">
					{t("footnote", { count: list.length })}
				</p>
			</main>
			<Footer />
		</>
	);
}
