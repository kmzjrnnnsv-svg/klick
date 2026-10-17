import { Award, CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Journey } from "@/lib/compliance/journey";
import { cn } from "@/lib/utils";

// Alle Etappen mit Schritten (Überblick) — dieselbe Ableitung wie die Karte
// auf /heute (lib/compliance/journey.ts).
export async function JourneyStages({ journey }: { journey: Journey }) {
	const t = await getTranslations("Journey");
	return (
		<ol className="flex flex-col gap-4">
			{journey.stages.map((stage, i) => {
				const done = stage.steps.filter((s) => s.done).length;
				const current = i === journey.current;
				return (
					<li key={stage.key} className="flex flex-col gap-1.5">
						<p
							className={cn(
								"flex items-center gap-2 text-sm",
								current ? "font-medium" : "text-muted-foreground",
							)}
						>
							<Award
								className={cn(
									"size-4",
									stage.done ? "text-primary" : "text-muted-foreground/60",
								)}
								aria-hidden="true"
							/>
							{t("stageOf", { n: i + 1, total: journey.stages.length })} ·{" "}
							{t(`stage_${stage.key}`)}
							<span className="ml-auto text-muted-foreground text-xs">
								{done}/{stage.steps.length}
							</span>
						</p>
						{(current || !stage.done) && (
							<ul className="flex flex-col gap-1 pl-6 text-sm">
								{stage.steps.map((s) => (
									<li key={s.key}>
										<Link
											href={s.href}
											className="flex items-start gap-2 hover:underline underline-offset-4"
										>
											{s.done ? (
												<CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
											) : (
												<Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
											)}
											<span className={s.done ? "text-muted-foreground" : ""}>
												{t(`step_${s.key}`)}
											</span>
										</Link>
									</li>
								))}
							</ul>
						)}
					</li>
				);
			})}
		</ol>
	);
}
