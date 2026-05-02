import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAssessmentForJob } from "@/app/actions/assessments";
import { getJob } from "@/app/actions/jobs";
import { auth } from "@/auth";
import { AssessmentBuilder } from "@/components/assessments/assessment-builder";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

export default async function JobAssessmentPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const { id } = await params;
	const job = await getJob(id);
	if (!job) notFound();

	const t = await getTranslations("Assessment");
	const initial = await getAssessmentForJob(id);

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-6">
					<Link
						href={`/jobs/${id}`}
						className="lv-eyebrow text-[0.55rem] text-muted-foreground hover:text-foreground"
					>
						← {job.title}
					</Link>
					<p className="mt-3 lv-eyebrow text-[0.6rem] text-primary">
						{t("eyebrowEmployer")}
					</p>
					<h1 className="mt-2 font-serif-display text-3xl sm:text-4xl">
						{t("titleEmployer")}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						{t("subtitleEmployer")}
					</p>
				</header>

				<AssessmentBuilder jobId={id} initial={initial} />

				<div className="mt-10 flex flex-wrap gap-3 border-border border-t pt-6">
					<Link
						href={`/jobs/${id}/assessment/responses`}
						className="lv-eyebrow rounded-sm border border-foreground/30 px-4 py-2 text-[0.6rem] text-foreground transition-colors hover:bg-foreground hover:text-background"
					>
						{t("seeResponses")}
					</Link>
				</div>
			</main>
			<Footer />
		</>
	);
}
