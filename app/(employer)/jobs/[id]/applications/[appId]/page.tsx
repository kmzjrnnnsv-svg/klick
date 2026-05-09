import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
	getApplicationDetail,
	getStagesForApplication,
	listApplicationMessages,
	markApplicationSeen,
} from "@/app/actions/applications";
import { auth } from "@/auth";
import { ApplicationMessageThread } from "@/components/applications/application-message-thread";
import { ApplicationStageTimeline } from "@/components/applications/application-stage-timeline";
import { SnapshotCompare } from "@/components/applications/snapshot-compare";
import { StageOutcomeForm } from "@/components/applications/stage-outcome-form";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

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

	if (detail.application.status === "submitted") {
		await markApplicationSeen(appId);
	}

	const t = await getTranslations("Applications");
	const { application: app, events } = detail;
	const [stages, messages] = await Promise.all([
		getStagesForApplication(appId),
		listApplicationMessages(appId),
	]);

	const currentIdx = app.currentStageId
		? stages.findIndex((s) => s.id === app.currentStageId)
		: -1;
	const currentStage = stages[currentIdx] ?? null;
	const nextStage =
		currentIdx >= 0 && currentIdx + 1 < stages.length
			? stages[currentIdx + 1]
			: null;

	const isClosed =
		app.status === "declined" ||
		app.status === "withdrawn" ||
		app.status === "archived";

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
					<ApplicationStageTimeline
						currentStatus={app.status}
						currentStageId={app.currentStageId}
						stageEnteredAt={app.stageEnteredAt}
						stages={stages}
						events={events}
					/>
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

				{!isClosed && (
					<section className="mb-8">
						<StageOutcomeForm
							applicationId={appId}
							currentStageName={currentStage?.name ?? null}
							nextStageName={nextStage?.name ?? null}
							isFinalStage={currentIdx >= 0 && currentIdx === stages.length - 1}
						/>
					</section>
				)}

				<section className="mb-8">
					<ApplicationMessageThread
						applicationId={appId}
						viewerRole="employer"
						initial={messages.map((m) => ({
							id: m.id,
							body: m.body,
							byRole: m.byRole as "candidate" | "employer",
							createdAt: m.createdAt,
						}))}
						closed={isClosed}
					/>
				</section>
			</main>
			<Footer />
		</>
	);
}
