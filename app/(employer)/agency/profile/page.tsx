import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getEmployer } from "@/app/actions/jobs";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { EmployerProfileForm } from "@/components/jobs/employer-profile-form";
import { db } from "@/db";
import { users } from "@/db/schema";

export default async function EmployerProfilePage() {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");
	const [me] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (me?.role !== "employer") redirect("/post-login");

	const employer = await getEmployer();
	if (!employer) redirect("/onboarding/employer");

	const t = await getTranslations("EmployerProfile");

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-2xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-6">
					<p className="lv-eyebrow text-[0.6rem] text-primary">
						{t("eyebrow")}
					</p>
					<h1 className="mt-2 font-serif-display text-3xl sm:text-4xl">
						{t("title")}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						{t("subtitle")}
					</p>
				</header>
				<EmployerProfileForm
					initial={{
						companyName: employer.companyName,
						website: employer.website,
						description: employer.description,
						isAgency: employer.isAgency,
					}}
				/>
				<p className="mt-4 text-muted-foreground text-xs">
					{t("publicHint")}{" "}
					<Link
						href={`/c/${employer.id}`}
						className="text-primary underline-offset-2 hover:underline"
					>
						/c/{employer.id.slice(0, 8)}
					</Link>
				</p>
			</main>
			<Footer />
		</>
	);
}
