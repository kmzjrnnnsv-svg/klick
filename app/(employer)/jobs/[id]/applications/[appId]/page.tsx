import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
	getApplicationDetail,
	markApplicationSeen,
	setApplicationStatus,
} from "@/app/actions/applications";
import { auth } from "@/auth";
import { ApplicationTimeline } from "@/components/applications/application-timeline";
import { SnapshotCompare } from "@/components/applications/snapshot-compare";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApplicationStatus } from "@/db/schema";

const NEXT_STATES: Record<string, ApplicationStatus[]> = {
	submitted: ["seen", "in_review", "shortlisted", "declined"],
	seen: ["in_review", "shortlisted", "declined"],
	in_review: ["shortlisted", "declined"],
	shortlisted: ["interview", "declined"],
	interview: ["offer", "declined"],
	offer: ["archived", "declined"],
	declined: ["archived"],
	withdrawn: ["archived"],
	archived: [],
};

export default async function EmployerApplicationDetailPage({
	params,
}: {
	params: Promise<{ id: string; appId: string }>;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const { id: jobId, appId } = await params;
	const detail = await getApplicationDetail(appId);
	if (!detail) notFound();
	if (detail.viewerRole !== "employer") notFound();

	// Auto-mark seen on first open.
	if (detail.application.status === "submitted") {
		await markApplicationSeen(appId);
	}

	const t = await getTranslations("Applications");
	const { application: app, events } = detail;
	const nextStates = NEXT_STATES[app.status] ?? [];

	async function setStatus(formData: FormData) {
		"use server";
		const status = formData.get("status")?.toString() as
			| ApplicationStatus
			| undefined;
		if (!status) return;
		await setApplicationStatus({
			applicationId: appId,
			status,
			note: formData.get("note")?.toString(),
		});
	}

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<Link
					href={`/jobs/${jobId}/applications`}
					className="lv-eyebrow text-[0.55rem] text-muted-foreground hover:text-foreground"
				>
					← {t("employerBackToList")}
				</Link>

				<header className="mt-3 mb-6 border-border border-b pb-6">
					<p className="lv-eyebrow text-[0.6rem] text-primary">
						{t("detailEyebrow")}
					</p>
					<h1 className="mt-2 font-serif-display text-3xl sm:text-4xl">
						{app.profileSnapshot.displayName ?? t("anonymousCandidate")}
					</h1>
					{app.profileSnapshot.headline && (
						<p className="mt-2 text-muted-foreground text-sm">
							{app.profileSnapshot.headline}
							{app.profileSnapshot.location
								? ` · ${app.profileSnapshot.location}`
								: ""}
						</p>
					)}
				</header>

				<section className="mb-8">
					<ApplicationTimeline currentStatus={app.status} events={events} />
				</section>

				{app.coverLetter && (
					<section className="mb-8">
						<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
							{t("coverLetterFromCandidate")}
						</p>
						<div className="mt-2 whitespace-pre-wrap rounded-sm border border-border bg-muted/30 p-4 text-foreground/90 text-sm leading-relaxed">
							{app.coverLetter}
						</div>
					</section>
				)}

				<section className="mb-8">
					<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
						{t("compareEyebrow")}
					</p>
					<h2 className="mt-2 mb-4 font-serif-display text-xl">
						{t("compareTitle")}
					</h2>
					<SnapshotCompare
						jobSnap={app.jobSnapshot}
						profileSnap={app.profileSnapshot}
						matchSnap={app.matchSnapshot}
					/>
				</section>

				{nextStates.length > 0 && (
					<section className="rounded-sm border border-primary/30 bg-primary/5 p-5">
						<p className="lv-eyebrow text-[0.55rem] text-primary">
							{t("nextStepEyebrow")}
						</p>
						<h2 className="mt-2 font-serif-display text-xl">
							{t("nextStepTitle")}
						</h2>
						<form action={setStatus} className="mt-4 space-y-3">
							<div className="flex flex-wrap gap-2">
								{nextStates.map((s) => (
									<label
										key={s}
										className="cursor-pointer rounded-sm border border-border bg-background px-3 py-1.5 text-xs has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
									>
										<input
											type="radio"
											name="status"
											value={s}
											className="sr-only"
											required
										/>
										{t(`status.${s}`)}
									</label>
								))}
							</div>
							<Input name="note" placeholder={t("nextStepNotePlaceholder")} />
							<Button type="submit">{t("nextStepSubmit")}</Button>
						</form>
					</section>
				)}
			</main>
			<Footer />
		</>
	);
}
