import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { UrlTabs } from "@/components/entity/url-tabs";
import { PageHeader } from "@/components/page-header";
import { ResolutionForm } from "@/components/resolutions/resolution-form";
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
import { listOrgMembers } from "@/lib/auth/org";
import { roleAllows } from "@/lib/auth/permissions";
import {
	requiredResolutions,
	resolutionCoverage,
} from "@/lib/compliance/catalog/resolutions-required";
import { fmtDate, shortFrameworkName } from "@/lib/compliance/page-data";
import { getOrgProfile, listMembersForPicker } from "@/lib/compliance/queries";
import { listResolutions } from "@/lib/compliance/queries-p3";
import { readOrg } from "@/lib/db/with-org";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ResolutionsPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ resolution: ["read"] });
	const sp = await searchParams;
	const tab = one(sp.tab) === "pflicht" ? "pflicht" : "register";
	const t = await getTranslations("Resolutions");
	const canCreate = roleAllows(ctx.orgRole, { resolution: ["create"] });
	const memberCount = (await listOrgMembers(ctx.orgId)).length;

	const { rows, members, required } = await readOrg(
		toOrgCtx(ctx),
		async (tx) => {
			const profile = await getOrgProfile(tx, ctx.orgId);
			return {
				rows: await listResolutions(tx, ctx.orgId),
				members: await listMembersForPicker(tx, ctx.orgId),
				required: requiredResolutions(
					profile?.frameworks ?? [],
					profile?.profile.licenceStage ?? "0_vorbereitung",
				),
			};
		},
	);
	const coverage = resolutionCoverage(
		required,
		rows
			.filter((r) => r.effective)
			.map((r) => ({
				requiredCode: r.requiredCode,
				date: r.date,
				resolutionNumber: r.resolutionNumber,
			})),
	);
	const requiredOptions = required.map((r) => ({
		code: r.code,
		title: r.title,
		legalBasis: r.legalBasis,
	}));
	const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					canCreate ? (
						<ResolutionForm
							members={members}
							required={requiredOptions}
							soloHint={memberCount <= 1}
						/>
					) : undefined
				}
			/>
			<UrlTabs
				base="/beschluesse"
				active={tab}
				tabs={[
					{ value: "register", label: t("tabRegister"), count: rows.length },
					{
						value: "pflicht",
						label: t("tabRequired"),
						count: coverage.gaps.length || undefined,
					},
				]}
			/>

			{tab === "pflicht" && (
				<section className="flex flex-col gap-3">
					<p className="text-muted-foreground text-sm">{t("requiredLead")}</p>
					{coverage.items.length === 0 ? (
						<p className="text-sm">{t("requiredEmpty")}</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("requiredTitle")}</TableHead>
									<TableHead className="w-40">{t("frameworks")}</TableHead>
									<TableHead className="w-24">{t("frequency")}</TableHead>
									<TableHead className="w-36">{t("lastResolution")}</TableHead>
									<TableHead className="w-28">{t("status")}</TableHead>
									<TableHead className="w-40" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{coverage.items.map((it) => (
									<TableRow key={it.required.code}>
										<TableCell>
											<p className="font-medium">{it.required.title}</p>
											<p className="text-muted-foreground text-xs">
												{it.required.legalBasis}
											</p>
										</TableCell>
										<TableCell>
											<span className="flex flex-wrap gap-1">
												{it.required.frameworks.map((f) => (
													<Badge
														key={f}
														variant="muted"
														className="normal-case tracking-normal"
													>
														{shortFrameworkName(f)}
													</Badge>
												))}
											</span>
										</TableCell>
										<TableCell className="text-xs">
											{t(`freq_${it.required.frequency}`)}
										</TableCell>
										<TableCell className="text-xs">
											{it.lastAt ? (
												<>
													<span className="font-mono">
														{it.resolutionNumber}
													</span>{" "}
													· {fmtDate.format(it.lastAt)}
												</>
											) : (
												"—"
											)}
										</TableCell>
										<TableCell>
											<Badge
												variant={
													it.satisfied
														? "success"
														: it.stale
															? "warning"
															: "destructive"
												}
											>
												{it.satisfied
													? t("satisfied")
													: it.stale
														? t("stale")
														: t("missing")}
											</Badge>
										</TableCell>
										<TableCell className="text-right">
											{canCreate && !it.satisfied && (
												<ResolutionForm
													members={members}
													required={requiredOptions}
													preset={{
														code: it.required.code,
														title: it.required.title,
														legalBasis: it.required.legalBasis,
													}}
													soloHint={memberCount <= 1}
													trigger="link"
												/>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</section>
			)}

			{tab === "register" &&
				(rows.length === 0 ? (
					<EmptyState
						title={t("empty")}
						lead={t("emptyLead")}
						requiredBy={t("requiredBy")}
						actions={
							canCreate ? (
								<>
									<ResolutionForm
										members={members}
										required={requiredOptions}
										soloHint={memberCount <= 1}
									/>
									<Link
										href="/beschluesse?tab=pflicht"
										className="inline-flex h-8 items-center rounded-md border px-3 text-xs hover:bg-muted"
									>
										{t("tabRequired")}
									</Link>
								</>
							) : undefined
						}
					/>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-28">{t("number")}</TableHead>
								<TableHead className="w-28">{t("date")}</TableHead>
								<TableHead className="w-32">{t("body")}</TableHead>
								<TableHead>{t("subject")}</TableHead>
								<TableHead className="w-40">{t("legalBasis")}</TableHead>
								<TableHead className="w-32">{t("approval")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{sorted.map((r) => (
								<TableRow key={r.id}>
									<TableCell className="font-mono text-xs">
										{r.resolutionNumber}
									</TableCell>
									<TableCell>{fmtDate.format(new Date(r.date))}</TableCell>
									<TableCell className="text-xs">
										{t(`body_${r.body}`)}
									</TableCell>
									<TableCell>
										<p className="font-medium">{r.subject}</p>
										<p className="line-clamp-2 text-muted-foreground text-xs">
											{r.decisionText}
										</p>
										{r.attendeeNames.length > 0 && (
											<p className="mt-0.5 text-muted-foreground text-[0.65rem]">
												{t("attendees")}: {r.attendeeNames.join(", ")}
											</p>
										)}
									</TableCell>
									<TableCell className="text-xs">
										{r.legalBasis ?? "—"}
										{r.requiredCode && (
											<p className="font-mono text-[0.65rem] text-muted-foreground">
												{r.requiredCode}
											</p>
										)}
									</TableCell>
									<TableCell>
										{!r.approvalRequestId ? (
											<Badge variant="outline">{t("approval_none")}</Badge>
										) : (
											<Badge
												variant={
													r.approvalStatus === "approved"
														? "success"
														: r.approvalStatus === "pending"
															? "warning"
															: "destructive"
												}
											>
												{t(
													`approval_${r.approvalStatus ?? "pending"}` as "approval_pending",
												)}
											</Badge>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				))}
		</>
	);
}
