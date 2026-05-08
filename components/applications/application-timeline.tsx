import { Check, Clock } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ApplicationEvent, ApplicationStatus } from "@/db/schema";

// Food-Delivery-Style: 6 Steps in fester Reihenfolge, jeder mit Icon +
// Datum sobald erreicht. Aktiv-Highlight zeigt wo der Bewerber gerade ist.
const STEPS: ApplicationStatus[] = [
	"submitted",
	"seen",
	"in_review",
	"shortlisted",
	"interview",
	"offer",
];

const STEP_INDEX: Record<ApplicationStatus, number> = {
	submitted: 0,
	seen: 1,
	in_review: 2,
	shortlisted: 3,
	interview: 4,
	offer: 5,
	declined: 99,
	withdrawn: 99,
	archived: 99,
};

export function ApplicationTimeline({
	currentStatus,
	events,
}: {
	currentStatus: ApplicationStatus;
	events: ApplicationEvent[];
}) {
	const t = useTranslations("Applications");
	const fmt = useFormatter();
	const currentIdx = STEP_INDEX[currentStatus] ?? 0;

	// First event date per step (when the status was first reached).
	const stepDates = new Map<string, Date>();
	for (const ev of events) {
		if (ev.kind === "status_change" && ev.status && !stepDates.has(ev.status)) {
			stepDates.set(ev.status, ev.createdAt);
		}
	}

	const isClosed =
		currentStatus === "declined" ||
		currentStatus === "withdrawn" ||
		currentStatus === "archived";

	return (
		<div className="rounded-sm border border-border bg-background p-5">
			<p className="lv-eyebrow text-[0.55rem] text-primary">
				{t("timelineEyebrow")}
			</p>
			<h3 className="mt-2 font-serif-display text-xl">
				{t(`statusHeadline.${currentStatus}`)}
			</h3>

			{/* Horizontal track */}
			<ol className="mt-6 grid grid-cols-6 gap-1">
				{STEPS.map((s, i) => {
					const reached = i <= currentIdx && !isClosed;
					const isCurrent = i === currentIdx && !isClosed;
					const date = stepDates.get(s);
					return (
						<li key={s} className="relative">
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
									className={`mt-2 text-[10px] leading-tight ${
										reached ? "text-foreground" : "text-muted-foreground"
									}`}
								>
									{t(`status.${s}`)}
								</p>
								{date && (
									<p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
										{fmt.dateTime(date, { dateStyle: "short" })}
									</p>
								)}
							</div>
							{i < STEPS.length - 1 && (
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

			{isClosed && (
				<div className="mt-5 rounded-sm border border-rose-500/30 bg-rose-500/5 p-3 text-rose-700 text-sm dark:text-rose-300">
					{t(`closed.${currentStatus}`)}
				</div>
			)}

			{/* Event log below */}
			<div className="mt-6 border-border border-t pt-4">
				<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
					{t("eventLog")}
				</p>
				<ol className="mt-3 space-y-2">
					{events
						.slice()
						.reverse()
						.map((ev) => (
							<li
								key={ev.id}
								className="grid grid-cols-[auto_1fr_auto] gap-3 text-xs"
							>
								<span
									className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
										ev.byRole === "candidate"
											? "bg-emerald-500"
											: ev.byRole === "employer"
												? "bg-primary"
												: "bg-muted-foreground"
									}`}
								/>
								<div>
									<p className="text-foreground">
										{ev.kind === "status_change" && ev.status
											? t(`statusEvent.${ev.status as ApplicationStatus}`, {
													by: t(`role.${ev.byRole}`),
												})
											: (ev.note ?? t("genericEvent"))}
									</p>
									{ev.note && ev.kind === "status_change" && (
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
						))}
				</ol>
			</div>
		</div>
	);
}
