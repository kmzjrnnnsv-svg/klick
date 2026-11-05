import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { EVIDENCE_KIND_BY_CODE } from "@/lib/compliance/catalog/evidence-kinds";
import type {
	IsmsItem,
	IsmsRetention,
	IsmsSection,
	Range,
} from "@/lib/compliance/catalog/isms-programme";
import { basisTimes, fmtDay, fmtRange } from "@/lib/isms-plan/format";
import type { SectionTotals } from "@/lib/isms-plan/rollup";
import {
	countStates,
	type IsmsState,
	type IsmsStatus,
} from "@/lib/isms-plan/status";

// Ein Abschnitt des ISMS-Jahresplans als Tabelle (am Handy als Liste über
// .register-table): je Dokument oder Aufgabe Turnus, Prüfaufwand,
// Durchlaufzeit, PT je Jahr, ISB-Anteil A/B und die Stellen in Klick.
// Aufbewahrung steht einmal am Abschnitt, am Punkt nur, wenn sie abweicht;
// „Zuständig“ nur, wenn es nicht die oder der ISB ist.

export type PlanRow = {
	item: IsmsItem;
	depth: number;
	// Summe mit Unterpunkten, nur bei Punkten mit Unterpunkten
	withChildren?: Range;
	// Stand aus Klick (lib/isms-plan/status.ts)
	status: IsmsStatus;
};

export const STATE_BADGE: Record<
	IsmsState,
	"success" | "warning" | "default" | "muted"
> = { ok: "success", due: "warning", open: "default", none: "muted" };

const retentionKey = (r: IsmsRetention | undefined) =>
	r ? `${r.kind}:${r.years}` : "";

// häufigste Aufbewahrung im Abschnitt
function sectionRetention(rows: PlanRow[]): IsmsRetention | undefined {
	const count = new Map<string, { r: IsmsRetention; n: number }>();
	for (const { item } of rows) {
		if (!item.retention) continue;
		const k = retentionKey(item.retention);
		const hit = count.get(k) ?? { r: item.retention, n: 0 };
		hit.n += 1;
		count.set(k, hit);
	}
	return [...count.values()].sort((a, b) => b.n - a.n)[0]?.r;
}

export async function ProgrammeSection({
	index,
	section,
	rows,
	totals,
	isoActive,
}: {
	index: number;
	section: IsmsSection;
	rows: PlanRow[];
	totals: SectionTotals;
	// Normpunkte verlinken nur, wenn ISO 27001 gewählt ist
	isoActive: boolean;
}) {
	const t = await getTranslations("IsmsPlan");
	const tf = await getTranslations("Functions");
	const headingId = `abschnitt-${section}`;
	const keep = sectionRetention(rows);
	const keepText = (r: IsmsRetention) =>
		t(`retention_${r.kind}`, { years: r.years });
	return (
		<section aria-labelledby={headingId} className="scroll-mt-4">
			<div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				<h2 id={headingId} className="font-semibold text-title-3">
					{index}. {t(`section_${section}`)}
				</h2>
				<p className="text-footnote text-muted-foreground tabular-nums">
					{t("sectionSums", {
						year: fmtRange(totals.year),
						a: fmtRange(totals.isbA),
						b: fmtRange(totals.isbB),
					})}
				</p>
			</div>
			<p className="mb-2 text-footnote text-muted-foreground">
				{t("statusCounts", countStates(rows.map((r) => r.status)))}
				{keep && <> · {keepText(keep)}</>}
			</p>
			<div className="rounded-2xl bg-card">
				<Table className="register-table hyphens-auto sm:table-fixed">
					<TableHeader>
						<TableRow>
							<TableHead className="w-[28%]">{t("colItem")}</TableHead>
							<TableHead className="w-[13%]">{t("colCadence")}</TableHead>
							<TableHead className="w-[11%]">{t("colReview")}</TableHead>
							<TableHead className="w-[9%]">{t("colLead")}</TableHead>
							<TableHead className="w-[7%] text-right">
								{t("colYear")}
							</TableHead>
							<TableHead className="w-[6%] text-right">
								{t("colIsbA")}
							</TableHead>
							<TableHead className="w-[6%] text-right">
								{t("colIsbB")}
							</TableHead>
							<TableHead className="w-[20%]">{t("colStatus")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map(({ item, depth, withChildren, status }) => {
							const codes = item.clauses.map((c) => c.split(":")[1] ?? c);
							const ownRetention =
								item.retention &&
								retentionKey(item.retention) !== retentionKey(keep)
									? keepText(item.retention)
									: null;
							return (
								<TableRow key={item.key} className="align-top">
									<TableCell data-m="title" className="whitespace-normal">
										<div className={depth > 0 ? "pl-5" : undefined}>
											<p
												className={
													depth > 0 ? "text-subhead" : "font-medium text-body"
												}
											>
												{item.title}
											</p>
											<div className="mt-1 flex flex-col gap-0.5 font-normal text-footnote text-muted-foreground">
												{item.note && <p>{item.note}</p>}
												{withChildren && (
													<p className="font-medium text-foreground tabular-nums">
														{t("withChildren", { pt: fmtRange(withChildren) })}
													</p>
												)}
												<p>
													{t("clauses")}{" "}
													{codes.map((code, i) => (
														<span key={code}>
															{i > 0 && ", "}
															{isoActive ? (
																<Link
																	href={`/rahmenwerke/iso27001/${encodeURIComponent(code)}`}
																	className="hover:underline"
																>
																	{code}
																</Link>
															) : (
																code
															)}
														</span>
													))}
												</p>
												{item.owner !== "isb_ciso" && (
													<p>{t("owner", { fn: tf(item.owner) })}</p>
												)}
												{ownRetention && <p>{ownRetention}</p>}
												{item.annexes?.length ? (
													<p>
														{t("annexes", { list: item.annexes.join(", ") })}
													</p>
												) : null}
												{item.evidence?.length ? (
													<p>
														{t("evidence", {
															list: item.evidence
																.map(
																	(c) =>
																		EVIDENCE_KIND_BY_CODE.get(c)?.title ?? c,
																)
																.join(", "),
														})}
													</p>
												) : null}
											</div>
										</div>
									</TableCell>
									<TableCell data-m="meta" className="whitespace-normal">
										<span data-m-label>{t("colCadence")}:</span>
										{cadenceText(item, t)}
									</TableCell>
									<TableCell data-m="meta" className="whitespace-normal">
										<span data-m-label>{t("colReview")}:</span>
										{reviewText(item, t)}
									</TableCell>
									<TableCell data-m="meta" className="whitespace-nowrap">
										<span data-m-label>{t("colLead")}:</span>
										{item.leadWeeks
											? item.leadWeeks[0] === 1 && item.leadWeeks[1] === 1
												? t("leadOne")
												: t("leadWeeks", { weeks: fmtRange(item.leadWeeks) })
											: item.cadence === "continuous"
												? t("leadNone")
												: t("notApplicable")}
									</TableCell>
									<TableCell
										data-m="meta"
										className="whitespace-nowrap text-right tabular-nums"
									>
										<span data-m-label>{t("colYear")}:</span>
										{fmtRange(item.year)}
									</TableCell>
									<TableCell
										data-m="meta"
										className="whitespace-nowrap text-right tabular-nums"
									>
										<span data-m-label>{t("colIsbA")}:</span>
										{fmtRange(item.isb.a)}
									</TableCell>
									<TableCell
										data-m="meta"
										className="whitespace-nowrap text-right tabular-nums"
									>
										<span data-m-label>{t("colIsbB")}:</span>
										{fmtRange(item.isb.b)}
									</TableCell>
									<TableCell data-m="meta" className="whitespace-normal">
										<span data-m-label>{t("colStatus")}:</span>
										<span className="flex flex-col items-start gap-1">
											<Badge variant={STATE_BADGE[status.state]}>
												{t(`state_${status.state}`)}
											</Badge>
											<span className="text-footnote text-muted-foreground">
												{statusText(status, t)}
											</span>
										</span>
										<span className="mt-1 inline-flex flex-wrap gap-x-3 gap-y-1">
											{item.where.map((w) => (
												<Link
													key={w.href}
													href={w.href}
													className="break-words text-primary hover:underline"
												>
													{w.label}
												</Link>
											))}
										</span>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>
		</section>
	);
}

type T = Awaited<ReturnType<typeof getTranslations<"IsmsPlan">>>;

function statusText(status: IsmsStatus, t: T): string {
	const key = `status_${status.code}` as Parameters<T>[0];
	return t(key, {
		n: status.n ?? 0,
		m: status.m ?? 0,
		date: status.date ? fmtDay(status.date) : "",
	});
}

function cadenceText(item: IsmsItem, t: T): string {
	const parts = [t(`cadence_${item.cadence}`)];
	for (const e of item.events ?? []) parts.push(t(`event_${e}`));
	if (item.beforeReview) parts.push(t("beforeReview"));
	return parts.join(", ");
}

function reviewText(item: IsmsItem, t: T): string {
	if (item.basis?.length) {
		return item.basis
			.map((b) => {
				const times = basisTimes(b);
				const pt = fmtRange(b.pt);
				return times === 1
					? t("basisOnce", { work: t(`work_${b.work}`), pt })
					: t("basisRun", { work: t(`work_${b.work}`), times, pt });
			})
			.join(" + ");
	}
	if (item.review) return t("reviewPt", { pt: fmtRange(item.review) });
	return item.cadence === "continuous" ? t("reviewNone") : t("notApplicable");
}
