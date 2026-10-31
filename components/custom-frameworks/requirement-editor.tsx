"use client";

import { ChevronDown, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState, useTransition } from "react";
import {
	deleteCustomRequirementAction,
	saveCustomRequirementAction,
	setCustomExclusionAction,
	suggestCustomControlsAction,
} from "@/app/actions/custom-frameworks";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-alert";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { DOMAINS, type Domain } from "@/db/schema/enums";
import { MAX_CONTROLS_PER_REQUIREMENT } from "@/lib/custom-frameworks/rules";
import { useCfError } from "./use-cf-error";

export type EditorRequirement = {
	id: string;
	sectionCode: string;
	code: string;
	title: string;
	text: string;
	domain: Domain;
	guidance: string | null;
	auditQuestions: string[];
	evidenceHints: string[];
	excluded: boolean;
	exclusionReason: string | null;
	controls: {
		controlCode: string;
		coverage: "full" | "partial";
		note: string | null;
	}[];
};

type Mapping = { code: string; coverage: "full" | "partial"; note: string };
type Suggestion = { code: string; title: string; reason: string[] };

const NEW_SECTION = "__neu";
const lines = (v: string) =>
	v
		.split("\n")
		.map((x) => x.trim())
		.filter(Boolean)
		.slice(0, 10);

// Eine Anforderung anlegen oder bearbeiten (Dialog, geöffnet über die URL:
// ?anf=<id> bzw. ?neu=1). Zuordnung zu Klick-Maßnahmen mit Suche und
// Vorschlägen; Ausschluss nur, wenn das Rahmenwerk ihn erlaubt.
export function RequirementEditor({
	frameworkId,
	sections,
	controls,
	requirement,
	defaultSection,
	exclusionAllowed,
	canEdit,
	closeHref,
}: {
	frameworkId: string;
	sections: { code: string; title: string }[];
	controls: { code: string; title: string }[];
	// null = neue Anforderung
	requirement: EditorRequirement | null;
	defaultSection?: string;
	exclusionAllowed: boolean;
	canEdit: boolean;
	closeHref: string;
}) {
	const t = useTranslations("CustomFrameworks");
	const tc = useTranslations("Common");
	const td = useTranslations("Controls");
	const router = useRouter();
	const fail = useCfError();
	const uid = useId();
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const firstSection = defaultSection ?? sections[0]?.code ?? "";
	const [section, setSection] = useState(
		requirement?.sectionCode ?? (firstSection || NEW_SECTION),
	);
	const [newSection, setNewSection] = useState("");
	const [code, setCode] = useState(requirement?.code ?? "");
	const [title, setTitle] = useState(requirement?.title ?? "");
	const [text, setText] = useState(requirement?.text ?? "");
	const [domain, setDomain] = useState<Domain>(
		requirement?.domain ?? "governance",
	);
	const [guidance, setGuidance] = useState(requirement?.guidance ?? "");
	const [questions, setQuestions] = useState(
		(requirement?.auditQuestions ?? []).join("\n"),
	);
	const [hints, setHints] = useState(
		(requirement?.evidenceHints ?? []).join("\n"),
	);
	const [mapping, setMapping] = useState<Mapping[]>(
		(requirement?.controls ?? []).map((c) => ({
			code: c.controlCode,
			coverage: c.coverage,
			note: c.note ?? "",
		})),
	);
	const [excluded, setExcluded] = useState(requirement?.excluded ?? false);
	const [reason, setReason] = useState(requirement?.exclusionReason ?? "");
	const [query, setQuery] = useState("");
	const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
	const [suggesting, setSuggesting] = useState(false);
	const titleOf = useMemo(
		() => new Map(controls.map((c) => [c.code, c.title])),
		[controls],
	);
	const remove = useConfirm({
		title: t("deleteRequirementTitle"),
		description: t("deleteRequirementDescription"),
		confirmLabel: t("deleteRequirement"),
	});

	const chosen = new Set(mapping.map((m) => m.code));
	const full = mapping.length >= MAX_CONTROLS_PER_REQUIREMENT;
	const q = query.trim().toLowerCase();
	const found =
		q.length < 2
			? []
			: controls
					.filter(
						(c) =>
							!chosen.has(c.code) &&
							`${c.code} ${c.title}`.toLowerCase().includes(q),
					)
					.slice(0, 8);
	const sectionCode = section === NEW_SECTION ? newSection.trim() : section;
	const valid =
		code.trim().length > 0 &&
		title.trim().length > 0 &&
		text.trim().length > 0 &&
		sectionCode.length > 0;

	const close = () => router.replace(closeHref, { scroll: false });
	const add = (c: string) =>
		setMapping((m) =>
			m.some((x) => x.code === c) || m.length >= MAX_CONTROLS_PER_REQUIREMENT
				? m
				: [...m, { code: c, coverage: "full", note: "" }],
		);

	function submit() {
		start(async () => {
			setError(null);
			const res = await saveCustomRequirementAction({
				frameworkId,
				id: requirement?.id,
				sectionCode,
				code: code.trim(),
				title: title.trim(),
				text: text.trim(),
				domain,
				guidance: guidance.trim() || undefined,
				auditQuestions: lines(questions),
				evidenceHints: lines(hints),
				controls: mapping.map((m) => ({
					code: m.code,
					coverage: m.coverage,
					note: m.note.trim() || undefined,
				})),
			});
			if (!res.ok) return setError(fail(res));
			const was = requirement?.excluded ?? false;
			const wasReason = requirement?.exclusionReason ?? "";
			if (
				exclusionAllowed &&
				(excluded !== was || (excluded && reason.trim() !== wasReason))
			) {
				const ex = await setCustomExclusionAction({
					requirementId: res.data.id,
					excluded,
					reason: reason.trim(),
				});
				if (!ex.ok) return setError(fail(ex));
			}
			toast.success(t("saved"));
			close();
			router.refresh();
		});
	}

	async function suggest() {
		setSuggesting(true);
		const res = await suggestCustomControlsAction({
			text: `${title}\n${text}`,
			domain,
		});
		setSuggesting(false);
		if (!res.ok) return setError(fail(res));
		setSuggestions(res.data);
	}

	return (
		<Dialog open onOpenChange={(o) => !o && close()}>
			<DialogContent
				className="sm:max-w-2xl"
				// kein Fokus ins erste Feld: am Handy ginge sonst die Tastatur auf
				onOpenAutoFocus={(e) => {
					e.preventDefault();
					(e.currentTarget as HTMLElement | null)?.focus();
				}}
			>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						if (canEdit && valid) submit();
					}}
				>
					<DialogHeader>
						<DialogTitle>
							{requirement
								? canEdit
									? t("editRequirement")
									: `${requirement.code} · ${requirement.title}`
								: t("newRequirement")}
						</DialogTitle>
						<DialogDescription className="sr-only">
							{t("mappingLead")}
						</DialogDescription>
					</DialogHeader>
					<fieldset disabled={!canEdit} className="flex flex-col gap-4">
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_1fr]">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={`${uid}-code`}>{t("reqCode")}</Label>
								<Input
									id={`${uid}-code`}
									name="code"
									autoComplete="off"
									spellCheck={false}
									required
									maxLength={40}
									value={code}
									placeholder={t("reqCodePlaceholder")}
									onChange={(e) => setCode(e.target.value)}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={`${uid}-section`}>{t("reqSection")}</Label>
								{sections.length > 0 ? (
									<Select value={section} onValueChange={setSection}>
										<SelectTrigger id={`${uid}-section`}>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{sections.map((s) => (
												<SelectItem key={s.code} value={s.code}>
													{s.code} · {s.title}
												</SelectItem>
											))}
											<SelectItem value={NEW_SECTION}>
												{t("reqSectionNew")}
											</SelectItem>
										</SelectContent>
									</Select>
								) : null}
								{(sections.length === 0 || section === NEW_SECTION) && (
									<Input
										id={sections.length === 0 ? `${uid}-section` : undefined}
										aria-label={t("sectionCode")}
										name="section"
										autoComplete="off"
										maxLength={40}
										value={newSection}
										placeholder={t("sectionCodePlaceholder")}
										onChange={(e) => setNewSection(e.target.value)}
									/>
								)}
							</div>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor={`${uid}-title`}>{t("reqTitle")}</Label>
							<Input
								id={`${uid}-title`}
								name="title"
								autoComplete="off"
								required
								maxLength={300}
								value={title}
								placeholder={t("reqTitlePlaceholder")}
								onChange={(e) => setTitle(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor={`${uid}-text`}>{t("reqText")}</Label>
							<Textarea
								id={`${uid}-text`}
								name="text"
								required
								rows={4}
								maxLength={5000}
								value={text}
								placeholder={t("reqTextPlaceholder")}
								onChange={(e) => setText(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor={`${uid}-domain`}>{t("reqDomain")}</Label>
							<Select
								value={domain}
								onValueChange={(v) => setDomain(v as Domain)}
							>
								<SelectTrigger id={`${uid}-domain`}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{DOMAINS.map((d) => (
										<SelectItem key={d} value={d}>
											{td(`domain_${d}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<section className="flex flex-col gap-3 rounded-2xl bg-muted/50 p-3">
							<div className="flex flex-wrap items-baseline justify-between gap-2">
								<h3 className="font-semibold text-subhead">{t("mapping")}</h3>
								{canEdit && (
									<Button
										type="button"
										size="sm"
										variant="secondary"
										disabled={suggesting || text.trim().length < 3}
										onClick={suggest}
									>
										{suggesting ? t("suggesting") : t("suggest")}
									</Button>
								)}
							</div>
							<p className="text-footnote text-muted-foreground">
								{t("mappingLead")}
							</p>
							{mapping.length === 0 ? (
								<p className="text-subhead">{t("mappingNone")}</p>
							) : (
								<ul className="flex flex-col gap-2">
									{mapping.map((m, i) => (
										<li
											key={m.code}
											className="flex flex-col gap-2 rounded-xl bg-card p-2.5"
										>
											<div className="flex items-start gap-2">
												<span className="min-w-0 flex-1 text-subhead">
													<span className="whitespace-nowrap font-mono text-footnote">
														{m.code}
													</span>{" "}
													{titleOf.get(m.code) ?? ""}
												</span>
												{canEdit && (
													<button
														type="button"
														aria-label={t("removeControl", { code: m.code })}
														className="hit-area inline-flex size-(--control-h-sm) shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
														onClick={() =>
															setMapping((x) =>
																x.filter((y) => y.code !== m.code),
															)
														}
													>
														<X aria-hidden="true" className="size-4" />
													</button>
												)}
											</div>
											<div className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_1fr]">
												<Select
													value={m.coverage}
													onValueChange={(v) =>
														setMapping((x) =>
															x.map((y, j) =>
																j === i
																	? { ...y, coverage: v as Mapping["coverage"] }
																	: y,
															),
														)
													}
												>
													<SelectTrigger aria-label={t("coverage")}>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="full">
															{t("coverage_full")}
														</SelectItem>
														<SelectItem value="partial">
															{t("coverage_partial")}
														</SelectItem>
													</SelectContent>
												</Select>
												<Input
													aria-label={t("note")}
													autoComplete="off"
													maxLength={500}
													value={m.note}
													placeholder={t("notePlaceholder")}
													onChange={(e) =>
														setMapping((x) =>
															x.map((y, j) =>
																j === i ? { ...y, note: e.target.value } : y,
															),
														)
													}
												/>
											</div>
										</li>
									))}
								</ul>
							)}
							{full && (
								<p className="text-footnote text-muted-foreground">
									{t("maxControls", { n: MAX_CONTROLS_PER_REQUIREMENT })}
								</p>
							)}
							{canEdit && suggestions && (
								<div className="flex flex-col gap-1.5" aria-live="polite">
									<h4 className="font-medium text-footnote text-muted-foreground">
										{t("suggestions")}
									</h4>
									{suggestions.length === 0 ? (
										<p className="text-subhead">{t("suggestEmpty")}</p>
									) : (
										<ul className="flex flex-col gap-1.5">
											{suggestions.map((s) => (
												<li
													key={s.code}
													className="flex items-center gap-2 rounded-xl bg-card px-2.5 py-2"
												>
													<span className="min-w-0 flex-1">
														<span className="block text-subhead">
															<span className="whitespace-nowrap font-mono text-footnote">
																{s.code}
															</span>{" "}
															{s.title}
														</span>
														{s.reason.length > 0 && (
															<span className="block text-footnote text-muted-foreground">
																{t("matchedBy", {
																	words: s.reason.slice(0, 4).join(", "),
																})}
															</span>
														)}
													</span>
													{chosen.has(s.code) ? (
														<span className="text-footnote text-muted-foreground">
															{t("added")}
														</span>
													) : (
														<Button
															type="button"
															size="sm"
															variant="secondary"
															disabled={full}
															onClick={() => add(s.code)}
														>
															<Plus aria-hidden="true" />
															{t("addControl")}
														</Button>
													)}
												</li>
											))}
										</ul>
									)}
								</div>
							)}
							{canEdit && (
								<div className="flex flex-col gap-1.5">
									<Label htmlFor={`${uid}-search`}>{t("search")}</Label>
									<Input
										id={`${uid}-search`}
										type="search"
										autoComplete="off"
										spellCheck={false}
										value={query}
										placeholder={t("searchPlaceholder")}
										onChange={(e) => setQuery(e.target.value)}
									/>
									{q.length >= 2 && (
										<ul className="flex flex-col gap-1" aria-live="polite">
											{found.length === 0 ? (
												<li className="text-footnote text-muted-foreground">
													{t("searchEmpty")}
												</li>
											) : (
												found.map((c) => (
													<li key={c.code}>
														<button
															type="button"
															disabled={full}
															className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 text-left text-subhead hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
															onClick={() => {
																add(c.code);
																setQuery("");
															}}
														>
															<Plus
																aria-hidden="true"
																className="size-4 shrink-0 text-primary"
															/>
															<span className="whitespace-nowrap font-mono text-footnote">
																{c.code}
															</span>
															<span className="min-w-0 truncate">
																{c.title}
															</span>
														</button>
													</li>
												))
											)}
										</ul>
									)}
								</div>
							)}
						</section>

						<details className="group rounded-2xl bg-muted/50 px-3 py-2">
							<summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-medium text-subhead [&::-webkit-details-marker]:hidden">
								{t("moreFields")}
								<ChevronDown
									aria-hidden="true"
									className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
								/>
							</summary>
							<div className="flex flex-col gap-4 pt-2 pb-2">
								<div className="flex flex-col gap-1.5">
									<Label htmlFor={`${uid}-guidance`}>{t("reqGuidance")}</Label>
									<Textarea
										id={`${uid}-guidance`}
										rows={2}
										maxLength={5000}
										value={guidance}
										placeholder={t("reqGuidancePlaceholder")}
										onChange={(e) => setGuidance(e.target.value)}
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor={`${uid}-questions`}>
										{t("reqQuestions")}
									</Label>
									<Textarea
										id={`${uid}-questions`}
										rows={3}
										value={questions}
										placeholder={t("reqQuestionsPlaceholder")}
										onChange={(e) => setQuestions(e.target.value)}
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor={`${uid}-hints`}>{t("reqHints")}</Label>
									<Textarea
										id={`${uid}-hints`}
										rows={3}
										value={hints}
										placeholder={t("reqHintsPlaceholder")}
										onChange={(e) => setHints(e.target.value)}
									/>
								</div>
							</div>
						</details>

						{exclusionAllowed && (
							<div className="flex flex-col gap-2">
								<div className="flex min-h-11 items-center justify-between gap-3">
									<Label htmlFor={`${uid}-excluded`}>
										{t("exclusionToggle")}
									</Label>
									<Switch
										id={`${uid}-excluded`}
										checked={excluded}
										onCheckedChange={setExcluded}
									/>
								</div>
								{excluded && (
									<div className="flex flex-col gap-1.5">
										<Label htmlFor={`${uid}-reason`}>
											{t("exclusionReason")}
										</Label>
										<Textarea
											id={`${uid}-reason`}
											rows={2}
											maxLength={2000}
											value={reason}
											placeholder={t("exclusionReasonPlaceholder")}
											onChange={(e) => setReason(e.target.value)}
										/>
									</div>
								)}
							</div>
						)}
					</fieldset>
					<FormAlert message={error} />
					<DialogFooter>
						{canEdit && requirement && (
							<Button
								type="button"
								variant="ghost"
								className="text-destructive sm:mr-auto"
								disabled={pending}
								onClick={() =>
									remove.ask(() =>
										start(async () => {
											const res = await deleteCustomRequirementAction({
												frameworkId,
												id: requirement.id,
											});
											if (!res.ok) return setError(fail(res));
											close();
											router.refresh();
										}),
									)
								}
							>
								{t("deleteRequirement")}
							</Button>
						)}
						<Button type="button" variant="ghost" onClick={close}>
							{canEdit ? tc("cancel") : tc("close")}
						</Button>
						{canEdit && (
							<Button type="submit" disabled={pending || !valid}>
								{pending ? tc("saving") : tc("save")}
							</Button>
						)}
					</DialogFooter>
				</form>
				{remove.node}
			</DialogContent>
		</Dialog>
	);
}
