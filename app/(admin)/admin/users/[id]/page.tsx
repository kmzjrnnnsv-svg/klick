import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { RevokeSessionsButton } from "@/components/admin/revoke-sessions-button";
import { UserActions } from "@/components/admin/user-actions";
import { withMessages } from "@/components/i18n/with-messages";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { deviceLabel, isUserEventAction } from "@/lib/admin/users";
import { accountStatus } from "@/lib/auth/account-status";
import { ACTIVATION_DAYS } from "@/lib/auth/admin-accounts";
import { requirePlatformAdminPage } from "@/lib/auth/gates";
import { isExternal, roleLabel } from "@/lib/auth/memberships";
import { pendingActivations } from "@/lib/auth/registration-link";
import { normalizeRole } from "@/lib/auth/session-rules";
import {
	adminMemberAccess,
	adminUser,
	adminUserEvents,
	adminUserMemberships,
	adminUserPasskeys,
	adminUserSessions,
} from "@/lib/db/admin-users";
import { withPlatform } from "@/lib/db/with-org";

// Admin > Nutzer:innen > [Person] (Admin-Portal, Teil 3): Konto, Faktoren,
// Mitgliedschaften, laufende Sitzungen und Auth-Ereignisse aus dem
// Plattform-Protokoll. Keine Inhalte einer Org (Lockbox): was die Person
// dort getan hat, steht in der Kette der Org.
async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
	const admin = await requirePlatformAdminPage();
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const u = await adminUser(id);
	if (!u) notFound();
	const t = await getTranslations("AdminUsers");
	const ta = await getTranslations("Admin");
	const tac = await getTranslations("AdminAccounts");
	const now = new Date();
	const [passkeys, memberships, sessions, pending] = await Promise.all([
		adminUserPasskeys(id),
		adminUserMemberships(id),
		adminUserSessions(id, now),
		pendingActivations([id]),
	]);
	const externalIds = memberships
		.filter((m) => isExternal(m.role))
		.map((m) => m.memberId);
	const { access, events } = await withPlatform(
		{
			userId: admin.userId,
			ip: admin.ip,
			userAgent: admin.userAgent,
			reason: `Admin: Nutzer:in ${id} (Zugänge und Anmeldungen)`,
		},
		async (tx) => ({
			access: await adminMemberAccess(tx, externalIds),
			events: await adminUserEvents(tx, id, 20),
		}),
	);

	const linkUntil = pending.get(id) ?? null;
	const status = accountStatus(
		{ ...u, pendingActivation: linkUntil !== null },
		now,
	);
	const isSelf = id === admin.userId;
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeZone: "Europe/Berlin",
	});
	const fmtTime = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "short",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	});
	const day = (d: Date | null | undefined) => (d ? fmt.format(d) : "—");
	const when = (d: Date | null | undefined) => (d ? fmtTime.format(d) : "—");
	const statusBadge =
		status === "blocked" ? (
			<Badge variant="destructive">{tac("statusBlocked")}</Badge>
		) : status === "pending" ? (
			<Badge variant="warning">{tac("statusPending")}</Badge>
		) : (
			<Badge variant="success">{tac("statusActive")}</Badge>
		);

	return (
		<div className="flex max-w-3xl flex-col gap-6">
			<PageHeader
				back={{ href: "/admin/users", label: ta("users") }}
				title={u.name || u.email}
				lead={
					u.name && u.name !== u.email
						? t("lead", { email: u.email, date: day(u.createdAt) })
						: t("leadNoName", { date: day(u.createdAt) })
				}
				actions={
					<UserActions
						userId={u.id}
						name={u.name || u.email}
						email={u.email}
						status={status}
						isAdmin={u.role === "admin"}
						isSelf={isSelf}
						activationDays={ACTIVATION_DAYS}
					/>
				}
			/>

			{status === "blocked" && (
				<div role="status" className="rounded-2xl bg-destructive/10 p-4">
					<p className="font-semibold text-headline">
						{u.banExpires
							? t("blockedUntil", { date: day(u.banExpires) })
							: t("blockedOpen")}
					</p>
					{u.banReason && <p className="text-body">{u.banReason}</p>}
				</div>
			)}
			{status === "pending" && linkUntil && (
				<div role="status" className="rounded-2xl bg-warning/12 p-4">
					<p className="text-body">
						{linkUntil < now
							? t("pendingExpired")
							: t("pendingUntil", { date: day(linkUntil) })}
					</p>
				</div>
			)}

			<ListGroup>
				<ListSection title={t("sectionAccount")}>
					<ListRow title={t("field_status")} accessory={statusBadge} />
					<ListRow
						title={t("field_account")}
						value={
							u.role === "admin"
								? t("accountAdmin")
								: memberships.length > 0
									? t("accountCustomer")
									: t("accountNone")
						}
					/>
					<ListRow
						title={t("field_emailVerified")}
						value={u.emailVerified ? t("yes") : t("no")}
					/>
					<ListRow title={t("field_created")} value={day(u.createdAt)} />
				</ListSection>

				<ListSection title={t("sectionFactors")} footer={t("factorsFooter")}>
					{passkeys.map((p) => (
						<ListRow
							key={p.id}
							title={p.name || t("passkeyUnnamed")}
							subtitle={t("passkeyCreated", { date: day(p.createdAt) })}
							value={
								p.deviceType === "singleDevice" && !p.backedUp
									? t("passkeyKey")
									: t("passkeySynced")
							}
						/>
					))}
					<ListRow
						title={t("totp")}
						value={u.twoFactorEnabled ? t("on") : t("off")}
					/>
					{passkeys.length === 0 && !u.twoFactorEnabled && (
						<ListRow title={t("noFactor")} destructive={status === "active"} />
					)}
				</ListSection>

				<ListSection title={t("sectionOrgs")}>
					{memberships.length === 0 ? (
						<ListRow title={t("orgsEmpty")} />
					) : (
						memberships.map((m) => {
							const until = access.get(m.memberId);
							return (
								<ListRow
									key={m.memberId}
									href={`/admin/orgs/${m.orgId}`}
									title={m.orgName}
									subtitle={
										isExternal(m.role)
											? until
												? t("externalUntil", { date: day(until) })
												: t("externalOpen")
											: t("memberSince", { date: day(m.since) })
									}
									accessory={
										<Badge
											variant={
												normalizeRole(m.role) === "owner"
													? "secondary"
													: isExternal(m.role)
														? "warning"
														: "muted"
											}
										>
											{roleLabel(m.role)}
										</Badge>
									}
								/>
							);
						})
					)}
				</ListSection>

				<ListSection title={t("sectionSessions")} footer={t("sessionsFooter")}>
					{sessions.length === 0 ? (
						<ListRow title={t("sessionsEmpty")} />
					) : (
						sessions.map((s) => (
							<ListRow
								key={s.id}
								title={deviceLabel(s.userAgent) ?? t("sessionUnknownDevice")}
								subtitle={
									<>
										{t("sessionLine", {
											start: when(s.createdAt),
											last: when(s.lastActiveAt),
										})}
										{s.orgName && <> · {t("sessionOrg", { org: s.orgName })}</>}
										{s.ipAddress && (
											<span
												translate="no"
												className="block font-mono text-footnote"
											>
												{s.ipAddress}
											</span>
										)}
									</>
								}
								accessory={
									s.impersonated ? (
										<Badge variant="warning">{t("sessionImpersonated")}</Badge>
									) : !s.mfa ? (
										<Badge variant="muted">{t("sessionNoMfa")}</Badge>
									) : undefined
								}
							/>
						))
					)}
				</ListSection>
				{!isSelf && (
					<div>
						<RevokeSessionsButton
							userId={u.id}
							name={u.name || u.email}
							count={sessions.length}
						/>
					</div>
				)}

				<ListSection title={t("sectionEvents")} footer={t("eventsFooter")}>
					{events.length === 0 ? (
						<ListRow title={t("eventsEmpty")} />
					) : (
						events.map((e) => (
							<ListRow
								key={e.id}
								title={
									isUserEventAction(e.action) ? (
										t(`ev_${e.action.replace(".", "_")}` as "ev_auth_signin")
									) : (
										<span translate="no" className="font-mono">
											{e.action}
										</span>
									)
								}
								subtitle={[
									when(e.at),
									deviceLabel(e.userAgent),
									e.actorUserId && e.actorUserId !== id
										? t("eventByAdmin")
										: null,
								]
									.filter(Boolean)
									.join(" · ")}
								accessory={
									e.outcome !== "success" ? (
										<Badge variant="destructive">{t("eventFailed")}</Badge>
									) : undefined
								}
							/>
						))
					)}
				</ListSection>
			</ListGroup>
			<p className="text-subhead text-muted-foreground">
				{t("auditHint")}{" "}
				<Link href="/admin/audit" className="underline">
					{ta("audit")}
				</Link>
			</p>
		</div>
	);
}

export default withMessages(AdminUserPage, [
	"Admin",
	"AdminAccounts",
	"AdminUsers",
	"Auth",
	"Common",
	"Roles",
	"Team",
]);
