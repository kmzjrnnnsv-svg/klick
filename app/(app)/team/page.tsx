import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { InviteForm } from "@/components/team/invite-form";
import {
	CancelInvitationButton,
	MemberActions,
} from "@/components/team/member-actions";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { normalizeRole, requireOrg } from "@/lib/auth/guards";
import { listOrgMembers, listPendingInvitations } from "@/lib/auth/org";

export default async function TeamPage() {
	const ctx = await requireOrg();
	const t = await getTranslations("Team");
	const [members, invitations] = await Promise.all([
		listOrgMembers(ctx.orgId),
		listPendingInvitations(ctx.orgId),
	]);
	const canManage = ctx.orgRole === "owner";
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
				actions={canManage ? <InviteForm /> : undefined}
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
										{m.name}
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
											<span className="ml-2 text-muted-foreground text-xs">
												bis {fmt.format(m.accessUntil)}
											</span>
										)}
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
											<MemberActions
												memberId={m.memberId}
												currentRole={role}
												isSelf={m.userId === ctx.userId}
											/>
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
		</>
	);
}
