"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	completeProviderRating,
	deleteRatingDraft,
	rateCriterion,
	saveRatingProfile,
} from "@/app/actions/provider-ratings";
import { LevelChoice } from "@/components/entity/level-choice";
import type { MemberOption } from "@/components/entity/owner-assignee";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CRITICALITY } from "@/db/schema/enums";
import type {
	SupplierArea,
	SupplierCriterion,
	SupplierThreshold,
} from "@/db/schema/platform";
import { PROVIDER_CATEGORIES } from "@/db/schema/registers";
import type { RatingProfile, RatingScore } from "@/db/schema/supplier-ratings";
import {
	CRITICALITY_HELP,
	SUPPLIER_MEASURES,
} from "@/lib/compliance/catalog/supplier-criteria";
import {
	outsourcingDecision,
	suggestedMeasures,
	summarizeRating,
	TRAFFIC_TONE,
} from "@/lib/compliance/supplier-rating";
import { cn } from "@/lib/utils";

const STEPS = [
	"steckbrief",
	"allgemein",
	"sicherheit",
	"ergebnis",
	"massnahmen",
	"freigabe",
] as const;
type Step = (typeof STEPS)[number];
type Criticality = (typeof CRITICALITY)[number];
type Decision = "approved" | "approved_with_conditions" | "rejected";

const TRAFFIC_BG = {
	red: "bg-destructive/10 border-destructive/40",
	amber: "bg-warning/15 border-warning/50",
	green: "bg-success/10 border-success/40",
} as const;
const selectCls =
	"h-9 w-full rounded-md bg-muted px-2 text-foreground text-subhead";
const OUTSOURCING_FWS = ["kwg", "zag", "zag-marisk", "micar"];

export function RatingWizard({
	rating,
	provider,
	thresholds,
	frameworks,
	members,
	names,
	questionnaires,
	initialStep,
}: {
	rating: {
		id: string;
		code: string;
		criteria: SupplierCriterion[];
		scores: Record<string, RatingScore>;
		profile: RatingProfile;
		areaWeights: Record<SupplierArea, number>;
	};
	provider: {
		id: string;
		name: string;
		partnerType: string;
		serviceDescription: string | null;
		category: (typeof PROVIDER_CATEGORIES)[number] | null;
		criticality: Criticality;
		isOutsourcing: boolean;
		isMaterial: boolean;
		processesPersonalData: boolean;
		ownerUserId: string | null;
	};
	thresholds: SupplierThreshold[];
	frameworks: string[];
	members: MemberOption[];
	names: Record<string, string>;
	questionnaires: {
		id: string;
		code: string;
		title: string;
		status: string;
		score: number | null;
		rating: string | null;
	}[];
	initialStep?: string;
}) {
	const t = useTranslations("Rating");
	const tp = useTranslations("Providers");
	const ts = useTranslations("Status");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [step, setStep] = useState<Step>(
		(STEPS as readonly string[]).includes(initialStep ?? "")
			? (initialStep as Step)
			: "steckbrief",
	);
	const [scores, setScores] = useState(rating.scores);
	const [saving, setSaving] = useState<string | null>(null);
	const [profile, setProfile] = useState<RatingProfile>({
		category: provider.category,
		criticality: provider.criticality,
		...rating.profile,
	});
	const sum = summarizeRating(
		rating.criteria,
		scores,
		rating.areaWeights,
		thresholds,
	);
	const outs = outsourcingDecision(profile);
	const showOutsourcing = frameworks.some((f) => OUTSOURCING_FWS.includes(f));
	const showDora = frameworks.includes("dora");
	const criticality: Criticality = profile.criticalFunction
		? "critical"
		: (profile.criticality ?? provider.criticality);
	const suggested = useMemo(
		() =>
			suggestedMeasures(
				sum.level?.traffic ?? null,
				{
					processesPersonalData: provider.processesPersonalData,
					isOutsourcing:
						outs.label === "offen"
							? provider.isOutsourcing
							: outs.isOutsourcing,
					isMaterial:
						outs.label === "offen" ? provider.isMaterial : outs.isMaterial,
					criticality,
					partnerType: provider.partnerType,
				},
				frameworks,
			),
		[sum.level?.traffic, provider, outs, criticality, frameworks],
	);
	const [picked, setPicked] = useState<
		Record<string, { on: boolean; owner: string; due: string }>
	>({});
	const isPicked = (code: string) =>
		picked[code]?.on ?? suggested.some((m) => m.code === code);
	const [decision, setDecision] = useState<Decision | null>(null);
	const [note, setNote] = useState("");
	const [soloReason, setSoloReason] = useState("");

	function goto(s: Step) {
		setStep(s);
		router.replace(`?schritt=${s}`, { scroll: false });
		if (typeof window !== "undefined") window.scrollTo({ top: 0 });
	}

	async function rate(code: string, score: number | null, noteText?: string) {
		const prev = scores[code];
		const next = {
			...prev,
			score,
			note: noteText ?? prev?.note,
			prefilled: undefined,
		};
		setScores((x) => ({ ...x, [code]: next }));
		setSaving(code);
		const res = await rateCriterion({
			ratingId: rating.id,
			code,
			score,
			note: noteText ?? prev?.note,
		});
		setSaving(null);
		if (!res.ok) {
			setScores((x) => ({ ...x, [code]: prev ?? { score: null } }));
			toast.error(t("saveFailed"));
		}
	}

	function saveProfile(patch: Partial<RatingProfile>) {
		const next = { ...profile, ...patch };
		setProfile(next);
		start(async () => {
			const res = await saveRatingProfile({
				ratingId: rating.id,
				category: next.category ?? null,
				criticality: next.criticality,
				instituteTask: next.instituteTask ?? null,
				oneOff: next.oneOff ?? null,
				material: next.material ?? null,
				criticalFunction: next.criticalFunction ?? null,
			});
			if (!res.ok) toast.error(t("saveFailed"));
		});
	}

	function complete() {
		if (!decision) {
			toast.error(t("errDecision"));
			return;
		}
		start(async () => {
			const res = await completeProviderRating({
				ratingId: rating.id,
				decision,
				decisionNote: note,
				selfApprovalReason: soloReason || undefined,
				measures: SUPPLIER_MEASURES.filter((m) => isPicked(m.code)).map(
					(m) => ({
						code: m.code,
						ownerUserId: picked[m.code]?.owner || null,
						dueAt: picked[m.code]?.due || null,
					}),
				),
			});
			if (!res.ok) {
				const msg =
					res.error === "needsManagement"
						? t("errNeedsManagement")
						: res.error === "no_approver" ||
								res.error === "solo_reason_required" ||
								res.error === "solo_not_allowed"
							? ts(`approvalError_${res.error}`)
							: res.error === "incomplete"
								? Object.values(res.fieldErrors ?? {})
										.flat()
										.join(" ")
								: res.fieldErrors
									? Object.values(res.fieldErrors).flat().join(" ")
									: t("saveFailed");
				toast.error(msg);
				return;
			}
			toast.success(
				res.data.approvalPending ? t("completedPending") : t("completed"),
			);
			router.push(`/dienstleister/${provider.id}?tab=bewertungen`);
		});
	}

	const idx = STEPS.indexOf(step);
	const areaList = (area: SupplierArea) =>
		rating.criteria.filter((c) => c.area === area);
	const openIn = (area: SupplierArea) =>
		areaList(area).filter((c) => !scores[c.code]?.score).length;

	return (
		<div className="flex flex-col gap-6">
			<nav aria-label={t("stepsLabel")}>
				<ol className="flex flex-wrap gap-1.5 text-footnote">
					{STEPS.map((s, i) => (
						<li key={s}>
							<button
								type="button"
								aria-current={s === step ? "step" : undefined}
								onClick={() => goto(s)}
								className={cn(
									"rounded-full border px-3 py-1",
									s === step
										? "border-primary bg-primary text-primary-foreground"
										: "text-muted-foreground hover:bg-muted",
								)}
							>
								{i + 1} · {t(`step_${s}`)}
								{(s === "allgemein" || s === "sicherheit") &&
									openIn(s === "allgemein" ? "general" : "security") > 0 && (
										<span className="ml-1 tabular-nums">
											({openIn(s === "allgemein" ? "general" : "security")})
										</span>
									)}
							</button>
						</li>
					))}
				</ol>
			</nav>

			<header className="flex flex-col gap-1">
				<h2 className="font-medium text-lg">{t(`q_${step}`)}</h2>
				<p className="text-muted-foreground text-subhead">
					{t(`lead_${step}`)}
				</p>
			</header>

			{step === "steckbrief" && (
				<div className="flex flex-col gap-6">
					<dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-subhead sm:grid-cols-[12rem_1fr]">
						<dt className="text-muted-foreground">{tp("name")}</dt>
						<dd className="font-medium">{provider.name}</dd>
						<dt className="text-muted-foreground">{tp("partnerType")}</dt>
						<dd>{tp(`partner_${provider.partnerType}` as "partner_ict")}</dd>
						{provider.serviceDescription && (
							<>
								<dt className="text-muted-foreground">{tp("description")}</dt>
								<dd>{provider.serviceDescription}</dd>
							</>
						)}
					</dl>
					<div className="flex max-w-sm flex-col gap-1">
						<Label htmlFor="rt-cat">{tp("category")}</Label>
						<select
							id="rt-cat"
							className={selectCls}
							value={profile.category ?? ""}
							onChange={(e) =>
								saveProfile({
									category: (e.target.value ||
										null) as RatingProfile["category"],
								})
							}
						>
							<option value="">—</option>
							{PROVIDER_CATEGORIES.map((c) => (
								<option key={c} value={c}>
									{tp(`category_${c}`)}
								</option>
							))}
						</select>
					</div>
					<fieldset className="flex flex-col gap-2">
						<legend className="mb-1 font-medium text-subhead">
							{t("criticality")}
						</legend>
						<div className="grid grid-cols-1 gap-2 md:grid-cols-3">
							{(["critical", "important", "standard"] as const).map((k) => (
								<label
									key={k}
									className="flex cursor-pointer flex-col gap-1 rounded-2xl bg-card p-3 text-subhead has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50"
								>
									<span className="flex items-center gap-2 font-medium">
										<input
											type="radio"
											name="criticality"
											className="accent-primary"
											checked={criticality === k}
											disabled={Boolean(profile.criticalFunction)}
											onChange={() => saveProfile({ criticality: k })}
										/>
										{tp(`crit_${k}`)}
									</span>
									<span className="text-muted-foreground text-footnote">
										{CRITICALITY_HELP[k]}
									</span>
								</label>
							))}
						</div>
					</fieldset>
					{showDora && (
						<YesNo
							name="critfn"
							legend={t("criticalFunction")}
							hint={t("criticalFunctionHint")}
							value={profile.criticalFunction ?? null}
							onChange={(v) => saveProfile({ criticalFunction: v })}
							labels={{ yes: t("yes"), no: t("no") }}
						/>
					)}
					{showOutsourcing && (
						<div className="flex flex-col gap-4 rounded-2xl bg-card p-3">
							<h3 className="font-medium text-subhead">
								{t("outsourcingTitle")}
							</h3>
							<YesNo
								name="inst"
								legend={t("q_instituteTask")}
								hint={t("h_instituteTask")}
								value={profile.instituteTask ?? null}
								onChange={(v) => saveProfile({ instituteTask: v })}
								labels={{ yes: t("yes"), no: t("no") }}
							/>
							{profile.instituteTask && (
								<YesNo
									name="oneoff"
									legend={t("q_oneOff")}
									hint={t("h_oneOff")}
									value={profile.oneOff ?? null}
									onChange={(v) => saveProfile({ oneOff: v })}
									labels={{ yes: t("yes"), no: t("no") }}
								/>
							)}
							{profile.instituteTask && profile.oneOff === false && (
								<YesNo
									name="material"
									legend={t("q_material")}
									hint={t("h_material")}
									value={profile.material ?? null}
									onChange={(v) => saveProfile({ material: v })}
									labels={{ yes: t("yes"), no: t("no") }}
								/>
							)}
							<p
								className="rounded-md bg-muted/50 p-2 text-subhead"
								aria-live="polite"
							>
								{t(`outsourcing_${outs.label}`)}
							</p>
						</div>
					)}
				</div>
			)}

			{(step === "allgemein" || step === "sicherheit") && (
				<div
					className={cn(
						"grid gap-6",
						step === "sicherheit" && "lg:grid-cols-[1fr_18rem]",
					)}
				>
					<ol className="flex flex-col gap-6">
						{areaList(step === "allgemein" ? "general" : "security").map(
							(c) => {
								const s = scores[c.code];
								const low = (s?.score ?? 5) <= 2;
								return (
									<li key={c.code} className="flex flex-col gap-2">
										<LevelChoice
											name={c.code}
											legend={
												<span className="flex flex-wrap items-center gap-2">
													{c.title}
													<span className="font-normal text-muted-foreground text-footnote">
														{t("weight", { w: c.weight })}
													</span>
													{saving === c.code && (
														<span className="font-normal text-muted-foreground text-footnote">
															{t("saving")}
														</span>
													)}
												</span>
											}
											hint={
												s?.prefilled
													? t("prefilled", { why: s.prefilled })
													: s?.ratedBy && s.score
														? t("ratedBy", {
																name: names[s.ratedBy] ?? "—",
															})
														: undefined
											}
											options={c.anchors.map((a, i) => ({
												value: i + 1,
												label: t(`scale_${i + 1}` as "scale_1"),
												anchor: a || "—",
											}))}
											value={s?.score ?? null}
											onChange={(v) => void rate(c.code, v)}
										/>
										<Textarea
											aria-label={t("noteFor", { title: c.title })}
											className={cn(
												"min-h-14",
												low && !s?.note && "border-warning",
											)}
											placeholder={
												low ? t("noteRequired") : t("notePlaceholder")
											}
											defaultValue={s?.note ?? ""}
											maxLength={2000}
											onBlur={(e) => {
												if ((e.target.value ?? "") !== (s?.note ?? ""))
													void rate(c.code, s?.score ?? null, e.target.value);
											}}
										/>
									</li>
								);
							},
						)}
					</ol>
					{step === "sicherheit" && (
						<aside className="flex flex-col gap-2 self-start rounded-2xl bg-card p-3 text-subhead">
							<h3 className="font-medium">{t("selfDisclosure")}</h3>
							<p className="text-muted-foreground text-footnote">
								{t("selfDisclosureLead")}
							</p>
							{questionnaires.length === 0 ? (
								<p className="text-muted-foreground text-footnote">
									{t("selfDisclosureNone")}
								</p>
							) : (
								<ul className="flex flex-col gap-1.5">
									{questionnaires.map((q) => (
										<li key={q.id}>
											<Link
												href={`/gap-analyse/${q.id}`}
												className="hover:underline"
											>
												{q.code} · {q.title}
											</Link>
											<span className="block text-muted-foreground text-footnote">
												{q.rating
													? t("questionnaireRated", {
															rating: q.rating,
															score: q.score ?? 0,
														})
													: t(`qStatus_${q.status}` as "qStatus_draft")}
											</span>
										</li>
									))}
								</ul>
							)}
						</aside>
					)}
				</div>
			)}

			{step === "ergebnis" && (
				<div className="flex flex-col gap-4">
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
						{(
							[
								["general", sum.general],
								["security", sum.security],
								["total", sum.total],
							] as const
						).map(([k, v]) => (
							<div key={k} className="rounded-2xl bg-card p-3">
								<p className="text-muted-foreground text-footnote">
									{t(`res_${k}`)}
								</p>
								<p className="font-medium text-2xl tabular-nums">
									{v === null ? "—" : v.toFixed(2).replace(".", ",")}
								</p>
							</div>
						))}
						<div className="rounded-2xl bg-card p-3">
							<p className="text-muted-foreground text-footnote">
								{t("res_percent")}
							</p>
							<p className="font-medium text-2xl tabular-nums">
								{sum.percent === null ? "—" : `${sum.percent} %`}
							</p>
						</div>
					</div>
					{sum.level ? (
						<div
							className={cn(
								"flex flex-col gap-1 rounded-2xl bg-card p-4",
								TRAFFIC_BG[sum.level.traffic],
							)}
						>
							<p className="font-medium text-xl">
								{t("level", { level: sum.level.level })}
							</p>
							<p>
								<Badge variant={TRAFFIC_TONE[sum.level.traffic]}>
									{sum.level.status}
								</Badge>
							</p>
							<p className="text-subhead">
								{t("recommendation", { text: sum.level.recommendation })}
							</p>
							<p className="text-muted-foreground text-subhead">
								{t("reviewIn", {
									months:
										criticality === "critical"
											? Math.min(sum.level.months, 12)
											: sum.level.months,
								})}
							</p>
						</div>
					) : (
						<p className="rounded-2xl bg-card p-3 text-subhead">
							{t("noResult")}
						</p>
					)}
					{sum.open.length > 0 && (
						<div className="rounded-xl bg-warning/12 p-3 text-subhead">
							<p className="font-medium">
								{t("openCriteria", { n: sum.open.length })}
							</p>
							<ul className="mt-1 list-disc pl-5">
								{sum.open.map((c) => (
									<li key={c.code}>
										<button
											type="button"
											className="text-left text-primary hover:underline"
											onClick={() =>
												goto(c.area === "general" ? "allgemein" : "sicherheit")
											}
										>
											{c.title}
										</button>
									</li>
								))}
							</ul>
						</div>
					)}
				</div>
			)}

			{step === "massnahmen" && (
				<div className="flex flex-col gap-4">
					{!sum.level && <p className="text-subhead">{t("noResult")}</p>}
					<ul className="flex flex-col gap-2">
						{[
							...suggested,
							...SUPPLIER_MEASURES.filter(
								(m) =>
									!suggested.some((s) => s.code === m.code) &&
									picked[m.code]?.on,
							),
						].map((m) => (
							<MeasureRow
								key={m.code}
								text={m.text}
								hint={m.hint}
								on={isPicked(m.code)}
								owner={picked[m.code]?.owner ?? ""}
								due={picked[m.code]?.due ?? ""}
								members={members}
								labels={{
									owner: t("measureOwner"),
									due: t("measureDue"),
									defaultOwner: t("providerOwner"),
								}}
								onChange={(v) =>
									setPicked((x) => ({
										...x,
										[m.code]: {
											on: v.on ?? isPicked(m.code),
											owner: v.owner ?? x[m.code]?.owner ?? "",
											due: v.due ?? x[m.code]?.due ?? "",
										},
									}))
								}
							/>
						))}
					</ul>
					<details className="rounded-2xl bg-card p-3 text-subhead">
						<summary className="cursor-pointer">{t("moreMeasures")}</summary>
						<ul className="mt-3 flex flex-col gap-1.5">
							{SUPPLIER_MEASURES.filter(
								(m) => !suggested.some((s) => s.code === m.code),
							).map((m) => (
								<li key={m.code}>
									<label className="flex cursor-pointer items-start gap-2">
										<input
											type="checkbox"
											className="mt-0.5 accent-primary"
											checked={isPicked(m.code)}
											onChange={(e) =>
												setPicked((x) => ({
													...x,
													[m.code]: {
														on: e.target.checked,
														owner: x[m.code]?.owner ?? "",
														due: x[m.code]?.due ?? "",
													},
												}))
											}
										/>
										<span>
											{m.text}
											<span className="block text-muted-foreground text-footnote">
												{m.hint}
											</span>
										</span>
									</label>
								</li>
							))}
						</ul>
					</details>
				</div>
			)}

			{step === "freigabe" && (
				<div className="flex flex-col gap-4">
					{sum.level && (
						<p
							className={cn(
								"rounded-2xl bg-card p-3 text-subhead",
								TRAFFIC_BG[sum.level.traffic],
							)}
						>
							{t("recommendationIs", {
								level: sum.level.level,
								text: sum.level.recommendation,
							})}
						</p>
					)}
					<fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-3">
						<legend className="mb-1 font-medium text-subhead">
							{t("decision")}
						</legend>
						{(
							["approved", "approved_with_conditions", "rejected"] as const
						).map((k) => (
							<label
								key={k}
								className="flex cursor-pointer flex-col gap-1 rounded-2xl bg-card p-3 text-subhead has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50"
							>
								<span className="flex items-center gap-2 font-medium">
									<input
										type="radio"
										name="decision"
										className="accent-primary"
										checked={decision === k}
										onChange={() => setDecision(k)}
									/>
									{t(`decision_${k}`)}
								</span>
								<span className="text-muted-foreground text-footnote">
									{t(`decisionHint_${k}`)}
								</span>
							</label>
						))}
					</fieldset>
					{sum.level?.traffic === "red" &&
						(decision === "approved" ||
							decision === "approved_with_conditions") && (
							<p className="rounded-xl bg-warning/12 p-2 text-subhead">
								{t("redNeedsManagement")}
							</p>
						)}
					<div className="flex flex-col gap-1">
						<Label htmlFor="rt-note">{t("decisionNote")}</Label>
						<Textarea
							id="rt-note"
							value={note}
							maxLength={4000}
							onChange={(e) => setNote(e.target.value)}
						/>
					</div>
					<details className="text-subhead">
						<summary className="cursor-pointer text-muted-foreground">
							{t("soloTitle")}
						</summary>
						<Textarea
							className="mt-2 min-h-14"
							aria-label={t("soloTitle")}
							placeholder={t("soloPlaceholder")}
							value={soloReason}
							maxLength={2000}
							onChange={(e) => setSoloReason(e.target.value)}
						/>
					</details>
					<p className="text-muted-foreground text-footnote">
						{t("measuresPicked", {
							n: SUPPLIER_MEASURES.filter((m) => isPicked(m.code)).length,
						})}
					</p>
				</div>
			)}

			<footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background py-3">
				<span className="flex gap-2">
					<Button
						type="button"
						variant="ghost"
						disabled={idx === 0 || pending}
						onClick={() => goto(STEPS[idx - 1] ?? step)}
					>
						{t("back")}
					</Button>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button type="button" variant="ghost" disabled={pending}>
								{t("deleteDraft")}
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>{t("deleteDraft")}</AlertDialogTitle>
								<AlertDialogDescription>
									{t("deleteConfirm")}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
								<AlertDialogAction
									className={buttonVariants({ variant: "destructive" })}
									onClick={() =>
										start(async () => {
											const res = await deleteRatingDraft({
												ratingId: rating.id,
											});
											if (!res.ok) return void toast.error(t("saveFailed"));
											router.push(
												`/dienstleister/${provider.id}?tab=bewertungen`,
											);
										})
									}
								>
									{t("deleteDraft")}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</span>
				{step === "freigabe" ? (
					<Button
						type="button"
						onClick={complete}
						disabled={pending || sum.open.length > 0}
					>
						{sum.level?.traffic === "red" &&
						(decision === "approved" || decision === "approved_with_conditions")
							? t("completeToManagement")
							: t("complete")}
					</Button>
				) : (
					<Button
						type="button"
						onClick={() => goto(STEPS[idx + 1] ?? step)}
						disabled={pending}
					>
						{t("next")}
					</Button>
				)}
			</footer>
		</div>
	);
}

function YesNo({
	name,
	legend,
	hint,
	value,
	onChange,
	labels,
}: {
	name: string;
	legend: string;
	hint?: string;
	value: boolean | null;
	onChange: (v: boolean) => void;
	labels: { yes: string; no: string };
}) {
	return (
		<fieldset className="flex flex-col gap-1">
			<legend className="font-medium text-subhead">{legend}</legend>
			{hint && <p className="text-muted-foreground text-footnote">{hint}</p>}
			<div className="mt-1 flex gap-2">
				{([true, false] as const).map((v) => (
					<label
						key={String(v)}
						className="flex cursor-pointer items-center gap-2 rounded-xl bg-card px-3 py-1.5 text-subhead has-[:checked]:border-primary has-[:checked]:bg-primary/5"
					>
						<input
							type="radio"
							name={name}
							className="accent-primary"
							checked={value === v}
							onChange={() => onChange(v)}
						/>
						{v ? labels.yes : labels.no}
					</label>
				))}
			</div>
		</fieldset>
	);
}

function MeasureRow({
	text,
	hint,
	on,
	owner,
	due,
	members,
	labels,
	onChange,
}: {
	text: string;
	hint: string;
	on: boolean;
	owner: string;
	due: string;
	members: MemberOption[];
	labels: { owner: string; due: string; defaultOwner: string };
	onChange: (v: { on?: boolean; owner?: string; due?: string }) => void;
}) {
	return (
		<li className="grid grid-cols-1 gap-2 rounded-2xl bg-card p-2 text-subhead md:grid-cols-[1fr_12rem_10rem]">
			<label className="flex cursor-pointer items-start gap-2">
				<input
					type="checkbox"
					className="mt-0.5 accent-primary"
					checked={on}
					onChange={(e) => onChange({ on: e.target.checked })}
				/>
				<span>
					{text}
					<span className="block text-muted-foreground text-footnote">
						{hint}
					</span>
				</span>
			</label>
			<select
				aria-label={labels.owner}
				className={selectCls}
				value={owner}
				disabled={!on}
				onChange={(e) => onChange({ owner: e.target.value })}
			>
				<option value="">{labels.defaultOwner}</option>
				{members.map((m) => (
					<option key={m.userId} value={m.userId}>
						{m.name || m.email}
					</option>
				))}
			</select>
			<input
				type="date"
				aria-label={labels.due}
				className={selectCls}
				value={due}
				disabled={!on}
				onChange={(e) => onChange({ due: e.target.value })}
			/>
		</li>
	);
}
