import { InviteDialog } from "@wallet/components/members/invite-dialog";
import {
	RemoveMember,
	RevokeInvitation,
	RoleSelect,
} from "@wallet/components/members/member-actions";
import { MEMBER_ROLES } from "@wallet/db/schema/enums";
import { requireOrgPage } from "@wallet/lib/auth/gates";
import { ROLE_LABEL, roleAllows } from "@wallet/lib/auth/permissions";
import { listMembers, listOpenInvitations } from "@wallet/lib/orgs/members";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "Mitglieder" };

export default async function MembersPage() {
	const t = await getTranslations("Members");
	const ctx = await requireOrgPage("/members", "members:read");
	const c = { orgId: ctx.orgId, userId: ctx.userId };
	const manage = roleAllows(ctx.role, "members:manage");
	const [rows, open] = await Promise.all([
		listMembers(c),
		manage ? listOpenInvitations(c) : Promise.resolve([]),
	]);
	const roles = MEMBER_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));
	const date = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeZone: "Europe/Berlin",
	});
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div className="flex max-w-2xl flex-col gap-2">
					<h1 className="font-bold text-title-1">{t("title")}</h1>
					<p className="text-muted-foreground">
						{t("lead", { org: ctx.orgName })}
					</p>
				</div>
				{manage && <InviteDialog roles={roles} />}
			</div>
			<ul className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-card">
				{rows.map((m) => (
					<li
						key={m.id}
						className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4"
					>
						<div className="min-w-0 grow">
							<p className="truncate font-medium">
								{m.name}
								{m.userId === ctx.userId && (
									<span className="ml-2 text-muted-foreground text-footnote">
										({t("you")})
									</span>
								)}
							</p>
							<p
								className="truncate text-muted-foreground text-subhead"
								translate="no"
							>
								{m.email}
							</p>
						</div>
						<p className="text-muted-foreground text-footnote tabular-nums">
							{t("since")} {date.format(m.createdAt)}
						</p>
						{manage && m.userId !== ctx.userId ? (
							<div className="flex items-center gap-2">
								<RoleSelect
									memberId={m.id}
									name={m.name}
									role={m.role}
									roles={roles}
								/>
								<RemoveMember memberId={m.id} name={m.name} org={ctx.orgName} />
							</div>
						) : (
							<span className="text-subhead">{ROLE_LABEL[m.role]}</span>
						)}
					</li>
				))}
			</ul>
			{manage && open.length > 0 && (
				<section className="flex flex-col gap-3">
					<h2 className="font-medium">{t("open")}</h2>
					<ul className="divide-y divide-border/60 overflow-hidden rounded-2xl bg-card">
						{open.map((i) => (
							<li
								key={i.id}
								className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4"
							>
								<p className="min-w-0 grow truncate" translate="no">
									{i.email}
								</p>
								<span className="text-subhead">{ROLE_LABEL[i.role]}</span>
								<span className="text-muted-foreground text-footnote tabular-nums">
									{t("until", { date: date.format(i.expiresAt) })}
								</span>
								<RevokeInvitation id={i.id} />
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
