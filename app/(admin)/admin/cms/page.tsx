import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { listCmsPages } from "@/app/actions/cms";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { users } from "@/db/schema";

export default async function CmsListPage() {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");
	const [user] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (user?.role !== "admin") redirect("/post-login");

	const t = await getTranslations("AdminCms");
	const pages = await listCmsPages();

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-5 flex items-end justify-between gap-3">
					<div>
						<Link
							href="/admin"
							className="text-muted-foreground text-xs hover:text-foreground"
						>
							← Admin
						</Link>
						<h1 className="mt-0.5 font-semibold text-xl tracking-tight sm:text-3xl">
							{t("title")}
						</h1>
						<p className="mt-1 text-muted-foreground text-sm leading-snug">
							{t("subtitle")}
						</p>
					</div>
					<Link
						href="/admin/cms/edit/new"
						className={buttonVariants({ size: "sm" })}
					>
						{t("newPage")}
					</Link>
				</header>

				{pages.length === 0 ? (
					<div className="rounded-lg border border-border border-dashed p-8 text-center">
						<p className="text-muted-foreground text-sm">{t("empty")}</p>
						<div className="mt-4 flex flex-wrap justify-center gap-2">
							{["imprint", "privacy", "terms"].map((slug) => (
								<Link
									key={slug}
									href={`/admin/cms/edit/${slug}`}
									className={buttonVariants({
										size: "sm",
										variant: "outline",
									})}
								>
									{t(`starter.${slug}`)}
								</Link>
							))}
						</div>
					</div>
				) : (
					<ul className="divide-y divide-border rounded-lg border border-border bg-background">
						{pages.map((p) => (
							<li
								key={p.id}
								className="flex items-center justify-between gap-3 px-3 py-3"
							>
								<div className="min-w-0">
									<div className="font-medium text-sm">{p.title}</div>
									<div className="font-mono text-muted-foreground text-xs">
										/{p.slug}
									</div>
								</div>
								<div className="flex shrink-0 gap-2">
									<Link
										href={`/${p.slug}`}
										target="_blank"
										rel="noreferrer"
										className={buttonVariants({
											size: "sm",
											variant: "ghost",
										})}
									>
										{t("preview")}
									</Link>
									<Link
										href={`/admin/cms/edit/${p.slug}`}
										className={buttonVariants({
											size: "sm",
											variant: "outline",
										})}
									>
										{t("edit")}
									</Link>
								</div>
							</li>
						))}
					</ul>
				)}
			</main>
			<Footer />
		</>
	);
}
