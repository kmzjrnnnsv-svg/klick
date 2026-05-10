import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { listApplicationsForJob } from "@/app/actions/applications";
import { getJob } from "@/app/actions/jobs";
import { auth } from "@/auth";
import {
	type BoardApp,
	KanbanBoard,
} from "@/components/applications/kanban-board";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { db } from "@/db";
import { candidateProfiles, matches } from "@/db/schema";

function initials(name: string | null | undefined, fallback: string): string {
	if (!name) return fallback.slice(0, 2).toUpperCase();
	const parts = name.split(/\s+/).filter(Boolean);
	return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? ""))
		.slice(0, 2)
		.toUpperCase();
}

export default async function ApplicationsBoardPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");

	const { id: jobId } = await params;
	const t = await getTranslations("ApplicationsBoard");
	const job = await getJob(jobId);
	if (!job) notFound();

	const apps = await listApplicationsForJob(jobId);

	// Wir holen optionale Match-Scores + Display-Namen pro Kandidat,
	// damit die Karten was zum Anzeigen haben.
	const userIds = apps.map((a) => a.candidateUserId);
	const profiles = userIds.length
		? await db
				.select({
					userId: candidateProfiles.userId,
					name: candidateProfiles.displayName,
				})
				.from(candidateProfiles)
		: [];
	const nameByUser = new Map(profiles.map((p) => [p.userId, p.name]));

	const matchRows = userIds.length
		? await db
				.select({
					candidateUserId: matches.candidateUserId,
					hard: matches.hardScore,
					soft: matches.softScore,
				})
				.from(matches)
				.where(eq(matches.jobId, jobId))
		: [];
	const scoreByUser = new Map(
		matchRows.map((m) => [
			m.candidateUserId,
			Math.round((Number(m.hard) + Number(m.soft)) / 2),
		]),
	);

	const now = Date.now();
	const boardApps: BoardApp[] = apps.map((a) => {
		const name = nameByUser.get(a.candidateUserId) ?? null;
		const fallback = a.candidateUserId.slice(0, 6);
		return {
			id: a.id,
			jobId: a.jobId,
			jobTitle: job.title,
			candidateName: name,
			candidateInitials: initials(name, fallback),
			matchScore: scoreByUser.get(a.candidateUserId) ?? null,
			daysInStatus: a.stageEnteredAt
				? Math.floor(
						(now - new Date(a.stageEnteredAt).getTime()) / 86400_000,
					)
				: Math.floor(
						(now - new Date(a.createdAt).getTime()) / 86400_000,
					),
			status: a.status,
			createdAt: new Date(a.createdAt),
		};
	});

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-7xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
					<div>
						<Link
							href={`/jobs/${jobId}/applications`}
							className="text-muted-foreground text-xs hover:text-foreground"
						>
							← {t("listView")}
						</Link>
						<h1 className="mt-1 font-semibold text-xl tracking-tight sm:text-3xl">
							{t("title")}
						</h1>
						<p className="mt-1 text-muted-foreground text-sm">{job.title}</p>
					</div>
					<p className="text-muted-foreground text-xs">{t("dragHint")}</p>
				</div>
				<KanbanBoard initial={boardApps} />
			</main>
			<Footer />
		</>
	);
}
