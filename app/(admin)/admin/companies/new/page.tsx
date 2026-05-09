import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { listTenants } from "@/app/actions/admin";
import { auth } from "@/auth";
import { CompanyCreateForm } from "@/components/admin/company-create-form";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { db } from "@/db";
import { users } from "@/db/schema";

export default async function AdminCompanyNewPage() {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");
	const [me] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (me?.role !== "admin") redirect("/post-login");

	const t = await getTranslations("AdminCompanies");
	const tenants = await listTenants();

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-2xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<Link
					href="/admin/companies"
					className="text-muted-foreground text-xs hover:text-foreground"
				>
					← {t("title")}
				</Link>
				<h1 className="mt-1 mb-2 font-semibold text-xl tracking-tight sm:text-3xl">
					{t("newCompany")}
				</h1>
				<p className="mb-6 text-muted-foreground text-sm leading-snug">
					{t("newCompanyHint")}
				</p>
				<CompanyCreateForm
					tenants={tenants.map((t) => ({
						id: t.id,
						slug: t.slug,
						name: t.name,
					}))}
				/>
			</main>
			<Footer />
		</>
	);
}
