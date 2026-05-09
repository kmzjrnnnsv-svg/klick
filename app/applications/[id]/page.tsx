import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
	getApplicationDetail,
	getStagesForApplication,
	listApplicationMessages,
	withdrawApplication,
} from "@/app/actions/applications";
import { auth } from "@/auth";
import { ApplicationMessageThread } from "@/components/applications/application-message-thread";
import { ApplicationStageTimeline } from "@/components/applications/application-stage-timeline";
import { ProfileEvolution } from "@/components/applications/profile-evolution";
import { SnapshotCompare } from "@/components/applications/snapshot-compare";
import { StageRatingPrompt } from "@/components/applications/stage-rating-prompt";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";

export default async function ApplicationDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const { id } = await params;
	const detail = await getApplicationDetail(id);
	if (!detail) notFound();
	const { application: app, events, currentProfile, viewerRole } = detail;

	const t = await getTranslations("Applications");

	if (viewerRole === "employer") {
		redirect(`/jobs/${app.jobId}/applications/${id}`);
	}

	const [stages, messages] = await Promise.all([
		getStagesForApplication(id),
		listApplicationMessages(id),
	]);

	const isOpen =
		app.status !== "withdrawn" &&
		app.status !== "declined" &&
		app.status !== "archived";

	const currentStage = app.currentStageId
		? stages.find((s) => s.id === app.currentStageId)
		: null;

	// Show rating prompt only when the candidate has been in this stage
	// for at least one full day — otherwise it's premature.
	const stageOldEnoughForRating =
		app.stageEnteredAt &&
		Date.now() - app.stageEnteredAt.getTime() > 24 * 60 * 60 * 1000;

	async function withdraw() {
		"use server";
		await withdrawApplication(id);
	}

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<Link
					href="/applications"
					className="lv-eyebrow text-[0.55rem] text-muted-foreground hover:text-foreground"
				>
					← {t("backToList")}
				</Link>

				<header className="mt-3 mb-6 border-border border-b pb-6">
					<p className="lv-eyebrow text-[0.6rem] text-primary">
						{t("detailEyebrow")}
					</p>
					<h1 className="mt-2 font-serif-display text-3xl sm:text-4xl">
						{app.jobSnapshot.title}
					</h1>
					{app.jobSnapshot.location && (
						<p className="mt-2 text-muted-foreground text-sm">
							{app.jobSnapshot.location}
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

				{isOpen && currentStage && stageOldEnoughForRating && (
					<section className="mb-8">
						<StageRatingPrompt
							applicationId={id}
							jobStageId={currentStage.id}
							stageName={currentStage.name}
						/>
					</section>
				)}

				{app.coverLetter && (
					<section className="mb-8">
						<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
							{t("yourCoverLetter")}
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
						currentSkills={currentProfile?.skills}
					/>
				</section>

				{currentProfile && (
					<section className="mb-8">
						<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
							{t("evolutionEyebrow")}
						</p>
						<h2 className="mt-2 mb-4 font-serif-display text-xl">
							{t("evolutionTitle")}
						</h2>
						<ProfileEvolution
							snap={app.profileSnapshot}
							current={currentProfile}
						/>
					</section>
				)}

				<section className="mb-8">
					<ApplicationMessageThread
						applicationId={id}
						viewerRole="candidate"
						initial={messages.map((m) => ({
							id: m.id,
							body: m.body,
							byRole: m.byRole as "candidate" | "employer",
							createdAt: m.createdAt,
						}))}
						closed={!isOpen}
					/>
				</section>

				{isOpen && (
					<section className="rounded-sm border border-border bg-background p-4">
						<form action={withdraw}>
							<Button type="submit" variant="ghost" size="sm">
								{t("withdraw")}
							</Button>
						</form>
					</section>
				)}
			</main>
			<Footer />
		</>
	);
}
