import { CheckCircle2, Circle, PenLine, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import { fmtDate } from "@/lib/compliance/page-data";
import { formatParam, type ParamTopic } from "@/lib/compliance/params";
import { suggestTemplate } from "@/lib/evidence-authoring/suggest";
import { TEMPLATE_BY_KEY } from "@/lib/evidence-authoring/templates";
import { canGenerate } from "@/lib/evidence-studio/generate/registry";
import type { NachweisBogen, SheetFinding } from "@/lib/evidence-studio/sheet";
import { AnswerControl } from "./answer-control";
import { GenerateButton } from "./generate-button";
import { ItemControl } from "./item-control";
import { ParamInput } from "./param-input";

// Freie Position: Nachweis in Klick verfassen (mit Vorschlag des Rohlings)
function AuthorLink({
	controlCode,
	itemId,
	text,
	label,
	suggestedLabel,
}: {
	controlCode: string;
	itemId: string;
	text: string;
	label: string;
	suggestedLabel: (template: string) => string;
}) {
	const s = suggestTemplate(text);
	const template = s ? TEMPLATE_BY_KEY.get(s.key) : null;
	const q = new URLSearchParams({
		control: controlCode,
		position: itemId,
		titel: text,
	});
	return (
		<Link
			href={`/nachweise/verfassen?${q.toString()}`}
			className="mt-1 inline-flex items-center gap-1 text-primary text-footnote hover:underline"
		>
			<PenLine className="size-3.5" aria-hidden="true" />
			{template ? suggestedLabel(template.title) : label}
		</Link>
	);
}

// Nachweisbogen eines Controls. `focus` (Anforderungsschlüssel) zeigt nur
// Fragen und Nachweise dieses Normpunkts — beantwortet wird trotzdem am
// Control, also für jedes Rahmenwerk.

const shortName = (fw: string) => FRAMEWORK_BY_SLUG.get(fw)?.name ?? fw;
const date = (iso: string) => fmtDate.format(new Date(iso));

export async function SheetView({
	sheet,
	focus,
	canEdit,
	canCreateEvidence = false,
	currentHashes,
	evidenceOptions,
}: {
	sheet: NachweisBogen;
	focus?: string;
	canEdit: boolean;
	// darf Nachweise erzeugen (evidence:create)
	canCreateEvidence?: boolean;
	// heutige Prüfsumme je Nachweisart (für „veraltet“)
	currentHashes?: ReadonlyMap<string, string | null>;
	evidenceOptions: { id: string; title: string }[];
}) {
	const t = await getTranslations("EvidenceStudio");
	const code = sheet.control.code;
	const inFocus = (keys: string[]) => !focus || keys.includes(focus);
	const questions = sheet.questions.filter((q) =>
		inFocus(q.sources.map((s) => s.key)),
	);
	const items = sheet.items.filter((i) => inFocus(i.sources.map((s) => s.key)));
	const focusFw = focus?.slice(0, focus.indexOf(":"));
	const params = sheet.params
		.map((p) => ({
			...p,
			perFramework: focusFw
				? p.perFramework.filter((f) => f.framework === focusFw)
				: p.perFramework,
		}))
		.filter((p) => p.perFramework.length > 0);
	const ownByKey = new Map(
		sheet.ownParams.map((o) => [`${o.framework}:${o.topic}`, o.value]),
	);
	const p = sheet.progress;

	const topicLabel = (topic: string) =>
		t(`topic_${topic.replace(":", "_")}` as "topic_retention");
	const unitOf = (topic: string) =>
		t(`unit_${topic.split(":")[0]}` as "unit_interval");

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<p className="text-muted-foreground text-subhead">
					{focus ? t("leadFocus") : t("lead")}
				</p>
				<p className="text-subhead tabular-nums">
					{t("progress", {
						answered: p.questions.answered,
						questions: p.questions.total,
						done: p.items.done,
						items: p.items.total,
					})}
					{p.items.mandatoryOpen > 0 && (
						<span className="ml-2 text-destructive">
							{t("mandatoryOpen", { count: p.items.mandatoryOpen })}
						</span>
					)}
				</p>
				{focus && (
					<Link
						href={`/controls/${code}#nachweisbogen`}
						className="text-primary text-footnote hover:underline"
					>
						{t("openFull")} · {code}
					</Link>
				)}
			</div>

			{questions.length === 0 && items.length === 0 && (
				<p className="text-muted-foreground text-subhead">
					{t("noneForFocus")}
				</p>
			)}

			{questions.length > 0 && (
				<div className="flex flex-col gap-2">
					<h3 className="font-medium text-subhead">{t("questions")}</h3>
					<ol className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-card">
						{questions.map((q) => (
							<li key={q.id} className="flex flex-col gap-2 px-3 py-3">
								<p className="text-subhead">{q.text}</p>
								<SourceChips sources={q.sources} />
								{q.sources.length > 1 && (
									<details className="text-muted-foreground text-footnote">
										<summary className="cursor-pointer">
											{t("mergedFrom", { count: q.sources.length })}
										</summary>
										<ul className="mt-1 flex flex-col gap-1">
											{q.sources.map((s) => (
												// dieselbe Quelle kann mit zwei Fragen vorkommen
												<li key={`${s.key}:${s.text}`}>
													<span className="font-medium">{s.label}:</span>{" "}
													{s.text}
												</li>
											))}
										</ul>
									</details>
								)}
								<AnswerControl
									controlCode={code}
									questionId={q.id}
									initial={
										q.answer
											? { answer: q.answer.answer, note: q.answer.note }
											: null
									}
									disabled={!canEdit}
								/>
							</li>
						))}
					</ol>
				</div>
			)}

			{items.length > 0 && (
				<div className="flex flex-col gap-2">
					<h3 className="font-medium text-subhead">{t("items")}</h3>
					<p className="text-muted-foreground text-footnote">
						{t("freeLead")}
						{evidenceOptions.length === 0 && ` ${t("noEvidence")}`}
					</p>
					<ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-card">
						{items.map((i) => (
							<li key={i.id} className="flex flex-col gap-2 px-3 py-3">
								<div className="flex items-start gap-2">
									{i.done ? (
										<CheckCircle2
											className="mt-0.5 size-4 shrink-0 text-success"
											aria-label={t("done")}
										/>
									) : (
										<Circle
											className="mt-0.5 size-4 shrink-0 text-muted-foreground"
											aria-label={t("open")}
										/>
									)}
									<div className="flex min-w-0 flex-col gap-1">
										<p className="text-subhead">
											{i.text}
											{i.mandatory && (
												<Badge variant="outline" className="ml-2 align-middle">
													{t("mandatory")}
												</Badge>
											)}
										</p>
										<SourceChips sources={i.sources} />
									</div>
								</div>
								<div className="pl-6">
									{i.resolution.type === "kind" &&
										(() => {
											const { kind, produced } = i.resolution;
											const now = currentHashes?.get(kind.code);
											const stale = Boolean(
												produced?.contentSha256 &&
													now &&
													produced.contentSha256 !== now,
											);
											const generatable =
												canGenerate(kind.code) && kind.scope === "org";
											return (
												<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-subhead">
													<Link
														href={kind.edit.href}
														className="text-primary hover:underline"
													>
														{kind.edit.label}
													</Link>
													{generatable && canCreateEvidence && (
														<GenerateButton
															kindCode={kind.code}
															label={produced ? t("regenerate") : t("generate")}
														/>
													)}
													<span className="text-muted-foreground text-footnote">
														{produced ? (
															<>
																<a
																	href={`/api/nachweise/${produced.id}`}
																	className="text-primary hover:underline"
																>
																	{t("kindProduced", {
																		date: date(produced.createdAt),
																	})}
																</a>
																{produced.validUntil
																	? ` · ${t("kindValidUntil", { date: date(produced.validUntil) })}`
																	: ""}
																{" · "}
																<Link
																	href={`/nachweise/${produced.id}/unterschriften`}
																	className="text-primary hover:underline"
																>
																	{t("signatures")}
																</Link>
															</>
														) : (
															t("kindNotProduced")
														)}
													</span>
													{stale && (
														<Badge variant="warning" className="">
															{t("stale")}
														</Badge>
													)}
												</div>
											);
										})()}
									{i.resolution.type === "template" && (
										<p className="text-subhead">
											{i.resolution.document ? (
												<Link
													href="/dokumente"
													className="text-primary hover:underline"
												>
													{t("templateDocument", {
														title: i.resolution.document.title,
														status: i.resolution.document.status,
													})}
												</Link>
											) : (
												<Link
													href="/dokumente"
													className="text-primary hover:underline"
												>
													{t("template", {
														title: i.resolution.template.title,
													})}{" "}
													· {t("templateMissing")}
												</Link>
											)}
										</p>
									)}
									{i.resolution.type === "free" && canEdit && !i.done && (
										<AuthorLink
											controlCode={code}
											itemId={i.id}
											text={i.text}
											label={t("authorHere")}
											suggestedLabel={(title) =>
												t("authorSuggested", { template: title })
											}
										/>
									)}
									{i.resolution.type === "free" && (
										<ItemControl
											controlCode={code}
											itemId={i.id}
											initial={
												i.state
													? {
															note: i.state.note,
															evidenceIds: i.state.evidenceIds,
														}
													: null
											}
											evidenceOptions={evidenceOptions}
											disabled={!canEdit}
										/>
									)}
									{i.coveredElsewhere.length > 0 && (
										<p className="mt-1 text-muted-foreground text-footnote">
											{t("coveredElsewhere", {
												controls: [
													...new Set(
														i.coveredElsewhere.flatMap((c) => c.controls),
													),
												].join(", "),
											})}
										</p>
									)}
								</div>
							</li>
						))}
					</ul>
				</div>
			)}

			{params.length > 0 && (
				<div className="flex flex-col gap-2">
					<h3 className="font-medium text-subhead">{t("params")}</h3>
					<p className="text-muted-foreground text-footnote">
						{t("paramsLead")}
					</p>
					<ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-card">
						{params.map((row) => (
							<li key={row.topic} className="flex flex-col gap-2 px-3 py-3">
								<p className="text-subhead">
									{topicLabel(row.topic)}
									{row.differs && (
										<span className="ml-2 text-muted-foreground text-footnote">
											({t("differs")})
										</span>
									)}
								</p>
								<ul className="flex flex-col gap-2">
									{row.perFramework.map((f) => {
										return (
											<li
												key={f.framework}
												className="flex flex-wrap items-center justify-between gap-2 text-subhead"
											>
												<span className="min-w-0">
													<span className="font-medium">
														{shortName(f.framework)}:
													</span>{" "}
													{f.params.map((x) => formatParam(x)).join(" / ")}
												</span>
												<ParamInput
													controlCode={code}
													framework={f.framework}
													frameworkName={shortName(f.framework)}
													topic={row.topic}
													unit={unitOf(row.topic)}
													initial={
														ownByKey.get(`${f.framework}:${row.topic}`) ?? null
													}
													disabled={!canEdit}
												/>
											</li>
										);
									})}
								</ul>
							</li>
						))}
					</ul>
				</div>
			)}

			{sheet.findings.length > 0 && (
				<div className="flex flex-col gap-2">
					<h3 className="font-medium text-subhead">{t("findings")}</h3>
					<ul className="flex flex-col gap-2">
						{sheet.findings.map((f) => (
							<li
								key={findingKey(f)}
								className="flex items-start gap-2 rounded-xl bg-warning/12 px-3 py-2 text-subhead"
							>
								<TriangleAlert
									className="mt-0.5 size-4 shrink-0 text-warning"
									aria-hidden="true"
								/>
								<span>{findingText(f, t, topicLabel)}</span>
							</li>
						))}
					</ul>
				</div>
			)}

			{sheet.recommendations.length > 0 && !focus && (
				<div className="flex flex-col gap-2">
					<h3 className="font-medium text-subhead">{t("recommendations")}</h3>
					<ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-card">
						{sheet.recommendations.map((r) => (
							<li
								key={r.text}
								className="flex flex-col gap-1 px-3 py-2 text-subhead"
							>
								<span>
									<Badge variant="outline" className="mr-2">
										{t(`level_${r.level}`)}
									</Badge>
									{r.text}
								</span>
								<span className="text-muted-foreground text-footnote">
									{r.source}
									{r.action && (
										<>
											{" · "}
											<Link
												href={r.action.href}
												className="text-primary hover:underline"
											>
												{r.action.label}
											</Link>
										</>
									)}
								</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}

function SourceChips({
	sources,
}: {
	sources: { key: string; label: string }[];
}) {
	// Zusammengeführte Fragen tragen dieselbe Quelle ggf. mehrfach — je Quelle
	// ein Chip
	const unique = sources.filter(
		(s, i, all) => all.findIndex((x) => x.key === s.key) === i,
	);
	return (
		<div className="flex flex-wrap gap-1">
			{unique.map((s) => (
				<Badge
					key={s.key}
					variant="outline"
					className="font-normal text-footnote"
				>
					{s.label}
				</Badge>
			))}
		</div>
	);
}

const findingKey = (f: SheetFinding): string =>
	f.kind === "violation"
		? `v:${f.framework}:${f.topic}`
		: f.kind === "conflict"
			? `c:${f.type}`
			: f.kind === "document_cycle"
				? `d:${f.document.id}:${f.framework}`
				: f.kind === "evidence_validity"
					? `e:${f.evidence.id}:${f.framework}`
					: `u:${f.sha256}`;

function findingText(
	f: SheetFinding,
	t: Awaited<ReturnType<typeof getTranslations<"EvidenceStudio">>>,
	topicLabel: (topic: string) => string,
): string {
	switch (f.kind) {
		case "violation":
			return t("finding_violation", {
				own: `${topicLabel(f.topic as ParamTopic)} ${f.own}`,
				framework: shortName(f.framework),
				required: formatParam(f.required),
			});
		case "conflict":
			return t("finding_conflict", { hint: f.hint });
		case "document_cycle":
			return t("finding_document_cycle", {
				title: f.document.title,
				months: f.document.reviewCycleMonths ?? 0,
				framework: shortName(f.framework),
				required: formatParam(f.required),
			});
		case "evidence_validity":
			return t("finding_evidence_validity", {
				title: f.evidence.title,
				framework: shortName(f.framework),
				required: formatParam(f.required),
			});
		case "duplicate_upload":
			return t("finding_duplicate_upload", { count: f.evidence.length });
	}
}
