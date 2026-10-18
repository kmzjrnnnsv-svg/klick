import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { AccessReview } from "@/components/team/access-review";
import { InviteForm } from "@/components/team/invite-form";
import { MemberAccessForm } from "@/components/team/member-access-form";
import {
	CancelInvitationButton,
	InvitationLinkButton,
	MemberActions,
} from "@/components/team/member-actions";
import { MemberRolesForm } from "@/components/team/member-roles-form";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { listRequestsForUser } from "@/lib/approvals/service";
import { historyFor } from "@/lib/audit";
import { requireOrgPage } from "@/lib/auth/gates";
import { normalizeRole, toOrgCtx } from "@/lib/auth/guards";
import { isExternal } from "@/lib/auth/memberships";
import { listOrgMembers, listPendingInvitations } from "@/lib/auth/org";
import { canHoldCustomRoles } from "@/lib/auth/permission-catalog";
import { mfaFactors } from "@/lib/auth/session-rules";
import { listControlRows, listTasks } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { listOrgRoles, rolesByMember } from "@/lib/org/roles";

export default async function TeamPage() {
	const ctx = await requireOrgPage();
	const t = await getTranslations("Team");
	const [members, invitations] = await Promise.all([
		listOrgMembers(ctx.orgId),
		listPendingInvitations(ctx.orgId),
	]);
	const canManage = ctx.orgRole === "owner";
	const { tasks, controls, approvals, lastReview, customRoles, roleMap } =
		await readOrg(toOrgCtx(ctx), async (tx) => ({
			customRoles: (await listOrgRoles(tx, ctx.orgId)).map((r) => ({
				id: r.id,
				name: r.name,
				pending: r.members
					.map((m) => m.pendingEmail)
					.filter((e): e is string => Boolean(e)),
			})),
			roleMap: await rolesByMember(tx, ctx.orgId),
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

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={canManage ? <InviteForm roles={customRoles} /> : undefined}
			/>
			<section className="flex flex-col gap-3">
				<h2 className="lv-eyebrow text-[0.6rem] text-muted-foreground">
					{t("members")}
				</h2>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>E-Mail</TableHead>
							<TableHead>{t("inviteRole")}</TableHead>
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
												{m.name || m.email}
											</Link>
										) : (
											m.name || m.email
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
													: isExternal(role)
														? "warning"
														: "outline"
											}
										>
											{roleLabel(role)}
										</Badge>
										{role === "auditor" && (
											<Badge variant="muted" className="ml-1">
												{t("external")}
											</Badge>
										)}
										{(roleMap.get(m.memberId) ?? []).map((r) => (
											<Badge
												key={r.id}
												variant="muted"
												className="ml-1 normal-case tracking-normal"
											>
												{r.name}
											</Badge>
										))}
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
									<TableCell className="text-muted-foreground text-xs">
										{workload(m.userId)}
									</TableCell>
									<TableCell>
										{mfaFactors(m).length > 0 ? (
											<Badge variant="success">
												{mfaFactors(m).join(" + ")}
											</Badge>
										) : (
											<Badge variant="muted">offen</Badge>
										)}
									</TableCell>
									<TableCell className="text-right">
										{canManage && (
											<span className="inline-flex items-center gap-1">
												{(isExternal(role) || m.accessUntil) && (
													<MemberAccessForm
														memberId={m.memberId}
														accessUntil={m.accessUntil}
														grants={m.grants ?? []}
													/>
												)}
												{canHoldCustomRoles(role) && (
													<MemberRolesForm
														memberId={m.memberId}
														name={m.name || m.email}
														roles={customRoles}
														current={(roleMap.get(m.memberId) ?? []).map(
															(r) => r.id,
														)}
													/>
												)}
												<MemberActions
													memberId={m.memberId}
													userId={m.userId}
													name={m.name || m.email}
													currentRole={role}
													isSelf={m.userId === ctx.userId}
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
									<TableCell>
										{i.role ? roleLabel(i.role) : "—"}
										{customRoles
											.filter((r) => r.pending.includes(i.email.toLowerCase()))
											.map((r) => (
												<Badge
													key={r.id}
													variant="muted"
													className="ml-1 normal-case tracking-normal"
												>
													{r.name}
												</Badge>
											))}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{fmt.format(i.expiresAt)}
									</TableCell>
									<TableCell className="text-right">
										{canManage && (
											<span className="inline-flex items-center gap-1">
												<InvitationLinkButton invitationId={i.id} />
												<CancelInvitationButton invitationId={i.id} />
											</span>
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
