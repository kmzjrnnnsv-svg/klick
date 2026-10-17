import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { AccessReview } from "@/components/team/access-review";
import { InviteForm } from "@/components/team/invite-form";
import { MemberAccessForm } from "@/components/team/member-access-form";
import {
	CancelInvitationButton,
	MemberActions,
} from "@/components/team/member-actions";
import { RightsMatrix } from "@/components/team/rights-matrix";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { approvalWorkflows, roleAssignments } from "@/db/schema";
import type { ApprovalStep } from "@/db/schema/grc";
import { listRequestsForUser } from "@/lib/approvals/service";
import { historyFor } from "@/lib/audit";
import { requireOrgPage } from "@/lib/auth/gates";
import { normalizeRole, toOrgCtx } from "@/lib/auth/guards";
import { listOrgMembers, listPendingInvitations } from "@/lib/auth/org";
import { canDecideApprovals } from "@/lib/auth/role-guide";
import { listControlRows, listTasks } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";

export default async function TeamPage() {
	const ctx = await requireOrgPage();
	const t = await getTranslations("Team");
	const [members, invitations] = await Promise.all([
		listOrgMembers(ctx.orgId),
		listPendingInvitations(ctx.orgId),
	]);
	const canManage = ctx.orgRole === "owner";
	const tf = await getTranslations("Functions");
	const { tasks, controls, approvals, lastReview, fns, workflows } =
		await readOrg(toOrgCtx(ctx), async (tx) => ({
			fns: await tx
				.select({
					fn: roleAssignments.function,
					userId: roleAssignments.userId,
					deputyUserId: roleAssignments.deputyUserId,
				})
				.from(roleAssignments)
				.where(eq(roleAssignments.organizationId, ctx.orgId)),
			workflows: await tx
				.select({ steps: approvalWorkflows.steps })
				.from(approvalWorkflows)
				.where(
					and(
						eq(approvalWorkflows.organizationId, ctx.orgId),
						eq(approvalWorkflows.enabled, true),
					),
				),
			tasks: await listTasks(tx, ctx.orgId, { openOnly: true }),
			controls: await listControlRows(tx, ctx.orgId),
			approvals: await listRequestsForUser(tx, ctx.orgId, ctx.userId),
			lastReview:
				(await historyFor(tx, `organization:${ctx.orgId}`, 50)).find(
					(h) => h.action === "access.review",
				)?.at ?? null,
		}));
	const workload = (userId: string) =>
		`${tasks.filter((x) => x.assigneeUserId === userId).length} ${t("openTasks")} · ${controls.filter((x) => x.ownerUserId === userId).length} ${t("ownedControls")} · ${approvals.filter((x) => x.requestedByUserId === userId).length} ${t("pendingApprovals")}`;
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeZone: "Europe/Berlin",
	});
	const roleLabel = (r: string) =>
		t(`role${r[0]?.toUpperCase()}${r.slice(1)}` as "roleOwner");
	// Funktionen, nach denen aktive Freigabe-Workflows fragen
	const approvalFns = new Set(
		workflows.flatMap((w) =>
			(w.steps as ApprovalStep[])
				.map((st) => st.approverRule)
				.filter((r) => r.startsWith("function:"))
				.map((r) => r.slice("function:".length)),
		),
	);
	const fnsOf = (userId: string) =>
		fns.filter((f) => f.userId === userId || f.deputyUserId === userId);

	return (
		<>
			<PageHeader
				help="team"
				tour="team"
				title={t("title")}
				lead={t("lead")}
				actions={canManage ? <InviteForm /> : undefined}
			/>
			<details
				data-tour="rights"
				className="mb-6 rounded-md border bg-muted/30 p-4 text-sm [&[open]>summary]:mb-3"
			>
				<summary className="cursor-pointer font-medium">
					{t("rightsTitle")}
				</summary>
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="flex flex-col gap-2">
						<p>{t("rightsRole")}</p>
						<p>{t("rightsFunction")}</p>
						<p className="text-muted-foreground">{t("rightsExtra")}</p>
						<Link
							href="/organisation?tab=rollen"
							className="w-fit text-primary hover:underline"
						>
							{t("rightsFunctionsLink")} →
						</Link>
					</div>
					<RightsMatrix />
				</div>
			</details>
			<section className="flex flex-col gap-3" data-tour="members">
				<h2 className="lv-eyebrow text-[0.6rem] text-muted-foreground">
					{t("members")}
				</h2>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>E-Mail</TableHead>
							<TableHead>{t("inviteRole")}</TableHead>
							<TableHead>{t("functionsCol")}</TableHead>
							<TableHead>{t("workload")}</TableHead>
							<TableHead>MFA</TableHead>
							<TableHead className="text-right" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{members.map((m) => {
							const role = normalizeRole(m.role);
							return (
								<TableRow key={m.memberId}>
									<TableCell className="font-medium">
										{canManage ? (
											<Link
												href={`/team/${m.userId}`}
												className="hover:underline underline-offset-4"
											>
												{m.name}
											</Link>
										) : (
											m.name
										)}
										{m.userId === ctx.userId && (
											<span className="ml-2 text-muted-foreground text-xs">
												({t("you")})
											</span>
										)}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{m.email}
									</TableCell>
									<TableCell>
										<Badge
											variant={
												role === "owner"
													? "default"
													: role === "auditor"
														? "warning"
														: "outline"
											}
										>
											{roleLabel(role)}
										</Badge>
										{m.accessUntil && (
											<span
												className={`ml-2 text-xs ${m.accessUntil.getTime() < Date.now() ? "text-destructive" : "text-muted-foreground"}`}
											>
												bis {fmt.format(m.accessUntil)}
											</span>
										)}
										{(m.grants?.length ?? 0) > 0 && (
											<span className="ml-2 text-muted-foreground text-xs">
												· {m.grants?.length} {t("grantsShort")}
											</span>
										)}
									</TableCell>
									<TableCell className="max-w-64">
										<span className="flex flex-wrap gap-1">
											{fnsOf(m.userId).length === 0 && (
												<span className="text-muted-foreground text-xs">—</span>
											)}
											{fnsOf(m.userId).map((f) => {
												const blocked =
													approvalFns.has(f.fn) && !canDecideApprovals(role);
												return (
													<Badge
														key={`${f.fn}-${f.userId === m.userId ? "a" : "d"}`}
														variant={blocked ? "warning" : "outline"}
														className="normal-case tracking-normal"
														title={
															blocked
																? t("functionNoDecide", {
																		fn: tf(f.fn),
																		role: roleLabel(role),
																	})
																: undefined
														}
													>
														{tf(f.fn)}
														{f.userId !== m.userId
															? ` (${t("deputyShort")})`
															: ""}
														{blocked ? " ⚠" : ""}
													</Badge>
												);
											})}
										</span>
										{fnsOf(m.userId).some(
											(f) => approvalFns.has(f.fn) && !canDecideApprovals(role),
										) && (
											<p className="mt-1 text-warning text-xs">
												{t("functionNoDecideShort")}
											</p>
										)}
									</TableCell>
									<TableCell className="text-muted-foreground text-xs">
										{workload(m.userId)}
									</TableCell>
									<TableCell>
										{m.twoFactorEnabled ? (
											<Badge variant="success">aktiv</Badge>
										) : (
											<Badge variant="muted">offen</Badge>
										)}
									</TableCell>
									<TableCell className="text-right">
										{canManage && (
											<span className="inline-flex items-center gap-1">
												{(role === "auditor" || m.accessUntil) && (
													<MemberAccessForm
														memberId={m.memberId}
														accessUntil={m.accessUntil}
														grants={m.grants ?? []}
													/>
												)}
												<MemberActions
													memberId={m.memberId}
													currentRole={role}
													isSelf={m.userId === ctx.userId}
													name={m.name || m.email}
												/>
											</span>
										)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</section>
			<section className="mt-10 flex flex-col gap-3">
				<h2 className="lv-eyebrow text-[0.6rem] text-muted-foreground">
					{t("pending")}
				</h2>
				{invitations.length === 0 ? (
					<p className="text-muted-foreground text-sm">{t("noPending")}</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>E-Mail</TableHead>
								<TableHead>{t("inviteRole")}</TableHead>
								<TableHead>{t("expires")}</TableHead>
								<TableHead className="text-right" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{invitations.map((i) => (
								<TableRow key={i.id}>
									<TableCell>{i.email}</TableCell>
									<TableCell>{i.role ? roleLabel(i.role) : "—"}</TableCell>
									<TableCell className="text-muted-foreground">
										{fmt.format(i.expiresAt)}
									</TableCell>
									<TableCell className="text-right">
										{canManage && (
											<CancelInvitationButton invitationId={i.id} />
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</section>
			{canManage && (
				<section className="mt-8 max-w-xl">
					<AccessReview lastAt={lastReview} />
				</section>
			)}
		</>
	);
}
