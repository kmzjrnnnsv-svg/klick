import { ArrowRight, Award, CheckCircle2, Circle, Lock } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Journey } from "@/lib/compliance/journey";
import { TOUR_FOR_STEP } from "@/lib/guide/tours";
import { cn } from "@/lib/utils";
import { StageCelebration } from "./stage-celebration";

const withParam = (href: string, key: string, value: string) =>
	`${href}${href.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;

// Etappen-Karte oben auf /heute: Fortschrittsring, EIN großer nächster
// Schritt mit „Warum?“, Häkchen der aktuellen Etappe, Abzeichen. Fortschritt
// ist abgeleitet (lib/compliance/journey.ts), nie gespeichert.
export async function NextStepCard({
	journey,
	isOwner,
	ownerName,
	planHint,
}: {
	journey: Journey;
	isOwner: boolean;
	ownerName: string | null;
	// Rückfall, wenn alle Etappen erledigt sind: bester Synergie-Schritt
	planHint: { code: string; title: string; gain: string } | null;
}) {
	const t = await getTranslations("Journey");
	const total = journey.stages.length;
	const stage = journey.stages[journey.current];
	const next = journey.next;
	const r = 26;
	const circ = 2 * Math.PI * r;
	return (
		<Card data-tour="next-step" className="border-primary/40 md:col-span-2">
			<CardContent className="flex flex-col gap-5 pt-6 sm:flex-row sm:items-start">
				<div className="flex items-center gap-4 sm:w-56 sm:flex-col sm:items-start">
					<svg
						viewBox="0 0 64 64"
						className="size-16 shrink-0 -rotate-90"
						role="img"
						aria-label={t("progressLabel", { pct: journey.pct })}
					>
						<circle
							cx="32"
							cy="32"
							r={r}
							fill="none"
							strokeWidth="6"
							className="stroke-muted"
						/>
						<circle
							cx="32"
							cy="32"
							r={r}
							fill="none"
							strokeWidth="6"
							strokeLinecap="round"
							strokeDasharray={circ}
							strokeDashoffset={circ * (1 - journey.pct / 100)}
							className="stroke-primary transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
						/>
						<text
							x="32"
							y="32"
							textAnchor="middle"
							dominantBaseline="central"
							className="rotate-90 fill-foreground font-medium text-[0.8rem]"
							style={{ transformOrigin: "32px 32px" }}
						>
							{journey.pct}%
						</text>
					</svg>
					<div>
						<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
							{stage
								? t("stageOf", { n: journey.current + 1, total })
								: t("allDone")}
						</p>
						<p className="font-serif-display text-primary text-xl">
							{stage ? t(`stage_${stage.key}`) : t("stage_done")}
						</p>
						<ul className="mt-2 flex gap-1.5" aria-label={t("badges")}>
							{journey.stages.map((s) => (
								<li
									key={s.key}
									title={t(`stage_${s.key}`)}
									className={cn(
										"flex size-7 items-center justify-center rounded-full border",
										s.done
											? "border-primary bg-primary text-primary-foreground"
											: "border-dashed text-muted-foreground",
									)}
								>
									<Award className="size-3.5" aria-hidden="true" />
									<span className="sr-only">
										{t(`stage_${s.key}`)}:{" "}
										{s.done ? t("badgeEarned") : t("badgeOpen")}
									</span>
								</li>
							))}
						</ul>
					</div>
				</div>

				<div className="flex min-w-0 flex-1 flex-col gap-4">
					{next ? (
						<div className="flex flex-col gap-2">
							<p className="lv-eyebrow text-[0.55rem] text-brown">
								{t("nextStep")}
							</p>
							<p className="font-medium text-lg">{t(`step_${next.key}`)}</p>
							<p className="text-muted-foreground text-sm">
								{t(`why_${next.key}`)}
							</p>
							{next.ownerOnly && !isOwner ? (
								<p className="flex items-center gap-1.5 text-sm">
									<Lock className="size-3.5" />
									{ownerName
										? t("askOwner", { name: ownerName })
										: t("askOwnerAnon")}
								</p>
							) : (
								<div className="flex flex-wrap items-center gap-2">
									<Link
										href={next.href}
										className={cn(
											buttonVariants({ variant: "brown" }),
											"w-fit gap-2",
										)}
									>
										{t("go")} <ArrowRight className="size-4" />
									</Link>
									{TOUR_FOR_STEP[next.key] && (
										<Link
											href={withParam(
												next.href,
												"zeig",
												TOUR_FOR_STEP[next.key] ?? "",
											)}
											className={cn(
												buttonVariants({ variant: "ghost" }),
												"w-fit",
											)}
										>
											{t("showMe")}
										</Link>
									)}
								</div>
							)}
						</div>
					) : (
						<div className="flex flex-col gap-2">
							<p className="lv-eyebrow text-[0.55rem] text-brown">
								{t("nextStep")}
							</p>
							<p className="font-medium text-lg">
								{planHint
									? t("planNext", { code: planHint.code, gain: planHint.gain })
									: t("keepGoing")}
							</p>
							{planHint && (
								<p className="text-muted-foreground text-sm">
									{planHint.title}
								</p>
							)}
							<Link
								href={planHint ? `/controls/${planHint.code}` : "/synergien"}
								className={cn(
									buttonVariants({ variant: "brown" }),
									"w-fit gap-2",
								)}
							>
								{t("go")} <ArrowRight className="size-4" />
							</Link>
						</div>
					)}
					{stage && (
						<ul className="grid gap-1.5 text-sm sm:grid-cols-2">
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
											{s.count && s.count.total > 0 && !s.done && (
												<span className="ml-1 text-muted-foreground text-xs">
													({s.count.done}/{s.count.total})
												</span>
											)}
										</span>
									</Link>
								</li>
							))}
						</ul>
					)}
				</div>
			</CardContent>
			<StageCelebration
				badges={journey.badges}
				labels={Object.fromEntries(
					journey.stages.map((s) => [s.key, t(`stage_${s.key}`)]),
				)}
				title={t("celebrateTitle")}
				lead={t("celebrateLead")}
				close={t("celebrateClose")}
			/>
		</Card>
	);
}
