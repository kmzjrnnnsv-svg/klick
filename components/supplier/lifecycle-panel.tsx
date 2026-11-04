import { Check, Circle, CircleDot } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Section } from "@/components/entity/entity-layout";
import {
	ExitChecklist,
	ProviderStepActions,
	StartExitDialog,
} from "@/components/supplier/lifecycle-forms";
import { Badge } from "@/components/ui/badge";
import { PROVIDER_EXIT_ITEMS } from "@/db/schema/enums";
import type { ProviderExit } from "@/db/schema/registers";
import {
	exitComplete,
	exitItemRequired,
	type Lifecycle,
	type LifecycleItem,
	type LifecycleItemKey,
	PROVIDER_STAGES,
	type ProviderStage,
	stageStates,
} from "@/lib/compliance/supplier-lifecycle";
import { cn } from "@/lib/utils";

// Wo ein offener Punkt erledigt wird: Stammdaten bearbeiten, Angaben
// ergänzen, Reiter oder Risiko-Assistent
export function lifecycleFixHref(
	key: LifecycleItemKey,
	base: string,
	providerId: string,
): string {
	switch (key) {
		case "substitutability":
		case "dpa":
		case "subcontractors":
		case "exit_strategy":
		case "exit_test":
			return `${base}?angaben=1`;
		case "due_diligence":
		case "approved":
		case "next_review":
			return `${base}?tab=bewertungen`;
		case "clauses":
			return `${base}?tab=vertrag`;
		case "risk_analysis":
			return `/risiken/neu?dienstleister=${providerId}`;
		default:
			return `${base}?bearbeiten=1`;
	}
}

// Stufenleiste und Liste der offenen Punkte am Dienstleister
export async function LifecyclePanel({
	lifecycle,
	providerId,
	status,
	canEdit,
	approvalPending,
	exit,
	significance,
}: {
	lifecycle: Lifecycle;
	providerId: string;
	status: string;
	canEdit: boolean;
	approvalPending: boolean;
	// Ausstieg mit Checkliste (L3)
	exit: ProviderExit | null;
	significance: {
		criticality: "critical" | "important" | "standard";
		isMaterial: boolean;
	};
}) {
	const t = await getTranslations("SupplierLifecycle");
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeZone: "Europe/Berlin",
	});
	const day = (iso: string) =>
		fmt.format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
	const running = ["active", "onboarding", "paused"].includes(status);
	// Ausstieg beantragt, Entscheidung offen (Status bleibt bis dahin)
	const exitRequested =
		running && approvalPending && exit !== null && !exit.rejectedAt;
	const base = `/dienstleister/${providerId}`;
	const states = stageStates(lifecycle);
	const current = lifecycle.current;
	const open = (s: ProviderStage) =>
		lifecycle.items.filter((i) => i.stage === s && !i.done);
	const now = open(current);
	// Punkte vor dem Betrieb, die noch fehlen (für „In Betrieb nehmen“)
	const beforeOperate = lifecycle.items.filter(
		(i) =>
			i.required &&
			!i.done &&
			PROVIDER_STAGES.indexOf(i.stage) < PROVIDER_STAGES.indexOf("operate"),
	);
	const later = lifecycle.items.filter(
		(i) =>
			!i.done &&
			i.stage !== current &&
			PROVIDER_STAGES.indexOf(i.stage) > PROVIDER_STAGES.indexOf(current),
	);
	const item = (i: LifecycleItem) => (
		<li key={i.key} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
			<span>{t(`item_${i.key}`)}</span>
			{!i.required && (
				<span className="text-muted-foreground text-footnote">
					{t("recommended")}
				</span>
			)}
			{canEdit && (
				<Link
					href={lifecycleFixHref(i.key, base, providerId)}
					scroll={false}
					className="text-primary text-footnote hover:underline underline-offset-4"
				>
					{t(`fix_${i.key}`)}
				</Link>
			)}
		</li>
	);
	return (
		<Section title={t("title")}>
			<ol
				aria-label={t("stagesLabel")}
				className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
			>
				{PROVIDER_STAGES.map((s) => {
					const st = states[s];
					return (
						<li
							key={s}
							aria-current={st === "current" ? "step" : undefined}
							className={cn(
								"flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-footnote",
								st === "current"
									? "bg-primary/10 font-medium text-foreground"
									: st === "open"
										? "bg-warning/10 text-foreground"
										: "bg-card text-muted-foreground",
							)}
						>
							{st === "done" ? (
								<Check
									className="size-4 shrink-0 text-success"
									aria-hidden="true"
								/>
							) : st === "current" ? (
								<CircleDot
									className="size-4 shrink-0 text-primary"
									aria-hidden="true"
								/>
							) : (
								<Circle
									className={cn(
										"size-4 shrink-0",
										st === "open" ? "text-warning" : "text-muted-foreground",
									)}
									aria-hidden="true"
								/>
							)}
							<span className="min-w-0 truncate">{t(`stage_${s}`)}</span>
							<span className="sr-only">{t(`state_${st}`)}</span>
						</li>
					);
				})}
			</ol>
			<div className="flex flex-col gap-3 text-subhead">
				<p>
					<span className="font-medium">
						{t("now", { stage: t(`stage_${current}`) })}
					</span>
					{lifecycle.declined && (
						<Badge variant="destructive" className="ml-2 align-middle">
							{t("declinedBadge")}
						</Badge>
					)}
					{approvalPending && (
						<Badge variant="warning" className="ml-2 align-middle">
							{t("approvalPending")}
						</Badge>
					)}
				</p>
				<p className="text-muted-foreground">{t(`lead_${current}`)}</p>
				{current !== "exit" && now.length > 0 && (
					<ul className="flex flex-col gap-1.5">{now.map(item)}</ul>
				)}
				{current === "exit" && exit && (
					<p>
						{t("exitReasonShown", {
							reason: exit.reason.replace(/[.!?]\s*$/, ""),
						})}
						{exit.plannedEnd &&
							` ${t("exitPlannedShown", { date: day(exit.plannedEnd) })}`}
					</p>
				)}
				{status === "exiting" && exit && (
					<ExitChecklist
						providerId={providerId}
						canEdit={canEdit}
						complete={exitComplete({ ...significance, exit })}
						items={PROVIDER_EXIT_ITEMS.map((k) => ({
							key: k,
							required: exitItemRequired(k, significance),
							doneAt: exit.items[k] ?? null,
						}))}
					/>
				)}
				{status === "terminated" && exit?.completedAt && (
					<p className="text-muted-foreground">
						{t("exitCompletedOn", { date: day(exit.completedAt) })}
					</p>
				)}
				{canEdit && status === "requested" && (
					<ProviderStepActions providerId={providerId} step="request" ready />
				)}
				{/* in Betrieb nehmen erst, wenn bis zum Onboarding alles steht */}
				{canEdit &&
					(status === "onboarding" || status === "paused") &&
					!approvalPending &&
					beforeOperate.length === 0 && (
						<ProviderStepActions
							providerId={providerId}
							step="activate"
							ready
						/>
					)}
				{exitRequested && exit && (
					<p className="text-muted-foreground">
						{t("exitRequested", { date: day(exit.requestedAt) })}
					</p>
				)}
				{running && exit?.rejectedAt && !approvalPending && (
					<p className="text-muted-foreground">
						{t("exitRejected", { date: day(exit.rejectedAt) })}
					</p>
				)}
				{later.length > 0 && current !== "exit" && (
					<details className="rounded-2xl bg-card px-3 py-2">
						<summary className="cursor-pointer text-footnote">
							{t("later", { n: later.length })}
						</summary>
						<ul className="mt-2 flex flex-col gap-1.5">
							{later.map((i) => (
								<li
									key={i.key}
									className="flex flex-wrap items-baseline gap-x-2"
								>
									<span className="text-muted-foreground text-footnote">
										{t(`stage_${i.stage}`)}
									</span>
									<span>{t(`item_${i.key}`)}</span>
									{!i.required && (
										<span className="text-muted-foreground text-footnote">
											{t("recommended")}
										</span>
									)}
								</li>
							))}
						</ul>
					</details>
				)}
				{canEdit && running && !approvalPending && (
					<div>
						<StartExitDialog providerId={providerId} />
					</div>
				)}
			</div>
		</Section>
	);
}
