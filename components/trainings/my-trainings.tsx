import { getTranslations } from "next-intl/server";
import {
	CompleteTrainingButton,
	CourseLink,
} from "@/components/registers/training-plan-forms";
import {
	DueBadge,
	TodayCard,
	TodayList,
	TodayRow,
} from "@/components/today/today-list";
import type { trainingAssignments, trainingRequirements } from "@/db/schema";
import { currentTrainings } from "@/lib/trainings/assignments";

type Assignment = typeof trainingAssignments.$inferSelect;
type Requirement = typeof trainingRequirements.$inferSelect;

// Offene Pflichtschulungen der Person (fällig oder überfällig) mit Kurs-Link
// und „Erledigt“. Auf /heute und für Mitarbeitende auf /richtlinien — dort
// gibt es keine Schulungsseite, die Erinnerung führt über /meine-schulungen
// hierher.
export async function MyTrainings({
	assignments,
	requirements,
	today,
	link,
	id,
	className,
}: {
	assignments: readonly Assignment[];
	requirements: readonly Requirement[];
	today: string;
	link?: { href: string; label: string };
	id?: string;
	className?: string;
}) {
	const t = await getTranslations("Today");
	const tt = await getTranslations("Trainings");
	const reqById = new Map(requirements.map((r) => [r.id, r]));
	const open = [...currentTrainings([...assignments], today).values()]
		.filter((x) => x.open && (x.state === "due" || x.state === "overdue"))
		.map((x) => ({
			...x,
			req: x.open ? reqById.get(x.open.requirementId) : undefined,
		}))
		.sort((a, b) => (a.open?.dueAt ?? "").localeCompare(b.open?.dueAt ?? ""));
	if (open.length === 0) return null;
	return (
		<div id={id} className={className}>
			<TodayCard title={tt("heuteTitle")} link={link}>
				<TodayList>
					{open.slice(0, 5).map((x) => (
						<TodayRow
							key={x.open?.id}
							title={x.req?.title}
							sub={<CourseLink url={x.req?.courseUrl} />}
							date={
								x.open && (
									<DueBadge
										date={x.open.dueAt}
										today={today}
										soonDays={30}
										overdueLabel={t("overdue")}
									/>
								)
							}
							action={
								x.open && (
									<CompleteTrainingButton
										assignmentId={x.open.id}
										title={x.req?.title ?? ""}
									/>
								)
							}
						/>
					))}
				</TodayList>
			</TodayCard>
		</div>
	);
}
