import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getJob } from "@/app/actions/jobs";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { JobForm } from "@/components/jobs/job-form";

export default async function EditJobPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");

	const { id } = await params;
	const job = await getJob(id);
	if (!job) notFound();

	const t = await getTranslations("Jobs");
	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
				<header className="mb-8">
					<Link
						href="/jobs"
						className="text-muted-foreground text-xs hover:text-foreground"
					>
						← {t("title")}
					</Link>
					<h1 className="mt-1 font-semibold text-2xl tracking-tight sm:text-3xl">
						{job.title || t("editJob")}
					</h1>
				</header>
				<JobForm initial={job} />
			</main>
			<Footer />
		</>
	);
}
