"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	useTransition,
} from "react";
import {
	savePolicyBuilder,
	startPolicyBuilder,
	switchToCustomText,
} from "@/app/actions/document-builder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-alert";
import { ContainedScroll } from "@/components/ui/contained-scroll";
import { errorText } from "@/components/ui/error-text";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
	answerText,
	exampleText,
	policyCompletion,
	type RenderPart,
	renderSections,
	visibleQuestions,
} from "@/lib/documents/builder/render";
import type {
	BuilderAnswer,
	BuilderQuestion,
	PolicyBuilder,
} from "@/lib/documents/builder/types";
import { cn } from "@/lib/utils";

// Richtlinien-Baukasten (Teil 5): links der Abschnitt mit seinen Fragen,
// rechts die ganze Richtlinie live; offene Lücken gelb. Speichert 2 s nach
// der letzten Eingabe und beim Abschnittswechsel.

export type FunctionOption = { value: string; label: string; held: boolean };

type Patch = Record<string, BuilderAnswer | null>;
type SaveState = "saved" | "dirty" | "saving" | "error";

const SAVE_DELAY_MS = 2000;

export function PolicyBuilderPanel({
	documentId,
	title,
	builder,
	initial,
	orgName,
	functionOptions,
	editable,
}: {
	documentId: string;
	title: string;
	builder: PolicyBuilder;
	initial: Record<string, BuilderAnswer>;
	orgName: string;
	functionOptions: FunctionOption[];
	editable: boolean;
}) {
	const t = useTranslations("PolicyBuilder");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [answers, setAnswers] = useState(initial);
	const [index, setIndex] = useState(0);
	const [state, setState] = useState<SaveState>("saved");
	const [savedAt, setSavedAt] = useState<Date | null>(null);
	const pending = useRef<Patch>({});
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [, startSave] = useTransition();
	const uid = useId();
	const [switching, startSwitch] = useTransition();
	const toCustom = useConfirm({
		title: t("customTitle"),
		description: t("customLead"),
		confirmLabel: t("customConfirm"),
		destructive: false,
	});

	const names = useMemo(
		() => new Map(functionOptions.map((o) => [o.value, o.label])),
		[functionOptions],
	);
	const ctx = useMemo(
		() => ({
			title,
			orgName,
			functionName: (k: string) => names.get(k) ?? k,
		}),
		[title, orgName, names],
	);
	const sections = useMemo(
		() => renderSections(builder, answers, ctx),
		[builder, answers, ctx],
	);
	const completion = policyCompletion(builder, answers, ctx);
	const visible = new Set(visibleQuestions(builder, answers).map((q) => q.key));
	const section = builder.sections[index] ?? builder.sections[0];

	const flush = useCallback(() => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = null;
		const patch = pending.current;
		if (Object.keys(patch).length === 0) return;
		pending.current = {};
		setState("saving");
		startSave(async () => {
			const res = await savePolicyBuilder({ documentId, patch });
			if (!res.ok) {
				// beim nächsten Speichern erneut mitschicken
				pending.current = { ...patch, ...pending.current };
				setState("error");
				toast.error(res.error === "locked" ? t("locked") : errorText(tc, res));
				return;
			}
			setSavedAt(new Date());
			setState(Object.keys(pending.current).length > 0 ? "dirty" : "saved");
		});
	}, [documentId, t, tc]);

	// ungespeicherte Antworten beim Verlassen der Seite
	useEffect(() => {
		const warn = (e: BeforeUnloadEvent) => {
			if (Object.keys(pending.current).length > 0) e.preventDefault();
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, []);
	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);

	const setAnswer = (key: string, value: BuilderAnswer | null) => {
		setAnswers((a) => {
			const next = { ...a };
			if (value === null) delete next[key];
			else next[key] = value;
			return next;
		});
		pending.current = { ...pending.current, [key]: value };
		setState("dirty");
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(flush, SAVE_DELAY_MS);
	};

	const go = (i: number) => {
		flush();
		setIndex(i);
		const id = builder.sections[i]?.id;
		const el = id ? document.getElementById(`${uid}-${id}`) : null;
		const reduce = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		el?.scrollIntoView({
			block: "nearest",
			behavior: reduce ? "auto" : "smooth",
		});
	};

	const status =
		state === "saving"
			? t("saving")
			: state === "dirty"
				? t("unsaved")
				: state === "error"
					? t("saveFailed")
					: savedAt
						? t("savedAt", { time: savedAt })
						: t("savedAuto");

	return (
		<div className="flex flex-col gap-4">
			{toCustom.node}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-subhead">
					<span className="font-semibold tabular-nums">
						{t("progress", {
							answered: completion.answered,
							total: completion.total,
						})}
					</span>
					{editable && (
						<span
							role="status"
							aria-live="polite"
							className="ml-2 text-footnote text-muted-foreground"
						>
							{status}
						</span>
					)}
				</p>
				{editable && (
					<Button
						type="button"
						size="sm"
						variant="secondary"
						disabled={switching}
						onClick={() =>
							toCustom.ask(() =>
								startSwitch(async () => {
									flush();
									const res = await switchToCustomText({ documentId });
									if (!res.ok) toast.error(errorText(tc, res));
									else router.refresh();
								}),
							)
						}
					>
						{t("toCustom")}
					</Button>
				)}
			</div>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
				<div className="flex min-w-0 flex-col gap-4">
					<nav aria-label={t("sections")}>
						<ol className="flex flex-col gap-0.5">
							{builder.sections.map((s, i) => {
								const c = completion.bySection[i];
								const done = c && c.total > 0 && c.answered === c.total;
								return (
									<li key={s.id}>
										<button
											type="button"
											onClick={() => go(i)}
											aria-current={i === index ? "step" : undefined}
											className={cn(
												"flex min-h-(--control-h) w-full items-center gap-2 rounded-lg px-3 text-left text-subhead hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
												i === index && "bg-muted font-medium",
											)}
										>
											<span className="w-5 shrink-0 text-muted-foreground tabular-nums">
												{i + 1}.
											</span>
											<span className="min-w-0 flex-1 truncate">
												{s.heading}
											</span>
											{done ? (
												<Check
													aria-label={t("sectionDone")}
													className="size-4 text-success"
												/>
											) : (
												c &&
												c.total > 0 && (
													<span className="text-footnote text-muted-foreground tabular-nums">
														{c.answered}/{c.total}
													</span>
												)
											)}
										</button>
									</li>
								);
							})}
						</ol>
					</nav>

					{section && (
						<section
							aria-labelledby={`pb-${section.id}`}
							className="flex flex-col gap-4 rounded-2xl bg-card p-4"
						>
							<h3
								id={`pb-${section.id}`}
								className="font-semibold text-headline"
							>
								{index + 1}. {section.heading}
							</h3>
							{section.questions.filter((q) => visible.has(q.key)).length ===
							0 ? (
								<p className="text-muted-foreground text-subhead">
									{t("noQuestions")}
								</p>
							) : (
								section.questions
									.filter((q) => visible.has(q.key))
									.map((q) => (
										<QuestionField
											key={q.key}
											q={q}
											value={answers[q.key]}
											onChange={(v) => setAnswer(q.key, v)}
											functionOptions={functionOptions}
											exampleOf={(x) => exampleText(x, ctx)}
											answered={answerText(q, answers[q.key], ctx) !== null}
											disabled={!editable}
										/>
									))
							)}
							<div className="flex items-center justify-between gap-2 pt-1">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={index === 0}
									onClick={() => go(index - 1)}
								>
									{t("back")}
								</Button>
								{index < builder.sections.length - 1 && (
									<Button type="button" size="sm" onClick={() => go(index + 1)}>
										{t("next")}
									</Button>
								)}
							</div>
						</section>
					)}
				</div>

				<ContainedScroll
					aria-label={t("preview")}
					className="min-w-0 rounded-2xl bg-card p-4 lg:max-h-[min(75vh,52rem)] lg:overflow-y-auto"
				>
					<h3 className="mb-1 font-semibold text-title-3">{title}</h3>
					<p className="mb-4 text-footnote text-muted-foreground">
						{t("previewLead")}
					</p>
					{sections.map((s, i) => (
						<div
							key={s.id}
							id={`${uid}-${s.id}`}
							className={cn(
								"scroll-mt-4 border-l-2 py-1 pl-3",
								i === index ? "border-primary" : "border-transparent",
							)}
						>
							<h4 className="mt-2 mb-1 font-semibold text-subhead">
								{s.number}. {s.heading}
							</h4>
							{s.blocks.map((b, j) =>
								b.kind === "p" ? (
									<p
										// biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
										key={j}
										className="mb-2 text-subhead text-pretty"
									>
										<Parts parts={b.parts} />
									</p>
								) : (
									<ul
										// biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
										key={j}
										className="mb-2 list-disc pl-5 text-subhead"
									>
										{b.items.map((it, k) => (
											// biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
											<li key={k} className="text-pretty">
												<Parts parts={it} />
											</li>
										))}
									</ul>
								),
							)}
						</div>
					))}
				</ContainedScroll>
			</div>
		</div>
	);
}

function Parts({ parts }: { parts: readonly RenderPart[] }) {
	return parts.map((p, i) =>
		p.t === "gap" ? (
			<mark
				// biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
				key={i}
				className="rounded bg-warning/25 px-0.5 text-foreground"
			>
				{p.text}
			</mark>
		) : (
			// biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge
			<span key={i}>{p.text}</span>
		),
	);
}

function QuestionField({
	q,
	value,
	onChange,
	functionOptions,
	exampleOf,
	answered,
	disabled,
}: {
	q: BuilderQuestion;
	value: BuilderAnswer | undefined;
	onChange: (v: BuilderAnswer | null) => void;
	functionOptions: FunctionOption[];
	exampleOf: (q: BuilderQuestion) => string;
	answered: boolean;
	disabled: boolean;
}) {
	const t = useTranslations("PolicyBuilder");
	const id = useId();
	const help = q.help ? (
		<p id={`${id}-help`} className="text-footnote text-muted-foreground">
			{q.help}
		</p>
	) : null;
	const describedBy = q.help ? `${id}-help` : undefined;
	const label = (
		<span className="flex items-start gap-2">
			<span className="font-medium text-subhead">{q.label}</span>
			{answered && (
				<Check
					aria-hidden="true"
					className="mt-0.5 size-4 shrink-0 text-success"
				/>
			)}
		</span>
	);

	if (q.kind === "choice")
		return (
			<fieldset className="flex flex-col gap-2" aria-describedby={describedBy}>
				<legend className="mb-1">{label}</legend>
				{help}
				<div className="flex flex-col gap-1.5">
					{q.options.map((o) => {
						const selected = String(value ?? "") === o.value;
						return (
							<label
								key={o.value}
								className={cn(
									"flex min-h-(--control-h) cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-subhead hover:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:disabled]:cursor-default has-[:disabled]:opacity-60",
									selected
										? "border-primary bg-primary/10"
										: "border-border bg-background",
								)}
							>
								<input
									type="radio"
									name={id}
									value={o.value}
									checked={selected}
									disabled={disabled}
									onChange={() => onChange(o.value)}
									className="size-4 shrink-0 accent-(--primary)"
								/>
								<span className="min-w-0 flex-1">{o.label}</span>
								{q.recommended === o.value && (
									<Badge variant="muted">{t("recommended")}</Badge>
								)}
							</label>
						);
					})}
				</div>
			</fieldset>
		);

	if (q.kind === "function")
		return (
			<div className="flex flex-col gap-2">
				<label htmlFor={id}>{label}</label>
				{help}
				<Select
					value={value === undefined ? "" : String(value)}
					onValueChange={(v) => onChange(v)}
					disabled={disabled}
				>
					<SelectTrigger id={id} aria-describedby={describedBy}>
						<SelectValue
							placeholder={t("pickFunction", { example: exampleOf(q) })}
						/>
					</SelectTrigger>
					<SelectContent>
						{functionOptions.map((o) => (
							<SelectItem key={o.value} value={o.value}>
								{o.label}
								{o.value === q.suggest ? ` · ${t("recommended")}` : ""}
								{o.held ? "" : ` · ${t("vacant")}`}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		);

	if (q.kind === "number")
		return (
			<div className="flex flex-col gap-2">
				<label htmlFor={id}>{label}</label>
				{help}
				<div className="flex flex-wrap items-center gap-2">
					<Input
						id={id}
						type="number"
						inputMode="numeric"
						min={q.min}
						max={q.max}
						step={1}
						className="w-28"
						disabled={disabled}
						aria-describedby={describedBy}
						defaultValue={value === undefined ? "" : String(value)}
						placeholder={
							q.recommended !== undefined ? String(q.recommended) : undefined
						}
						onChange={(e) => {
							const s = e.target.value.trim();
							if (s === "") return onChange(null);
							const n = Number(s);
							if (Number.isInteger(n) && n >= q.min && n <= q.max) onChange(n);
						}}
					/>
					<span className="text-subhead text-muted-foreground">
						{q.unit[1]}
					</span>
					{q.recommended !== undefined && value === undefined && (
						<span className="text-footnote text-muted-foreground">
							{t("recommendedValue", { value: exampleOf(q) })}
						</span>
					)}
				</div>
			</div>
		);

	const Field = q.multiline ? Textarea : Input;
	return (
		<div className="flex flex-col gap-2">
			<label htmlFor={id}>{label}</label>
			{help}
			<Field
				id={id}
				disabled={disabled}
				aria-describedby={describedBy}
				defaultValue={value === undefined ? "" : String(value)}
				placeholder={t("example", { example: q.example })}
				autoComplete="off"
				maxLength={2000}
				onChange={(e) => {
					const s = e.target.value;
					onChange(s.trim() === "" ? null : s);
				}}
			/>
		</div>
	);
}

/** Aufruf am Entwurf: Baukasten starten (ersetzt den Text nach Rückfrage) */
export function StartPolicyBuilder({
	documentId,
	replacesText,
	resume,
}: {
	documentId: string;
	// der Text weicht vom Gerüst der Vorlage ab: Rückfrage
	replacesText: boolean;
	// zurück aus „Eigener Text“
	resume: boolean;
}) {
	const t = useTranslations("PolicyBuilder");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const confirm = useConfirm({
		title: resume ? t("resumeTitle") : t("startTitle"),
		description: resume ? t("resumeLead") : t("startLead"),
		confirmLabel: resume ? t("resume") : t("start"),
	});
	const run = () =>
		start(async () => {
			const res = await startPolicyBuilder({ documentId });
			if (!res.ok) toast.error(errorText(tc, res));
			else router.refresh();
		});
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-primary/10 px-4 py-3">
			{confirm.node}
			<p className="min-w-0 flex-1 text-subhead">
				{resume ? t("resumeHint") : t("startHint")}
			</p>
			<Button
				type="button"
				size="sm"
				disabled={pending}
				onClick={() => (replacesText || resume ? confirm.ask(run) : run())}
			>
				{resume ? t("resume") : t("start")}
			</Button>
		</div>
	);
}
