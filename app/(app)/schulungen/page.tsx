import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { UrlTabs } from "@/components/entity/url-tabs";
import { PageHeader } from "@/components/page-header";
import {
	ApplyRequirementsButton,
	TrainingForm,
} from "@/components/registers/training-form";
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
import { listMembersForPicker, userNames } from "@/lib/compliance/queries";
import {
	listTrainingAssignments,
	listTrainingRequirements,
	listTrainings,
} from "@/lib/compliance/queries-p2";
import { readOrg } from "@/lib/db/with-org";

export default async function TrainingsPage({
	searchParams,
}: {
	searchParams: Promise<{ tab?: string }>;
}) {
	const { tab = "plan" } = await searchParams;
	const ctx = await requireOrgPage({ task: ["read"] });
	const t = await getTranslations("Trainings");
	const canEdit = roleAllows(ctx.orgRole, { task: ["create"] });
	const canSettings = roleAllows(ctx.orgRole, { settings: ["update"] });
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
	const stateOf = (a: (typeof assignments)[number]) =>
		a.status === "done" ? "done" : a.dueAt < today ? "overdue" : "due";
	const TONE = {
		done: "success",
		due: "warning",
		overdue: "destructive",
		none: "muted",
	} as const;

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					canEdit ? (
						<TrainingForm
							members={members}
							requirements={requirements.map((r) => ({
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
						actions={canSettings ? <ApplyRequirementsButton /> : undefined}
					/>
				) : (
					<>
						<div className="mb-3 flex justify-end">
							{canSettings && <ApplyRequirementsButton />}
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
									<TableHead className="w-32 text-right">
										{t("status_due")} / {t("status_overdue")}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{requirements.map((r) => {
									const as = assignments.filter(
										(a) => a.requirementId === r.id,
									);
									const due = as.filter((a) => stateOf(a) === "due").length;
									const overdue = as.filter(
										(a) => stateOf(a) === "overdue",
									).length;
									return (
										<TableRow key={r.id}>
											<TableCell className="font-mono text-xs">
												{r.code}
											</TableCell>
											<TableCell>
												<p className="font-medium">{r.title}</p>
												<p className="text-muted-foreground text-xs">
													{r.description}
												</p>
											</TableCell>
											<TableCell className="text-xs">
												{r.function ?? r.orgRole ?? "—"}
											</TableCell>
											<TableCell className="text-xs">
												{t("frequency", { n: r.frequencyMonths })}
											</TableCell>
											<TableCell className="text-muted-foreground text-xs">
												{r.legalBasis}
											</TableCell>
											<TableCell className="text-right">
												<Badge
													variant={
														overdue > 0
															? "destructive"
															: due > 0
																? "warning"
																: "success"
													}
												>
													{due} / {overdue}
												</Badge>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</>
				))}

			{tab === "durchgefuehrt" &&
				(trainings.length === 0 ? (
					<p className="text-muted-foreground text-sm">{t("empty")}</p>
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
									<TableCell className="text-xs">
										{t(`audience_${x.audience}`)}
									</TableCell>
									<TableCell className="text-xs">
										{x.attendeeUserIds
											.map((u) => names.get(u) ?? "?")
											.join(", ")}
									</TableCell>
									<TableCell className="text-xs">
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
					<p className="mb-3 text-muted-foreground text-sm">
						{t("matrixLead")}
					</p>
					{requirements.length === 0 ? (
						<p className="text-sm">{t("empty")}</p>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Person</TableHead>
										{requirements.map((r) => (
											<TableHead
												key={r.id}
												className="text-center text-xs"
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
											{requirements.map((r) => {
												const a = assignments
													.filter(
														(x) =>
															x.requirementId === r.id && x.userId === m.userId,
													)
													.sort((x, y) => y.dueAt.localeCompare(x.dueAt))[0];
												const state = a ? stateOf(a) : "none";
												return (
													<TableCell key={r.id} className="text-center">
														<Badge
															variant={TONE[state]}
															title={a ? `${a.dueAt}` : ""}
														>
															{t(`status_${state}`)}
														</Badge>
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
