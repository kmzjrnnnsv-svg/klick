import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { UrlTabs } from "@/components/entity/url-tabs";
import { withMessages } from "@/components/i18n/with-messages";
import { PageHeader } from "@/components/page-header";
import {
	ApplyRequirementsButton,
	TrainingForm,
} from "@/components/registers/training-form";
import {
	AssignTrainingForm,
	CompleteTrainingButton,
	CourseLink,
	RequirementForm,
	UnassignButton,
} from "@/components/registers/training-plan-forms";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ROLE_FUNCTIONS } from "@/db/schema/enums";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/compliance/page-data";
import { listMembersForPicker, userNames } from "@/lib/compliance/queries";
import {
	listTrainingAssignments,
	listTrainingRequirements,
	listTrainings,
} from "@/lib/compliance/queries-p2";
import { readOrg } from "@/lib/db/with-org";
import { currentTrainings } from "@/lib/trainings/assignments";

async function TrainingsPage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string }>;
}) {
	const { tab = "plan" } = await searchParams;
	const ctx = await requireOrgPage({ task: ["read"] });
	const t = await getTranslations("Trainings");
	const tf = await getTranslations("Functions");
	const canCreate = allows(ctx, { training: ["create"] });
	// Vorschlagen wartet auf den Ablauf „Schulung vorschlagen“
	const canPropose = canCreate || allows(ctx, { training: ["propose"] });
	const canEdit = allows(ctx, { training: ["update"] });
	const canSettings = allows(ctx, { settings: ["update"] });
	const { trainings, requirements, assignments, members, names } =
		await readOrg(toOrgCtx(ctx), async (tx) => {
			const [trainings, requirements, assignments, members] = await Promise.all(
				[
					listTrainings(tx, ctx.orgId),
					listTrainingRequirements(tx, ctx.orgId),
					listTrainingAssignments(tx, ctx.orgId),
					listMembersForPicker(tx, ctx.orgId),
				],
			);
			const names = await userNames(tx, [
				...assignments.map((a) => a.userId),
				...trainings.flatMap((x) => x.attendeeUserIds),
				...trainings.map((x) => x.trainerUserId),
			]);
			return { trainings, requirements, assignments, members, names };
		});
	const today = new Date().toISOString().slice(0, 10);
	const current = currentTrainings(assignments, today);
	const memberIds = new Set(members.map((m) => m.userId));
	const TONE = {
		done: "success",
		due: "warning",
		overdue: "destructive",
		planned: "muted",
		none: "muted",
	} as const;
	const functionLabels = Object.fromEntries(
		ROLE_FUNCTIONS.map((f) => [f, tf(f)]),
	);
	const audienceLabel = (r: (typeof requirements)[number]) =>
		[
			r.orgRole ? t(`orgRole_${r.orgRole as "all"}` as "orgRole_all") : null,
			r.function ? (functionLabels[r.function] ?? r.function) : null,
		]
			.filter(Boolean)
			.join(" · ") || "—";
	const reqById = new Map(requirements.map((r) => [r.id, r]));
	// Matrix, Zuweisung und Erfassung nur mit freigegebenen Schulungen
	const approvedReqs = requirements.filter(
		(r) => r.approvalStatus === "approved",
	);
	const mine = [...current.entries()]
		.filter(([k]) => k.endsWith(`|${ctx.userId}`))
		.map(([k, v]) => ({ req: reqById.get(k.split("|")[0] ?? ""), ...v }))
		.filter((x) => x.req)
		.sort((a, b) =>
			(a.open?.dueAt ?? "9999").localeCompare(b.open?.dueAt ?? "9999"),
		);

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					canCreate ? (
						<TrainingForm
							members={members}
							requirements={approvedReqs.map((r) => ({
								code: r.code,
								title: r.title,
							}))}
						/>
					) : undefined
				}
			/>
			<UrlTabs
				base="/schulungen"
				active={tab}
				tabs={[
					{ value: "plan", label: t("tabPlan"), count: requirements.length },
					{
						value: "meine",
						label: t("tabMine"),
						count: mine.filter((x) => x.state !== "done").length,
					},
					{
						value: "durchgefuehrt",
						label: t("tabDone"),
						count: trainings.length,
					},
					{ value: "matrix", label: t("tabMatrix") },
				]}
			/>

			{tab === "plan" &&
				(requirements.length === 0 ? (
					<EmptyState
						title={t("empty")}
						lead={t("emptyLead")}
						requiredBy={t("requiredBy")}
						actions={
							canSettings || canEdit ? (
								<>
									{canSettings && <ApplyRequirementsButton />}
									{canPropose && (
										<RequirementForm functionLabels={functionLabels} />
									)}
								</>
							) : undefined
						}
					/>
				) : (
					<>
						<div className="mb-3 flex justify-end gap-2">
							{canSettings && <ApplyRequirementsButton />}
							{canPropose && (
								<RequirementForm functionLabels={functionLabels} />
							)}
						</div>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-32">Code</TableHead>
									<TableHead>{t("requirements")}</TableHead>
									<TableHead className="w-40">{t("audience")}</TableHead>
									<TableHead className="w-28">
										{t("frequency", { n: 0 }).replace("0", "n")}
									</TableHead>
									<TableHead>{t("legalBasis")}</TableHead>
									<TableHead className="w-44 text-right">
										{t("progress")}
									</TableHead>
									{canEdit && <TableHead className="w-40" />}
								</TableRow>
							</TableHeader>
							<TableBody>
								{requirements.map((r) => {
									const people = [...current.entries()].filter(
										([k]) =>
											k.startsWith(`${r.id}|`) &&
											memberIds.has(k.split("|")[1] ?? ""),
									);
									const count = (st: string) =>
										people.filter(([, v]) => v.state === st).length;
									const done = count("done");
									const due = count("due");
									const overdue = count("overdue");
									return (
										<TableRow key={r.id}>
											<TableCell className="whitespace-nowrap font-mono text-footnote">
												{r.code}
											</TableCell>
											<TableCell>
												<p className="font-medium">
													{r.title}
													{r.approvalStatus !== "approved" && (
														<Badge
															variant={
																r.approvalStatus === "rejected"
																	? "muted"
																	: "warning"
															}
															className="ml-2 align-middle"
														>
															{r.approvalStatus === "rejected"
																? t("approvalRejected")
																: t("approvalPending")}
														</Badge>
													)}
												</p>
												<p className="text-muted-foreground text-footnote">
													{r.description}
												</p>
												<CourseLink url={r.courseUrl} />
											</TableCell>
											<TableCell className="text-footnote">
												{audienceLabel(r)}
											</TableCell>
											<TableCell className="text-footnote">
												{t("frequency", { n: r.frequencyMonths })}
											</TableCell>
											<TableCell className="text-muted-foreground text-footnote">
												{r.legalBasis}
											</TableCell>
											<TableCell className="text-right">
												<div className="flex flex-wrap justify-end gap-1">
													<Badge
														variant={
															people.length > 0 && done === people.length
																? "success"
																: "outline"
														}
													>
														{t("progressValue", { done, total: people.length })}
													</Badge>
													{due > 0 && (
														<Badge variant="warning">
															{due} {t("status_due")}
														</Badge>
													)}
													{overdue > 0 && (
														<Badge variant="destructive">
															{overdue} {t("status_overdue")}
														</Badge>
													)}
												</div>
											</TableCell>
											{canEdit && (
												<TableCell className="text-right">
													<div className="flex justify-end gap-1">
														{r.approvalStatus === "approved" && (
															<AssignTrainingForm
																requirementId={r.id}
																title={r.title}
																members={members}
																assignedUserIds={people
																	.filter(
																		([, v]) => v.open && v.state !== "done",
																	)
																	.map(([k]) => k.split("|")[1] ?? "")}
															/>
														)}
														<RequirementForm
															functionLabels={functionLabels}
															initial={{
																id: r.id,
																title: r.title,
																description: r.description,
																courseUrl: r.courseUrl,
																frequencyMonths: r.frequencyMonths,
																function: r.function,
																orgRole: r.orgRole,
																legalBasis: r.legalBasis,
															}}
														/>
													</div>
												</TableCell>
											)}
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</>
				))}

			{tab === "meine" && (
				<>
					<p className="mb-3 text-muted-foreground text-subhead">
						{t("mineLead")}
					</p>
					{mine.length === 0 ? (
						<p className="text-subhead">{t("mineEmpty")}</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t("requirement")}</TableHead>
									<TableHead className="w-36">{t("dueAt")}</TableHead>
									<TableHead className="w-28">{t("state")}</TableHead>
									<TableHead className="w-44" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{mine.map((x) => (
									<TableRow key={x.req?.id}>
										<TableCell>
											<p className="font-medium">{x.req?.title}</p>
											<p className="text-muted-foreground text-footnote">
												{x.req?.description}
											</p>
											<CourseLink url={x.req?.courseUrl} />
										</TableCell>
										<TableCell className="text-footnote">
											{x.open ? fmtDate.format(new Date(x.open.dueAt)) : "—"}
											{x.lastDoneAt && (
												<p className="text-muted-foreground">
													{t("completedAt", {
														date: fmtDate.format(new Date(x.lastDoneAt)),
													})}
												</p>
											)}
										</TableCell>
										<TableCell>
											<Badge variant={TONE[x.state]}>
												{t(`status_${x.state}`)}
											</Badge>
										</TableCell>
										<TableCell className="text-right">
											{x.open && x.state !== "done" && (
												<CompleteTrainingButton
													assignmentId={x.open.id}
													title={x.req?.title ?? ""}
												/>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</>
			)}

			{tab === "durchgefuehrt" &&
				(trainings.length === 0 ? (
					<p className="text-muted-foreground text-subhead">{t("empty")}</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-28">{t("heldAt")}</TableHead>
								<TableHead>{t("titleField")}</TableHead>
								<TableHead className="w-32">{t("audience")}</TableHead>
								<TableHead>{t("attendees")}</TableHead>
								<TableHead className="w-40">{t("trainer")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{trainings.map((x) => (
								<TableRow key={x.id}>
									<TableCell>{fmtDate.format(new Date(x.heldAt))}</TableCell>
									<TableCell className="font-medium">{x.title}</TableCell>
									<TableCell className="text-footnote">
										{t(`audience_${x.audience}`)}
									</TableCell>
									<TableCell className="text-footnote">
										{x.attendeeUserIds
											.map((u) => names.get(u) ?? "?")
											.join(", ")}
									</TableCell>
									<TableCell className="text-footnote">
										{x.externalTrainer ??
											(x.trainerUserId ? names.get(x.trainerUserId) : "—")}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				))}

			{tab === "matrix" && (
				<>
					<p className="mb-3 text-muted-foreground text-subhead">
						{t("matrixLead")}
					</p>
					{approvedReqs.length === 0 ? (
						<p className="text-subhead">{t("empty")}</p>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Person</TableHead>
										{approvedReqs.map((r) => (
											<TableHead
												key={r.id}
												className="text-center text-footnote"
												title={r.title}
											>
												{r.code}
											</TableHead>
										))}
									</TableRow>
								</TableHeader>
								<TableBody>
									{members.map((m) => (
										<TableRow key={m.userId}>
											<TableCell className="font-medium">{m.name}</TableCell>
											{approvedReqs.map((r) => {
												const cur = current.get(`${r.id}|${m.userId}`);
												const state = cur?.state ?? "none";
												return (
													<TableCell key={r.id} className="text-center">
														<span className="inline-flex items-center gap-0.5">
															<Badge
																variant={TONE[state]}
																title={cur?.open ? cur.open.dueAt : ""}
															>
																{t(`status_${state}`)}
															</Badge>
															{canEdit &&
																cur?.open &&
																state !== "done" &&
																cur.open.status !== "done" && (
																	<UnassignButton assignmentId={cur.open.id} />
																)}
														</span>
													</TableCell>
												);
											})}
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</>
			)}
		</>
	);
}

export default withMessages(TrainingsPage, [
	"Approvals",
	"Auth",
	"Common",
	"Entity",
	"Functions",
	"Organisation",
	"Trainings",
]);
