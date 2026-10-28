import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
	ContractDialog,
	ResumeButton,
	SuspendDialog,
} from "@/components/admin/org-actions";
import { OrgPriceGroupSelect } from "@/components/admin/org-price-group-select";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import {
	type AccountState,
	accountOrDefault,
	accountState,
	feeState,
} from "@/lib/admin/contract";
import { requirePlatformAdminPage } from "@/lib/auth/gates";
import { isExternal } from "@/lib/auth/memberships";
import { ORG_ROLES, type OrgRole } from "@/lib/auth/session-rules";
import {
	adminOrg,
	adminOrgMembers,
	adminOrgSettings,
	adminOrgSso,
} from "@/lib/db/admin-orgs";
import { orgAccount } from "@/lib/db/org-accounts";
import { grantsForOrg } from "@/lib/db/platform-access";
import { listPriceGroups, orgPriceGroupIds } from "@/lib/db/pricing";
import { withPlatform } from "@/lib/db/with-org";
import { grantState } from "@/lib/platform-access/rules";

const STATE_BADGE: Record<
	AccountState,
	"success" | "warning" | "destructive" | "secondary"
> = {
	active: "success",
	trial: "secondary",
	cancelled: "warning",
	ended: "secondary",
	suspended: "destructive",
};

const isoDay = (d: Date | null | undefined) =>
	d ? d.toISOString().slice(0, 10) : "";

// Admin > Organisationen > [Org] (Admin-Portal, Teil 2): Betriebsdaten der
// Organisation als gruppierte Liste. Keine Inhalte (Lockbox): was dort steht,
// sieht der Betrieb nur über eine Freigabe unter Admin > Zugriffe.
export default async function AdminOrgPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const admin = await requirePlatformAdminPage();
	const { id } = await params;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const org = await adminOrg(id);
	if (!org) notFound();
	const t = await getTranslations("AdminOrgs");
	const ta = await getTranslations("Admin");
	const now = new Date();
	const ctx = {
		userId: admin.userId,
		ip: admin.ip,
		userAgent: admin.userAgent,
	};
	const [members, sso, account, grants, groups, settings, assignments] =
		await Promise.all([
			adminOrgMembers(id),
			adminOrgSso(id),
			orgAccount(id),
			grantsForOrg(id),
			listPriceGroups(),
			withPlatform(
				{ ...ctx, reason: `Admin: Organisation ${org.slug} (Status)` },
				(tx) => adminOrgSettings(tx, id),
			),
			withPlatform(
				{ ...ctx, reason: "Admin: Organisationen mit Preisgruppen" },
				(tx) => orgPriceGroupIds(tx),
			),
		]);

	const acc = accountOrDefault(account);
	const state = accountState(acc, now);
	const fee = feeState(acc, now);
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeZone: "Europe/Berlin",
	});
	const day = (d: Date | null | undefined) => (d ? fmt.format(d) : "—");

	const owners = members.filter((m) => m.role === "owner");
	const externals = members.filter((m) => isExternal(m.role));
	const consultants = members.filter((m) => m.role === "consultant").length;
	const withFactor = members.filter((m) => m.passkeys > 0 || m.totp).length;
	const roleCounts = new Map<string, number>();
	for (const m of members)
		roleCounts.set(m.role, (roleCounts.get(m.role) ?? 0) + 1);
	const activeGrants = grants.filter(
		(g) => grantState(g, now) === "active",
	).length;
	const openRequests = grants.filter(
		(g) => grantState(g, now) === "requested",
	).length;
	const groupId = assignments.get(id) ?? null;
	const defaultGroup = groups.find((r) => r.group.isDefault)?.group ?? null;
	const options = groups.map((r) => ({ id: r.group.id, name: r.group.name }));
	const isMember = members.some((m) => m.userId === admin.userId);

	const feeText =
		fee.kind === "before_audit"
			? t("fee_before_audit")
			: fee.kind === "due"
				? t("fee_due", { since: day(fee.since) })
				: fee.kind === "invoiced"
					? t("fee_invoiced", {
							audit: day(fee.auditAt),
							next: day(fee.nextAuditExpected),
						})
					: t("fee_none");

	return (
		<div className="flex max-w-3xl flex-col gap-6">
			<PageHeader
				back={{ href: "/admin/orgs", label: ta("orgs") }}
				title={org.name}
				lead={t("lead", { slug: org.slug, date: day(org.createdAt) })}
			/>

			{acc.suspendedAt && (
				<div
					role="status"
					className="flex flex-col gap-3 rounded-2xl bg-destructive/10 p-4"
				>
					<p className="font-semibold text-headline">
						{t("suspendedBanner", { date: day(acc.suspendedAt) })}
					</p>
					{acc.suspendedReason && (
						<p className="text-body">{acc.suspendedReason}</p>
					)}
					<div>
						<ResumeButton orgId={id} />
					</div>
				</div>
			)}

			<ListGroup>
				<ListSection title={t("sectionContract")}>
					<ListRow
						title={t("field_status")}
						accessory={
							<Badge variant={STATE_BADGE[state]}>{t(`state_${state}`)}</Badge>
						}
					/>
					<ListRow title={t("field_startedAt")} value={day(acc.startedAt)} />
					<ListRow
						title={t("field_auditPassedAt")}
						value={day(acc.auditPassedAt)}
					/>
					<ListRow title={t("fee")} subtitle={feeText} />
					<ListRow
						title={t("consultants")}
						value={t("consultantsValue", { n: consultants })}
					/>
					{acc.status === "cancelled" && (
						<ListRow
							title={t("field_cancelledAt")}
							value={day(acc.cancelledAt)}
						/>
					)}
					{account?.note && (
						<ListRow
							title={t("field_note")}
							subtitle={
								<span className="whitespace-pre-line">{account.note}</span>
							}
						/>
					)}
				</ListSection>
				<div className="flex flex-wrap gap-3">
					<ContractDialog
						orgId={id}
						values={{
							status: acc.status,
							startedAt: isoDay(acc.startedAt),
							auditPassedAt: isoDay(acc.auditPassedAt),
							feeInvoicedFor: isoDay(acc.feeInvoicedFor),
							cancelledAt: isoDay(acc.cancelledAt),
							note: account?.note ?? "",
						}}
					/>
					{!acc.suspendedAt && !isMember && (
						<SuspendDialog orgId={id} orgName={org.name} />
					)}
				</div>

				<ListSection title={t("sectionPrice")} footer={t("priceFooter")}>
					<ListRow title={ta("priceGroup")}>
						<OrgPriceGroupSelect
							orgId={id}
							orgName={org.name}
							value={groupId}
							groups={options}
							defaultName={defaultGroup?.name ?? null}
						/>
					</ListRow>
				</ListSection>

				<ListSection title={t("sectionProfile")}>
					<ListRow
						title={t("frameworks")}
						subtitle={
							settings?.frameworks.length
								? settings.frameworks.map((f) => f.name).join(", ")
								: t("none")
						}
					/>
					<ListRow title={t("stage")} value={settings?.licenceStage ?? "—"} />
					<ListRow
						title={t("setup")}
						value={
							!settings
								? t("setupMissing")
								: settings.setup.completed
									? t("setupDone")
									: settings.setup.started
										? t("setupOpen", { step: settings.setup.next ?? "—" })
										: t("setupNone")
						}
					/>
					<ListRow
						title={t("governance")}
						value={
							settings?.governanceMode === "individual"
								? t("governanceIndividual")
								: t("governanceStandard")
						}
					/>
				</ListSection>

				<ListSection title={t("sectionMembers")} footer={t("membersFooter")}>
					<ListRow
						title={t("membersTotal")}
						value={t("membersValue", {
							n: members.length,
							ext: externals.length,
						})}
					/>
					<ListRow
						title={t("roles")}
						subtitle={
							[...roleCounts.entries()]
								.map(
									([role, n]) =>
										`${n} × ${(ORG_ROLES as readonly string[]).includes(role) ? t(`role_${role as OrgRole}`) : role}`,
								)
								.join(", ") || t("none")
						}
					/>
					<ListRow
						title={t("mfa")}
						value={t("mfaValue", { n: withFactor, of: members.length })}
					/>
					{owners.map((o) => (
						<ListRow
							key={o.userId}
							title={o.name}
							subtitle={
								<span translate="no" className="break-all">
									{o.email}
								</span>
							}
							value={t("owner")}
						/>
					))}
				</ListSection>
				{members.length === 0 && (
					<p className="text-subhead text-muted-foreground">
						{t("noMembers")}{" "}
						<Link href="/admin/users" className="underline">
							{t("noMembersLink")}
						</Link>
					</p>
				)}

				<ListSection title={t("sectionSecurity")}>
					<ListRow
						title={t("sso")}
						subtitle={
							sso.length === 0
								? t("ssoNone")
								: sso
										.map(
											(p) =>
												`${p.domain} (${p.saml ? "SAML" : "OIDC"}${p.verified ? "" : `, ${t("ssoUnverified")}`})`,
										)
										.join(", ")
						}
						value={settings?.sso.enforce ? t("ssoEnforced") : undefined}
					/>
					<ListRow
						title={t("network")}
						value={settings?.networkActive ? t("on") : t("off")}
					/>
					<ListRow
						title={t("securityChanges")}
						value={String(settings?.pendingSecurityChanges ?? 0)}
					/>
					<ListRow
						href="/admin/zugriffe"
						title={t("lockbox")}
						subtitle={t("lockboxValue", {
							active: activeGrants,
							requested: openRequests,
						})}
					/>
				</ListSection>
			</ListGroup>
			<div>
				<Button asChild variant="secondary">
					<Link href="/admin/zugriffe">{t("requestAccess")}</Link>
				</Button>
			</div>
		</div>
	);
}
