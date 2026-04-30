import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { listAuditEntries } from "@/app/actions/admin";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { db } from "@/db";
import { users } from "@/db/schema";

export default async function AdminPage() {
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
	const entries = await listAuditEntries(200);

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-4xl flex-1 px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
				<header className="mb-8">
					<h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
						{t("title")}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						{t("subtitle")}
					</p>
				</header>

				<section>
					<h2 className="mb-3 font-medium text-sm">{t("auditTitle")}</h2>
					{entries.length === 0 ? (
						<div className="rounded-lg border border-border border-dashed p-10 text-center sm:p-16">
							<p className="text-muted-foreground text-sm">{t("auditEmpty")}</p>
						</div>
					) : (
						<ul className="divide-y divide-border rounded-lg border border-border bg-background font-mono text-xs">
							{entries.map((e) => (
								<li
									key={e.id}
									className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-3 py-2.5 sm:grid-cols-[170px_1fr_1fr]"
								>
									<span className="text-muted-foreground">
										{fmt.dateTime(e.at, {
											dateStyle: "short",
											timeStyle: "medium",
										})}
									</span>
									<span className="font-semibold">{e.action}</span>
									<span className="truncate text-muted-foreground sm:col-span-1 col-span-2">
										{e.target ?? ""}
										{e.actorUserId ? ` · ${e.actorUserId.slice(0, 8)}…` : ""}
									</span>
								</li>
							))}
						</ul>
					)}
					<p className="mt-3 text-muted-foreground text-xs">
						{t("auditFootnote")}
					</p>
				</section>

				<section className="mt-10">
					<h2 className="mb-3 font-medium text-sm">{t("comingTitle")}</h2>
					<ul className="space-y-1.5 text-muted-foreground text-sm">
						<li>{t("comingDynamicRoutes")}</li>
						<li>{t("comingTenants")}</li>
						<li>{t("comingConnectors")}</li>
					</ul>
				</section>
			</main>
			<Footer />
		</>
	);
}
