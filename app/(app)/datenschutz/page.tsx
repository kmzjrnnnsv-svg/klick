import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { deleteProcessingActivity } from "@/app/actions/privacy";
import { EmptyState } from "@/components/entity/empty-state";
import { UrlTabs } from "@/components/entity/url-tabs";
import { UserChip } from "@/components/entity/user-chip";
import { DeleteRowButton } from "@/components/organisation/governance-forms";
import { PageHeader } from "@/components/page-header";
import {
	ApplyActivitySeedButton,
	DsrButtons,
	DsrForm,
	ProcessingActivityForm,
} from "@/components/privacy/privacy-forms";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/compliance/page-data";
import {
	dsrClock,
	dsrEffectiveDue,
	dsrStats,
	vvtGaps,
} from "@/lib/compliance/privacy";
import { listEvidence, listMembersForPicker } from "@/lib/compliance/queries";
import {
	listDataSubjectRequests,
	listProcessingActivities,
} from "@/lib/compliance/queries-p5";
import { decryptMany, fieldAad } from "@/lib/crypto/org-dek";
import { readOrg } from "@/lib/db/with-org";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const TABS = ["vvt", "dsfa", "anfragen"] as const;
const CLOCK_TONE = {
	done: "success",
	ok: "outline",
	soon: "warning",
	overdue: "destructive",
} as const;
const fmtTs = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});

// /datenschutz — VVT (Art. 30), DSFA (Art. 35), Betroffenenanfragen
// (Art. 12–22 mit Monatsfrist). Pseudonyme feldverschlüsselt; Prüfer:innen
// ohne Grant sehen Anfragen nur aggregiert.
export default async function PrivacyPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ privacy: ["read"] });
	const sp = await searchParams;
	const tab = (TABS as readonly string[]).includes(one(sp.tab) ?? "")
		? (one(sp.tab) as (typeof TABS)[number])
		: "vvt";
	const t = await getTranslations("Privacy");
	const now = new Date();
	const canEdit = roleAllows(ctx.orgRole, { privacy: ["update"] });
	const detail = ctx.orgRole !== "auditor" || ctx.grants.includes("hr_detail");

	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const [members, activities, requests, evidence] = await Promise.all([
			listMembersForPicker(tx, ctx.orgId),
			listProcessingActivities(tx, ctx.orgId),
			listDataSubjectRequests(tx, ctx.orgId),
			listEvidence(tx, ctx.orgId),
		]);
		const refs =
			canEdit && detail
				? await decryptMany<string>(
						tx,
						ctx.orgId,
						requests.map((r) => ({
							stored: r.subjectRef,
							aad: fieldAad("data_subject_requests", r.id, "subject_ref"),
						})),
					)
				: requests.map(() => null);
		return {
			members,
			activities,
			requests,
			refs,
			evidence: evidence.map((e) => ({ id: e.id, title: e.title })),
		};
	});
	const gaps = vvtGaps(data.activities);
	const stats = dsrStats(data.requests, now);
	const dsfa = data.activities.filter((a) => a.dsfaRequired);
	const evidenceTitle = (id: string | null) =>
		id ? (data.evidence.find((e) => e.id === id)?.title ?? id) : null;

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					canEdit ? (
						tab === "anfragen" ? (
							<DsrForm members={data.members} />
						) : (
							<span className="flex flex-wrap gap-2">
								<ApplyActivitySeedButton />
								<ProcessingActivityForm
									members={data.members}
									evidence={data.evidence}
								/>
							</span>
						)
					) : undefined
				}
			/>
			<UrlTabs
				base="/datenschutz"
				active={tab}
				tabs={[
					{ value: "vvt", label: t("tabVvt"), count: data.activities.length },
					{
						value: "dsfa",
						label: t("tabDsfa"),
						count: dsfa.length || undefined,
					},
					{
						value: "anfragen",
						label: t("tabDsr"),
						count: stats.open || undefined,
					},
				]}
			/>

			{tab === "vvt" && (
				<section className="flex flex-col gap-4">
					<p className="text-muted-foreground text-sm">{t("vvtLead")}</p>
					{gaps.length > 0 && (
						<ul className="list-disc rounded-md border border-dashed p-3 pl-7 text-sm">
							{gaps.map((g) => (
								<li key={`${g.id}-${g.kind}`}>
									<span className="font-medium">{g.name}</span>:{" "}
									{t(`gap_${g.kind}`)}
								</li>
							))}
						</ul>
					)}
					{data.activities.length === 0 ? (
						<EmptyState
							title={t("vvtEmpty")}
							lead={t("vvtEmptyLead")}
							requiredBy={t("requiredByVvt")}
							actions={
								canEdit ? (
									<>
										<ApplyActivitySeedButton />
										<ProcessingActivityForm
											members={data.members}
											evidence={data.evidence}
										/>
									</>
								) : undefined
							}
						/>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("name")}</TableHead>
									<TableHead className="w-56">{t("legalBasis")}</TableHead>
									<TableHead className="w-44">{t("dataCategories")}</TableHead>
									<TableHead className="w-40">{t("recipients")}</TableHead>
									<TableHead className="w-36">{t("retention")}</TableHead>
									<TableHead className="w-20">DSFA</TableHead>
									<TableHead className="w-36">{t("owner")}</TableHead>
									<TableHead className="w-20">{t("actions")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.activities.map((a) => (
									<TableRow key={a.id}>
										<TableCell>
											<p className="font-medium">{a.name}</p>
											{a.purpose && (
												<p className="line-clamp-2 text-muted-foreground text-xs">
													{a.purpose}
												</p>
											)}
											{a.thirdCountryTransfer && (
												<p className="text-[0.65rem] text-muted-foreground">
													{t("thirdCountry")}: {a.thirdCountryTransfer}
												</p>
											)}
										</TableCell>
										<TableCell className="text-xs">
											{a.legalBasis ?? (
												<Badge variant="destructive">{t("missing")}</Badge>
											)}
										</TableCell>
										<TableCell className="text-xs">
											{(a.dataCategories ?? []).join(", ") || "—"}
										</TableCell>
										<TableCell className="text-xs">
											{(a.recipients ?? []).join(", ") || "—"}
										</TableCell>
										<TableCell className="text-xs">
											{a.retention ?? (
												<Badge variant="destructive">{t("missing")}</Badge>
											)}
										</TableCell>
										<TableCell>
											{a.dsfaRequired ? (
												<Badge
													variant={a.dsfaEvidenceId ? "success" : "warning"}
												>
													{a.dsfaEvidenceId ? t("dsfaDone") : t("dsfaOpen")}
												</Badge>
											) : (
												<span className="text-muted-foreground text-xs">—</span>
											)}
										</TableCell>
										<TableCell>
											<UserChip name={a.ownerName} />
										</TableCell>
										<TableCell>
											{canEdit && (
												<div className="flex items-center gap-1">
													<ProcessingActivityForm
														members={data.members}
														evidence={data.evidence}
														initial={{
															id: a.id,
															name: a.name,
															purpose: a.purpose,
															dataCategories: (a.dataCategories ?? []).join(
																", ",
															),
															dataSubjects: (a.dataSubjects ?? []).join(", "),
															recipients: (a.recipients ?? []).join(", "),
															thirdCountryTransfer: a.thirdCountryTransfer,
															retention: a.retention,
															legalBasis: a.legalBasis,
															dsfaRequired: a.dsfaRequired,
															dsfaEvidenceId: a.dsfaEvidenceId,
															ownerUserId: a.ownerUserId,
														}}
													/>
													<DeleteRowButton
														id={a.id}
														action={deleteProcessingActivity}
														label={t("deleteActivity")}
													/>
												</div>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</section>
			)}

			{tab === "dsfa" && (
				<section className="flex flex-col gap-4">
					<p className="text-muted-foreground text-sm">{t("dsfaLead")}</p>
					{dsfa.length === 0 ? (
						<EmptyState
							title={t("dsfaEmpty")}
							lead={t("dsfaEmptyLead")}
							requiredBy={t("requiredByDsfa")}
						/>
					) : (
						<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
							{dsfa.map((a) => (
								<li
									key={a.id}
									className="flex items-center justify-between gap-3 p-3"
								>
									<span>
										<span className="font-medium">{a.name}</span>
										<span className="block text-muted-foreground text-xs">
											{a.legalBasis ?? "—"}
										</span>
									</span>
									<span className="flex items-center gap-2 text-xs">
										{a.dsfaEvidenceId ? (
											<Link
												href="/nachweise"
												className="text-primary hover:underline"
											>
												{evidenceTitle(a.dsfaEvidenceId)}
											</Link>
										) : (
											<Badge variant="warning">{t("dsfaOpen")}</Badge>
										)}
									</span>
								</li>
							))}
						</ul>
					)}
					<p className="text-muted-foreground text-xs">
						{t("dsfaHint")}{" "}
						<Link href="/nachweise" className="text-primary hover:underline">
							/nachweise
						</Link>
					</p>
				</section>
			)}

			{tab === "anfragen" && (
				<section className="flex flex-col gap-4">
					<p className="text-muted-foreground text-sm">{t("dsrLead")}</p>
					<div className="grid gap-3 text-sm sm:grid-cols-4">
						{(
							[
								["statOpen", stats.open, false],
								["statOverdue", stats.overdue, stats.overdue > 0],
								["statDone", stats.doneThisYear, false],
								["statTotal", stats.total, false],
							] as const
						).map(([k, v, warn]) => (
							<div key={k} className="rounded-md border p-3">
								<p className="lv-eyebrow text-[0.52rem] text-muted-foreground">
									{t(k)}
								</p>
								<p
									className={`font-serif-display text-2xl ${warn ? "text-destructive" : "text-primary"}`}
								>
									{v}
								</p>
							</div>
						))}
					</div>
					{!detail ? (
						<p className="rounded-md border border-dashed p-3 text-sm">
							{t("aggregatedOnly")}
						</p>
					) : data.requests.length === 0 ? (
						<EmptyState
							title={t("dsrEmpty")}
							lead={t("dsrEmptyLead")}
							requiredBy={t("requiredByDsr")}
							actions={canEdit ? <DsrForm members={data.members} /> : undefined}
						/>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-36">{t("receivedAt")}</TableHead>
									<TableHead className="w-36">{t("type")}</TableHead>
									<TableHead>{t("subjectRef")}</TableHead>
									<TableHead className="w-40">{t("dueAt")}</TableHead>
									<TableHead className="w-36">{t("owner")}</TableHead>
									<TableHead className="w-80">{t("status")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.requests.map((r, i) => {
									const clock = dsrClock(r, now);
									const due = dsrEffectiveDue(r);
									return (
										<TableRow key={r.id}>
											<TableCell className="text-xs">
												{fmtTs.format(r.receivedAt)}
											</TableCell>
											<TableCell>
												<Badge variant="outline">{t(`type_${r.type}`)}</Badge>
											</TableCell>
											<TableCell className="text-xs">
												{data.refs[i] ?? (
													<span className="text-muted-foreground">—</span>
												)}
												{r.outcome && (
													<p className="line-clamp-2 text-muted-foreground">
														{r.outcome}
													</p>
												)}
											</TableCell>
											<TableCell>
												<Badge variant={CLOCK_TONE[clock]}>
													{t(`clock_${clock}`)}
												</Badge>
												<p className="text-[0.65rem] text-muted-foreground">
													{fmtDate.format(due)}
													{r.extendedUntil ? ` · ${t("extendedShort")}` : ""}
												</p>
											</TableCell>
											<TableCell>
												<UserChip name={r.ownerName} />
											</TableCell>
											<TableCell>
												<div className="flex flex-wrap items-center gap-1">
													<Badge
														variant={
															r.status === "done"
																? "success"
																: r.status === "rejected"
																	? "muted"
																	: r.status === "open"
																		? "destructive"
																		: "outline"
														}
													>
														{t(`status_${r.status}`)}
													</Badge>
													{canEdit && (
														<>
															<DsrButtons
																id={r.id}
																status={r.status}
																extended={Boolean(r.extendedUntil)}
															/>
															<DsrForm
																members={data.members}
																initial={{
																	id: r.id,
																	receivedAt: r.receivedAt
																		.toISOString()
																		.slice(0, 16),
																	type: r.type,
																	subjectRef: data.refs[i] ?? "",
																	ownerUserId: r.ownerUserId,
																}}
															/>
														</>
													)}
												</div>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					)}
				</section>
			)}
		</>
	);
}
