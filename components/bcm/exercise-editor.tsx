"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { completeBcmExercise, saveBcmExercise } from "@/app/actions/bcm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-alert";
import { errorText } from "@/components/ui/error-text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { ExerciseParticipant, ExerciseScriptStep } from "@/db/schema/bcm";
import { EXERCISE_KINDS, type ExerciseKind } from "@/db/schema/enums";
import {
	exerciseOutcome,
	formatMinutes,
	measuresTime,
} from "@/lib/bcm/exercise";

export type ExerciseDraft = {
	id: string;
	title: string;
	kind: ExerciseKind;
	plannedAt: string | null;
	scenario: string;
	script: ExerciseScriptStep[];
	participants: ExerciseParticipant[];
	startedAt: string | null;
	endedAt: string | null;
	recoveryMinutes: number | null;
	dataLossMinutes: number | null;
	lessons: string;
	measures: string[];
};

const RESULT_TONE = {
	pass: "success",
	partial: "warning",
	fail: "destructive",
} as const;

// Notfallübung: Drehbuch mit Soll/Ist, Teilnehmende, Messung gegen RTO/RPO,
// Erkenntnisse und Maßnahmen. Das Ergebnis rechnet live mit; Abschließen
// schreibt den Test ins Testprogramm und legt die Maßnahmen als Aufgaben an.
export function ExerciseEditor({
	initial,
	done,
	result,
	target,
}: {
	initial: ExerciseDraft;
	done: boolean;
	result: "pass" | "partial" | "fail" | null;
	target: { rtoHours: number | null; rpoHours: number | null };
}) {
	const t = useTranslations("Bcm");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [d, setD] = useState<ExerciseDraft>(initial);
	const [dirty, setDirty] = useState(false);
	const confirm = useConfirm({
		title: t("exCompleteTitle"),
		description: t("exCompleteLead"),
		confirmLabel: t("exComplete"),
		destructive: false,
	});
	const set = (patch: Partial<ExerciseDraft>) => {
		setD({ ...d, ...patch });
		setDirty(true);
	};
	const outcome = useMemo(
		() =>
			exerciseOutcome(
				d.kind,
				target,
				{
					recoveryMinutes: d.recoveryMinutes,
					dataLossMinutes: d.dataLossMinutes,
				},
				d.script,
			),
		[d, target],
	);
	const num = (v: string) => (v === "" ? null : Number(v));
	const step = (i: number, patch: Partial<ExerciseScriptStep>) =>
		set({ script: d.script.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

	const save = (then?: () => void) =>
		start(async () => {
			const res = await saveBcmExercise({
				...d,
				startedAt: d.startedAt ? new Date(d.startedAt) : null,
				endedAt: d.endedAt ? new Date(d.endedAt) : null,
			});
			if (!res.ok) return void toast.error(errorText(tc, res));
			setDirty(false);
			if (then) then();
			else {
				toast.success(t("exSaved"));
				router.refresh();
			}
		});
	const complete = () =>
		save(() =>
			start(async () => {
				const res = await completeBcmExercise({ id: d.id });
				if (!res.ok) return void toast.error(errorText(tc, res));
				toast.success(t(`exDone_${res.data.result}`));
				router.refresh();
			}),
		);

	const field = "flex flex-col gap-1.5";
	return (
		<div className="flex flex-col gap-8">
			<section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<div className={`${field} sm:col-span-3`}>
					<Label htmlFor="ex-title">{t("exTitle")}</Label>
					<Input
						id="ex-title"
						value={d.title}
						disabled={done}
						onChange={(e) => set({ title: e.target.value })}
						autoComplete="off"
					/>
				</div>
				<div className={field}>
					<Label>{t("exKind")}</Label>
					<Select
						value={d.kind}
						disabled={done}
						onValueChange={(v) => set({ kind: v as ExerciseKind })}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{EXERCISE_KINDS.map((k) => (
								<SelectItem key={k} value={k}>
									{t(`exKind_${k}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className={field}>
					<Label htmlFor="ex-planned">{t("exPlannedAt")}</Label>
					<Input
						id="ex-planned"
						type="date"
						value={d.plannedAt ?? ""}
						disabled={done}
						onChange={(e) => set({ plannedAt: e.target.value || null })}
					/>
				</div>
				<p className="text-footnote text-muted-foreground sm:self-end">
					{t(`exKindHint_${d.kind}`)}
				</p>
				<div className={`${field} sm:col-span-3`}>
					<Label htmlFor="ex-scenario">{t("exScenario")}</Label>
					<Textarea
						id="ex-scenario"
						rows={3}
						value={d.scenario}
						disabled={done}
						placeholder={t("exScenarioPlaceholder")}
						onChange={(e) => set({ scenario: e.target.value })}
					/>
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="font-semibold text-headline">{t("exScript")}</h2>
				<p className="text-footnote text-muted-foreground">
					{t("exScriptLead")}
				</p>
				<ol className="flex flex-col gap-3">
					{d.script.map((s, i) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: Zeilen ohne eigene Kennung
							key={i}
							className="grid grid-cols-2 gap-2 rounded-xl bg-card p-3 lg:grid-cols-[2fr_6rem_6rem_10rem_1fr_auto] lg:items-end"
						>
							<div className={`${field} col-span-2 lg:col-span-1`}>
								<Label htmlFor={`ex-s-${i}`}>{t("exStep", { n: i + 1 })}</Label>
								<Input
									id={`ex-s-${i}`}
									value={s.text}
									disabled={done}
									onChange={(e) => step(i, { text: e.target.value })}
								/>
							</div>
							<div className={field}>
								<Label htmlFor={`ex-se-${i}`}>{t("exExpected")}</Label>
								<Input
									id={`ex-se-${i}`}
									type="number"
									inputMode="numeric"
									min={0}
									value={s.expectedMinutes ?? ""}
									disabled={done}
									onChange={(e) =>
										step(i, { expectedMinutes: num(e.target.value) })
									}
								/>
							</div>
							<div className={field}>
								<Label htmlFor={`ex-sa-${i}`}>{t("exActual")}</Label>
								<Input
									id={`ex-sa-${i}`}
									type="number"
									inputMode="numeric"
									min={0}
									value={s.actualMinutes ?? ""}
									disabled={done}
									aria-invalid={
										s.expectedMinutes !== null &&
										s.actualMinutes !== null &&
										s.actualMinutes > s.expectedMinutes
									}
									onChange={(e) =>
										step(i, { actualMinutes: num(e.target.value) })
									}
								/>
							</div>
							<div className={field}>
								<Label>{t("exStepState")}</Label>
								<Select
									value={s.ok === null ? "open" : s.ok ? "ok" : "fail"}
									disabled={done}
									onValueChange={(v) =>
										step(i, { ok: v === "open" ? null : v === "ok" })
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="open">{t("exStepOpen")}</SelectItem>
										<SelectItem value="ok">{t("exStepOk")}</SelectItem>
										<SelectItem value="fail">{t("exStepFail")}</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className={field}>
								<Label htmlFor={`ex-sn-${i}`}>{t("exNote")}</Label>
								<Input
									id={`ex-sn-${i}`}
									value={s.note}
									disabled={done}
									onChange={(e) => step(i, { note: e.target.value })}
								/>
							</div>
							{!done && (
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label={tc("remove")}
									onClick={() =>
										set({ script: d.script.filter((_, j) => j !== i) })
									}
								>
									<Trash2 />
								</Button>
							)}
						</li>
					))}
				</ol>
				{!done && (
					<div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() =>
								set({
									script: [
										...d.script,
										{
											text: "",
											expectedMinutes: null,
											actualMinutes: null,
											ok: null,
											note: "",
										},
									],
								})
							}
						>
							<Plus />
							{t("planAddStep")}
						</Button>
					</div>
				)}
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="font-semibold text-headline">{t("exParticipants")}</h2>
				<ul className="flex flex-col gap-2">
					{d.participants.map((p, i) => (
						<li
							// biome-ignore lint/suspicious/noArrayIndexKey: Zeilen ohne eigene Kennung
							key={i}
							className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
						>
							<div className={field}>
								<Label htmlFor={`ex-p-${i}`}>{t("contact_name")}</Label>
								<Input
									id={`ex-p-${i}`}
									value={p.who}
									disabled={done}
									autoComplete="off"
									onChange={(e) =>
										set({
											participants: d.participants.map((x, j) =>
												j === i ? { ...x, who: e.target.value } : x,
											),
										})
									}
								/>
							</div>
							<div className={field}>
								<Label htmlFor={`ex-pr-${i}`}>{t("contact_role")}</Label>
								<Input
									id={`ex-pr-${i}`}
									value={p.role}
									disabled={done}
									onChange={(e) =>
										set({
											participants: d.participants.map((x, j) =>
												j === i ? { ...x, role: e.target.value } : x,
											),
										})
									}
								/>
							</div>
							{!done && (
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label={tc("remove")}
									onClick={() =>
										set({
											participants: d.participants.filter((_, j) => j !== i),
										})
									}
								>
									<Trash2 />
								</Button>
							)}
						</li>
					))}
				</ul>
				{!done && (
					<div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() =>
								set({
									participants: [...d.participants, { who: "", role: "" }],
								})
							}
						>
							<Plus />
							{t("exAddParticipant")}
						</Button>
					</div>
				)}
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="font-semibold text-headline">{t("exMeasure")}</h2>
				<p className="text-footnote text-muted-foreground">
					{measuresTime(d.kind) ? t("exMeasureLead") : t("exMeasureLeadTalk")}
				</p>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<div className={field}>
						<Label htmlFor="ex-start">{t("exStarted")}</Label>
						<Input
							id="ex-start"
							type="datetime-local"
							value={d.startedAt ?? ""}
							disabled={done}
							onChange={(e) => set({ startedAt: e.target.value || null })}
						/>
					</div>
					<div className={field}>
						<Label htmlFor="ex-end">{t("exEnded")}</Label>
						<Input
							id="ex-end"
							type="datetime-local"
							value={d.endedAt ?? ""}
							disabled={done}
							onChange={(e) => set({ endedAt: e.target.value || null })}
						/>
					</div>
					<div className={field}>
						<Label htmlFor="ex-rec">{t("exRecovery")}</Label>
						<Input
							id="ex-rec"
							type="number"
							inputMode="numeric"
							min={0}
							value={d.recoveryMinutes ?? ""}
							disabled={done}
							aria-invalid={outcome.rtoMet === false}
							onChange={(e) => set({ recoveryMinutes: num(e.target.value) })}
						/>
						<p className="text-footnote text-muted-foreground">
							{target.rtoHours === null
								? t("exNoRto")
								: t("exTarget", { value: `${target.rtoHours} h` })}
						</p>
					</div>
					<div className={field}>
						<Label htmlFor="ex-loss">{t("exDataLoss")}</Label>
						<Input
							id="ex-loss"
							type="number"
							inputMode="numeric"
							min={0}
							value={d.dataLossMinutes ?? ""}
							disabled={done}
							aria-invalid={outcome.rpoMet === false}
							onChange={(e) => set({ dataLossMinutes: num(e.target.value) })}
						/>
						<p className="text-footnote text-muted-foreground">
							{target.rpoHours === null
								? t("exNoRpo")
								: t("exTarget", { value: `${target.rpoHours} h` })}
						</p>
					</div>
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="font-semibold text-headline">{t("exLessons")}</h2>
				<Textarea
					aria-label={t("exLessons")}
					rows={3}
					value={d.lessons}
					disabled={done}
					onChange={(e) => set({ lessons: e.target.value })}
				/>
				<h3 className="font-semibold text-subhead">{t("exMeasures")}</h3>
				<p className="text-footnote text-muted-foreground">
					{t("exMeasuresLead")}
				</p>
				<ul className="flex flex-col gap-2">
					{d.measures.map((m, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: Zeilen ohne eigene Kennung
						<li key={i} className="flex items-center gap-2">
							<Input
								aria-label={t("exMeasureN", { n: i + 1 })}
								value={m}
								disabled={done}
								onChange={(e) =>
									set({
										measures: d.measures.map((x, j) =>
											j === i ? e.target.value : x,
										),
									})
								}
							/>
							{!done && (
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label={tc("remove")}
									onClick={() =>
										set({ measures: d.measures.filter((_, j) => j !== i) })
									}
								>
									<Trash2 />
								</Button>
							)}
						</li>
					))}
				</ul>
				{!done && (
					<div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => set({ measures: [...d.measures, ""] })}
						>
							<Plus />
							{t("exAddMeasure")}
						</Button>
					</div>
				)}
			</section>

			<section
				className="flex flex-col gap-3 rounded-xl bg-card p-4"
				aria-live="polite"
			>
				<h2 className="font-semibold text-headline">{t("resultTitle")}</h2>
				<div className="flex flex-wrap items-center gap-2">
					<Badge
						variant={RESULT_TONE[done && result ? result : outcome.result]}
					>
						{t(`exResult_${done && result ? result : outcome.result}`)}
					</Badge>
					{outcome.rtoMet !== null && d.recoveryMinutes !== null && (
						<span className="text-subhead">
							{t(outcome.rtoMet ? "exRtoMet" : "exRtoMissed", {
								value: formatMinutes(d.recoveryMinutes),
							})}
						</span>
					)}
					{outcome.rpoMet !== null && d.dataLossMinutes !== null && (
						<span className="text-subhead">
							{t(outcome.rpoMet ? "exRpoMet" : "exRpoMissed", {
								value: formatMinutes(d.dataLossMinutes),
							})}
						</span>
					)}
				</div>
				{(outcome.stepsFailed > 0 ||
					outcome.stepsLate > 0 ||
					outcome.stepsOpen > 0) && (
					<p className="text-footnote text-muted-foreground">
						{t("exStepsSummary", {
							failed: outcome.stepsFailed,
							late: outcome.stepsLate,
							open: outcome.stepsOpen,
						})}
					</p>
				)}
				{!done && (
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							disabled={pending || !dirty}
							onClick={() => save()}
						>
							{t("planSave")}
						</Button>
						<Button
							type="button"
							disabled={pending}
							onClick={() => confirm.ask(complete)}
						>
							{t("exComplete")}
						</Button>
					</div>
				)}
				{done && (
					<p className="text-footnote text-muted-foreground">
						{t("exDoneHint")}
					</p>
				)}
			</section>
			{confirm.node}
		</div>
	);
}
