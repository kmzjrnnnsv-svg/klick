import { Check, Circle, Clock, MessageSquare, Pause, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type {
	ApplicationEvent,
	ApplicationStatus,
	JobStage,
	StageKind,
} from "@/db/schema";

// Drei-Zonen-Antwortzeit (Recherche: SLA-Standard 48h für Review,
// 3 Tage post-Interview, 7-10 Tage Gesamt-Stage). Wir definieren je
// Stage drei Schwellen relativ zu `expectedDays`:
//   green  ≤ expectedDays
//   amber  ≤ expectedDays * 1.5
//   red    > expectedDays * 1.5
// Wenn keine `expectedDays` gesetzt → Default per Stage-Kind.
const STAGE_KIND_DEFAULT_DAYS: Record<StageKind, number> = {
	application_received: 1,
	automated_screening: 1,
	recruiter_review: 3,
	hiring_manager_review: 5,
	phone_screen: 7,
	technical_assessment: 10,
	interview: 10,
	assessment_center: 14,
	reference_check: 7,
	offer_preparation: 5,
	offer_negotiation: 7,
	final_decision: 3,
};

function expectedDaysFor(stage: JobStage): number {
	return stage.expectedDays ?? STAGE_KIND_DEFAULT_DAYS[stage.kind] ?? 7;
}

function zoneOf(
	enteredAt: Date | null,
	stage: JobStage,
	now: Date,
): "green" | "amber" | "red" | null {
	if (!enteredAt) return null;
	const days = (now.getTime() - enteredAt.getTime()) / (24 * 60 * 60 * 1000);
	const expected = expectedDaysFor(stage);
	if (days <= expected) return "green";
	if (days <= expected * 1.5) return "amber";
	return "red";
}

const ZONE_TONE: Record<"green" | "amber" | "red", string> = {
	green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
	red: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export function ApplicationStageTimeline({
	currentStatus,
	currentStageId,
	stageEnteredAt,
	stages,
	events,
}: {
	currentStatus: ApplicationStatus;
	currentStageId: string | null;
	stageEnteredAt: Date | null;
	stages: JobStage[];
	events: ApplicationEvent[];
}) {
	const t = useTranslations("Applications");
	const fmt = useFormatter();
	const now = new Date();

	const isClosed =
		currentStatus === "declined" ||
		currentStatus === "withdrawn" ||
		currentStatus === "archived";

	// Earliest event date per stage = "ankunft an Stage". Bei Stage-Wechsel-
	// Events tragen wir den stageId mit.
	const stageDates = new Map<string, Date>();
	for (const ev of events) {
		if (ev.stageId && !stageDates.has(ev.stageId)) {
			stageDates.set(ev.stageId, ev.createdAt);
		}
	}

	const currentIdx = currentStageId
		? stages.findIndex((s) => s.id === currentStageId)
		: -1;
	const activeStage = stages[currentIdx] ?? null;
	const zone =
		activeStage && !isClosed && stageEnteredAt
			? zoneOf(stageEnteredAt, activeStage, now)
			: null;

	return (
		<div className="rounded-sm border border-border bg-background p-5">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<div>
					<p className="lv-eyebrow text-[0.55rem] text-primary">
						{t("timelineEyebrow")}
					</p>
					<h3 className="mt-2 font-serif-display text-xl">
						{activeStage && !isClosed
							? activeStage.name
							: t(`statusHeadline.${currentStatus}`)}
					</h3>
				</div>
				{zone && activeStage && (
					<span
						className={`rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-wide ${ZONE_TONE[zone]}`}
					>
						{t(`zone.${zone}`)}
						{stageEnteredAt && (
							<span className="ml-1 opacity-70">
								·{" "}
								{Math.max(
									0,
									Math.floor(
										(now.getTime() - stageEnteredAt.getTime()) /
											(24 * 60 * 60 * 1000),
									),
								)}
								d / {expectedDaysFor(activeStage)}d
							</span>
						)}
					</span>
				)}
			</div>

			{stages.length > 0 ? (
				<ol
					className="mt-6 grid gap-1"
					style={{
						gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))`,
					}}
				>
					{stages.map((s, i) => {
						const reached = i <= currentIdx && !isClosed;
						const isCurrent = i === currentIdx && !isClosed;
						const date = stageDates.get(s.id);
						return (
							<li key={s.id} className="relative">
								<div className="flex flex-col items-center text-center">
									<div
										className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
											reached
												? isCurrent
													? "animate-pulse border-primary bg-primary text-primary-foreground"
													: "border-primary bg-primary text-primary-foreground"
												: "border-border bg-background text-muted-foreground"
										}`}
									>
										{reached ? (
											<Check className="h-4 w-4" strokeWidth={2} />
										) : (
											<Clock className="h-3 w-3" strokeWidth={1.5} />
										)}
									</div>
									<p
										className={`mt-2 line-clamp-2 text-[10px] leading-tight ${
											reached ? "text-foreground" : "text-muted-foreground"
										}`}
										title={s.description ?? s.name}
									>
										{s.name}
									</p>
									{date && (
										<p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
											{fmt.dateTime(date, { dateStyle: "short" })}
										</p>
									)}
								</div>
								{i < stages.length - 1 && (
									<div
										className={`absolute top-4 left-[calc(50%+1rem)] hidden h-0.5 w-[calc(100%-2rem)] sm:block ${
											i < currentIdx && !isClosed ? "bg-primary" : "bg-border"
										}`}
									/>
								)}
							</li>
						);
					})}
				</ol>
			) : (
				<p className="mt-4 rounded-sm border border-border border-dashed bg-muted/30 p-3 text-muted-foreground text-xs">
					{t("noStagesHint")}
				</p>
			)}

			{isClosed && (
				<div className="mt-5 rounded-sm border border-rose-500/30 bg-rose-500/5 p-3 text-rose-700 text-sm dark:text-rose-300">
					{t(`closed.${currentStatus}`)}
				</div>
			)}

			<div className="mt-6 border-border border-t pt-4">
				<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
					{t("eventLog")}
				</p>
				<ol className="mt-3 space-y-2">
					{events
						.slice()
						.reverse()
						.map((ev) => {
							const stage = ev.stageId
								? stages.find((s) => s.id === ev.stageId)
								: null;
							const Icon =
								ev.kind === "message"
									? MessageSquare
									: ev.outcome === "reject"
										? X
										: ev.outcome === "on_hold"
											? Pause
											: ev.outcome === "advance"
												? Check
												: Circle;
							return (
								<li
									key={ev.id}
									className="grid grid-cols-[auto_1fr_auto] gap-3 text-xs"
								>
									<span
										className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
											ev.byRole === "candidate"
												? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
												: ev.byRole === "employer"
													? "bg-primary/20 text-primary"
													: "bg-muted text-muted-foreground"
										}`}
									>
										<Icon className="h-2.5 w-2.5" strokeWidth={2} />
									</span>
									<div>
										<p className="text-foreground">
											{ev.kind === "message"
												? t("event.message", { by: t(`role.${ev.byRole}`) })
												: ev.outcome === "reject"
													? t("event.rejected", {
															reason: ev.rejectReason
																? t(`rejectReasonShort.${ev.rejectReason}`)
																: t("rejectReasonShort.other"),
														})
													: ev.outcome === "on_hold"
														? t("event.onHold")
														: stage
															? t("event.advancedTo", { stage: stage.name })
															: ev.status
																? t(
																		`statusEvent.${ev.status as ApplicationStatus}`,
																		{
																			by: t(`role.${ev.byRole}`),
																		},
																	)
																: (ev.note ?? t("genericEvent"))}
										</p>
										{ev.note && (
											<p className="mt-0.5 text-muted-foreground">{ev.note}</p>
										)}
									</div>
									<span className="font-mono text-[10px] text-muted-foreground tabular-nums">
										{fmt.dateTime(ev.createdAt, {
											dateStyle: "short",
											timeStyle: "short",
										})}
									</span>
								</li>
							);
						})}
				</ol>
			</div>
		</div>
	);
}
