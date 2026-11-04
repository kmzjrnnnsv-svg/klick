import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import type { ExerciseKind } from "@/db/schema/enums";
import { formatMinutes } from "@/lib/bcm/exercise";
import { fmtDate } from "@/lib/compliance/page-data";

const RESULT_TONE = {
	pass: "success",
	partial: "warning",
	fail: "destructive",
} as const;

// Übungen eines Prozesses (neueste zuerst); ohne Übung ein Satz
export async function ExerciseList({
	rows,
}: {
	rows: {
		id: string;
		title: string;
		kind: ExerciseKind;
		status: "planned" | "done";
		plannedAt: string | null;
		endedAt: Date | null;
		result: "pass" | "partial" | "fail" | null;
		recoveryMinutes: number | null;
	}[];
}) {
	const t = await getTranslations("Bcm");
	if (rows.length === 0)
		return <p className="text-muted-foreground text-subhead">{t("exNone")}</p>;
	return (
		<ul className="flex flex-col gap-2">
			{rows.map((r) => (
				<li key={r.id}>
					<Link
						href={`/testprogramm/uebungen/${r.id}`}
						className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-3 py-2 text-subhead hover:bg-accent"
					>
						<span className="min-w-0">
							<span className="block truncate font-medium">{r.title}</span>
							<span className="text-footnote text-muted-foreground">
								{t(`exKind_${r.kind}`)}
								{" · "}
								{r.status === "done" && r.endedAt
									? fmtDate.format(r.endedAt)
									: r.plannedAt
										? t("exPlannedFor", {
												date: fmtDate.format(new Date(r.plannedAt)),
											})
										: t("exNotScheduled")}
								{r.recoveryMinutes !== null &&
									` · ${formatMinutes(r.recoveryMinutes)}`}
							</span>
						</span>
						{r.status === "done" && r.result ? (
							<Badge variant={RESULT_TONE[r.result]}>
								{t(`exResult_${r.result}`)}
							</Badge>
						) : (
							<Badge variant="outline">{t("exPlanned")}</Badge>
						)}
					</Link>
				</li>
			))}
		</ul>
	);
}
