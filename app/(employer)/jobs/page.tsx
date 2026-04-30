import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getEmployer, listJobs } from "@/app/actions/jobs";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { EmployerOnboarding } from "@/components/jobs/employer-onboarding";
import { JobsList } from "@/components/jobs/jobs-list";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { users } from "@/db/schema";
import { cn } from "@/lib/utils";

export default async function JobsPage() {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");

	const [user] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (user?.role !== "employer") redirect("/post-login");

	const t = await getTranslations("Jobs");
	const employer = await getEmployer();

	if (!employer) {
		return (
			<>
				<Header />
				<main className="mx-auto w-full max-w-2xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
					<header className="mb-5 sm:mb-7">
						<h1 className="font-semibold text-xl tracking-tight sm:text-3xl">
							{t("title")}
						</h1>
					</header>
					<EmployerOnboarding />
				</main>
				<Footer />
			</>
		);
	}

	const jobs = await listJobs();

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-5 sm:mb-7 flex items-end justify-between gap-4">
					<div>
						<h1 className="font-semibold text-xl tracking-tight sm:text-3xl">
							{employer.companyName}
						</h1>
						<p className="mt-1 text-muted-foreground text-sm">
							{t("subtitle")}
						</p>
					</div>
					<Link href="/jobs/new" className={cn(buttonVariants({ size: "sm" }))}>
						{t("newJob")}
					</Link>
				</header>
				<JobsList jobs={jobs} />
			</main>
			<Footer />
		</>
	);
}
