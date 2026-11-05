import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { IsmsAdjustDialog } from "@/components/isms-plan/adjust-dialog";
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
import type { IsmsNumbers } from "@/lib/isms-plan/adjust-math";
import { fmtRange } from "@/lib/isms-plan/format";
import type { SectionTotals } from "@/lib/isms-plan/rollup";
import { countStates, type IsmsState } from "@/lib/isms-plan/status";
import {
	cadenceText,
	leadText,
	offText,
	retentionText,
	reviewText,
	statusText,
} from "@/lib/isms-plan/texts";
import type { PlanRow } from "@/lib/isms-plan/view";

// Ein Abschnitt des ISMS-Jahresplans als Tabelle (am Handy als Liste über
// .register-table): je Dokument oder Aufgabe Turnus, Prüfaufwand,
// Durchlaufzeit, PT je Jahr, ISB-Anteil A/B und die Stellen in Klick.
// Aufbewahrung steht einmal am Abschnitt, am Punkt nur, wenn sie abweicht;
// „Zuständig“ nur, wenn es nicht die oder der ISB ist.

export type { PlanRow } from "@/lib/isms-plan/view";

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
	canEdit,
}: {
	index: number;
	section: IsmsSection;
	rows: PlanRow[];
	totals: SectionTotals;
	// Normpunkte verlinken nur, wenn ISO 27001 gewählt ist
	isoActive: boolean;
	// Anpassen nur mit obligation:update
	canEdit: boolean;
}) {
	const t = await getTranslations("IsmsPlan");
	const tf = await getTranslations("Functions");
	const headingId = `abschnitt-${section}`;
	const keep = sectionRetention(rows);
	const keepText = (r: IsmsRetention) => retentionText(r, t);
	const offCount = rows.filter((r) => r.off).length;
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
				{t(
					"statusCounts",
					countStates(rows.flatMap((r) => (r.status ? [r.status] : []))),
				)}
				{offCount > 0 && <> · {t("offCount", { n: offCount })}</>}
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
						{rows.map((row) => {
							const { item, depth, withChildren, status, numbers, off } = row;
							const changed = !off && changedFrom(item, numbers);
							const codes = item.clauses.map((c) => c.split(":")[1] ?? c);
							const ownRetention =
								item.retention &&
								retentionKey(item.retention) !== retentionKey(keep)
									? keepText(item.retention)
									: null;
							return (
								<TableRow
									key={item.key}
									className={
										off ? "align-top text-muted-foreground" : "align-top"
									}
								>
									<TableCell data-m="title" className="whitespace-normal">
										<div className={depth > 0 ? "pl-5" : undefined}>
											<p
												className={
													depth > 0 ? "text-subhead" : "font-medium text-body"
												}
											>
												{item.title}
												{row.adjust && !off && (
													<Badge variant="muted" className="ml-2 align-middle">
														{t("adjusted")}
													</Badge>
												)}
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
												{canEdit && !(off && "via" in off) && (
													<span>
														<IsmsAdjustDialog
															itemKey={item.key}
															title={item.title}
															template={{
																year: item.year,
																isb: item.isb,
																basis: item.basis,
															}}
															adjust={row.adjust}
														/>
													</span>
												)}
											</div>
										</div>
									</TableCell>
									<TableCell data-m="meta" className="whitespace-normal">
										<span data-m-label>{t("colCadence")}:</span>
										{cadenceText(item, t)}
									</TableCell>
									<TableCell data-m="meta" className="whitespace-normal">
										<span data-m-label>{t("colReview")}:</span>
										{reviewText(item, t, off ? undefined : row.adjust?.units)}
									</TableCell>
									<TableCell data-m="meta" className="whitespace-nowrap">
										<span data-m-label>{t("colLead")}:</span>
										{leadText(item, t)}
									</TableCell>
									<TableCell
										data-m="meta"
										className="whitespace-nowrap text-right tabular-nums"
									>
										<span data-m-label>{t("colYear")}:</span>
										{off ? t("notApplicable") : fmtRange(numbers.year)}
										{changed && (
											<span className="block text-caption text-muted-foreground">
												{t("templateValue", { pt: fmtRange(item.year) })}
											</span>
										)}
									</TableCell>
									<TableCell
										data-m="meta"
										className="whitespace-nowrap text-right tabular-nums"
									>
										<span data-m-label>{t("colIsbA")}:</span>
										{off ? t("notApplicable") : fmtRange(numbers.isbA)}
									</TableCell>
									<TableCell
										data-m="meta"
										className="whitespace-nowrap text-right tabular-nums"
									>
										<span data-m-label>{t("colIsbB")}:</span>
										{off ? t("notApplicable") : fmtRange(numbers.isbB)}
									</TableCell>
									<TableCell data-m="meta" className="whitespace-normal">
										<span data-m-label>{t("colStatus")}:</span>
										{status ? (
											<span className="flex flex-col items-start gap-1">
												<Badge variant={STATE_BADGE[status.state]}>
													{t(`state_${status.state}`)}
												</Badge>
												<span className="text-footnote text-muted-foreground">
													{statusText(status, t)}
												</span>
											</span>
										) : (
											<span className="flex flex-col items-start gap-1">
												<Badge variant="muted">{t("stateOff")}</Badge>
												<span className="break-words text-footnote text-muted-foreground">
													{off && offText(off, t)}
												</span>
											</span>
										)}
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

const same = (a: Range, b: Range) => a[0] === b[0] && a[1] === b[1];

// weicht der Aufwand von der Vorlage ab?
function changedFrom(item: IsmsItem, n: IsmsNumbers): boolean {
	return (
		!same(item.year, n.year) ||
		!same(item.isb.a, n.isbA) ||
		!same(item.isb.b, n.isbB)
	);
}
