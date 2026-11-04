import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { RegisterFilters } from "@/components/entity/register-filters";
import { UserChip } from "@/components/entity/user-chip";
import { withMessages } from "@/components/i18n/with-messages";
import { PageHeader } from "@/components/page-header";
import { SectionSwitch } from "@/components/shell/section-switch";
import { AccessReview } from "@/components/team/access-review";
import { InviteForm } from "@/components/team/invite-form";
import { MemberAccessForm } from "@/components/team/member-access-form";
import {
	CancelInvitationButton,
	InvitationLinkButton,
	MemberActions,
} from "@/components/team/member-actions";
import { MemberRolesForm } from "@/components/team/member-roles-form";
import { RemindButton } from "@/components/team/remind-button";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { historyFor } from "@/lib/audit";
import { requireOrgPage } from "@/lib/auth/gates";
import { normalizeRole, toOrgCtx } from "@/lib/auth/guards";
import { isExternal } from "@/lib/auth/memberships";
import { listOrgMembers, listPendingInvitations } from "@/lib/auth/org";
import { canHoldOwnRole } from "@/lib/auth/permission-catalog";
import { allows } from "@/lib/auth/permissions";
import { mfaFactors } from "@/lib/auth/session-rules";
import { addDays } from "@/lib/charts/timeline";
import {
	matchesPerson,
	personDueStatus,
	remindAllowed,
	TEAM_VIEWS,
	teamView,
} from "@/lib/compliance/people";
import { lastReminders } from "@/lib/compliance/queries-people";
import { openItemsByPerson } from "@/lib/compliance/queries-report";
import { readOrg } from "@/lib/db/with-org";
import { berlinToday } from "@/lib/evidence-studio/queries";
import {
	hasIdentitySource,
	identityAccountCounts,
	identityPolicyFor,
} from "@/lib/identity/queries";
import { listOrgRoles, rolesByMember } from "@/lib/org/roles";
import { cn } from "@/lib/utils";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function TeamPage({ searchParams }: { searchParams: Promise<Search> }) {
	const ctx = await requireOrgPage();
	const sp = await searchParams;
	const t = await getTranslations("Team");
	const [members, invitations] = await Promise.all([
		listOrgMembers(ctx.orgId),
		listPendingInvitations(ctx.orgId),
	]);
	const tr = await getTranslations("Roles");
	const canManage = ctx.orgRole === "owner";
	const today = berlinToday();
	const canIdentity = allows(ctx, { identity: ["read"] });
	const { loads, reminded, lastReview, customRoles, roleMap, identity } =
		await readOrg(toOrgCtx(ctx), async (tx) => ({
			// Konten aus Entra ID (Teil D): Karte nur mit Recht und Quelle
			identity:
				canIdentity && (await hasIdentitySource(tx, ctx.orgId))
					? await identityAccountCounts(
							tx,
							ctx.orgId,
							new Date(),
							await identityPolicyFor(tx, ctx.orgId),
						)
					: null,
			customRoles: (await listOrgRoles(tx, ctx.orgId)).map((r) => ({
				id: r.id,
				name: r.name,
				pending: r.holders
					.map((h) => (h.userId ? null : h.pendingEmail))
					.filter((e): e is string => Boolean(e)),
				// vorgeschlagen, wartet auf die Bestellung (ADR-024)
				proposed: r.holders
					.filter((h) => h.userId && h.status === "proposed")
					.map((h) => h.userId as string),
			})),
			roleMap: await rolesByMember(tx, ctx.orgId),
			// offene Punkte je Person in SQL gezählt (wie /auswertung)
			loads: new Map(
				(await openItemsByPerson(tx, ctx.orgId, today, addDays(today, 14))).map(
					(l) => [l.userId, l],
				),
			),
			reminded: await lastReminders(tx, ctx.orgId),
			lastReview:
				(await historyFor(tx, `organization:${ctx.orgId}`, 50)).find(
					(h) => h.action === "access.review",
				)?.at ?? null,
		}));
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeZone: "Europe/Berlin",
	});
	const roleLabel = (r: string) =>
		t(`role${r[0]?.toUpperCase()}${r.slice(1)}` as "roleOwner");
	const now = new Date();
	const view = teamView(one(sp.ansicht));
	const q = one(sp.q);
	const rows = members.map((m) => ({
		...m,
		role: normalizeRole(m.role),
		due: personDueStatus(loads.get(m.userId)),
		lastReminded: reminded.get(m.userId) ?? null,
	}));
	const counts = {
		offen: rows.filter((r) => r.due.level !== "none").length,
		alle: rows.length,
		eingeladen: invitations.length,
		extern: rows.filter((r) => isExternal(r.role)).length,
	};
	const shown = rows
		.filter(
			(r) =>
				(view === "offen" && r.due.level !== "none") ||
				(view === "extern" && isExternal(r.role)) ||
				view === "alle",
		)
		.filter((r) => matchesPerson(r, q))
		.sort((a, b) =>
			view === "offen"
				? b.due.overdue - a.due.overdue || b.due.soon - a.due.soon
				: 0,
		);
	const viewHref = (v: string) => {
		const p = new URLSearchParams();
		if (v !== "alle") p.set("ansicht", v);
		if (q) p.set("q", q);
		const s = p.toString();
		return s ? `/team?${s}` : "/team";
	};

	return (
		<>
			<SectionSwitch group="team" current="/team" ctx={ctx} />

			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={canManage ? <InviteForm roles={customRoles} /> : undefined}
			/>
			{(identity || (canManage && canIdentity)) && (
				<Link
					href="/team/konten"
					className="hit-area mb-4 flex items-center justify-between gap-3 rounded-2xl bg-card p-4 text-subhead hover:bg-muted/60"
				>
					<span className="flex min-w-0 flex-col gap-0.5">
						<span className="font-medium">{t("identityCard")}</span>
						<span className="text-footnote text-muted-foreground">
							{identity
								? t("identityCardCounts", {
										n: identity.all,
										mfa: identity.withoutMfa,
										admins: identity.admins,
									})
								: t("identityCardConnect")}
						</span>
					</span>
					<ChevronRight
						className="size-4 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
				</Link>
			)}
			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
				<nav
					aria-label={t("viewLabel")}
					className="inline-flex w-fit max-w-full overflow-x-auto rounded-xl bg-muted p-0.5 text-subhead"
				>
					{TEAM_VIEWS.map((v) => (
						<Link
							key={v}
							href={viewHref(v)}
							aria-current={view === v ? "true" : undefined}
							className={cn(
								"hit-area inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5",
								view === v && "bg-card font-medium shadow-sm",
							)}
						>
							{t(`view_${v}`)}
							<span className="tabular-nums text-muted-foreground">
								{counts[v]}
							</span>
						</Link>
					))}
				</nav>
				{view !== "eingeladen" && (
					<RegisterFilters
						filters={[]}
						searchPlaceholder={t("search")}
						ignore={["ansicht"]}
					/>
				)}
			</div>
			{view !== "eingeladen" && (
				<section className="flex flex-col gap-3">
					<h2 className="sr-only">{t("members")}</h2>
					{shown.length === 0 ? (
						<p className="text-muted-foreground text-subhead">
							{view === "offen" ? t("noneDue") : t("noMatch")}
						</p>
					) : (
						<div className="overflow-hidden rounded-2xl bg-card">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="pl-4">{t("person")}</TableHead>
										<TableHead className="max-sm:hidden">
											{t("inviteRole")}
										</TableHead>
										<TableHead className="max-xl:hidden">
											{t("since")}
										</TableHead>
										<TableHead className="max-md:hidden">
											{t("signIn")}
										</TableHead>
										<TableHead className="max-sm:hidden">{t("open")}</TableHead>
										<TableHead className="max-xl:hidden">
											{t("lastReminded")}
										</TableHead>
										<TableHead className="pr-4 text-right" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{shown.map((m) => {
										const role = m.role;
										const factors = mfaFactors(m);
										return (
											<TableRow key={m.memberId}>
												<TableCell className="max-w-60 pl-4 xl:max-w-72">
													<span className="flex min-w-0 flex-col">
														<span className="font-medium">
															{canManage ? (
																<Link
																	href={`/team/${m.userId}`}
																	className="underline-offset-4 hover:underline"
																>
																	<UserChip
																		name={m.name || m.email}
																		size="md"
																	/>
																</Link>
															) : (
																<UserChip name={m.name || m.email} size="md" />
															)}
															{m.userId === ctx.userId && (
																<span className="ml-2 text-muted-foreground text-footnote">
																	({t("you")})
																</span>
															)}
														</span>
														{m.name && (
															<span className="truncate pl-8.5 text-footnote text-muted-foreground">
																{m.email}
															</span>
														)}
														{/* am Handy: Rolle und offene Punkte unter dem Namen */}
														<span className="mt-1 flex flex-wrap gap-1 pl-8.5 sm:hidden">
															<Badge variant="outline">{roleLabel(role)}</Badge>
															{m.due.overdue > 0 && (
																<Badge variant="destructive">
																	{t("dueOverdue", { n: m.due.overdue })}
																</Badge>
															)}
															{m.due.soon > 0 && (
																<Badge variant="warning">
																	{t("dueSoon", { n: m.due.soon })}
																</Badge>
															)}
														</span>
													</span>
												</TableCell>
												<TableCell className="max-sm:hidden">
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
													{(roleMap.get(m.memberId) ?? []).map((r) => (
														<Badge key={r.id} variant="muted" className="ml-1">
															{r.name}
														</Badge>
													))}
													{customRoles
														.filter((r) => r.proposed.includes(m.userId))
														.map((r) => (
															<Badge
																key={r.id}
																variant="warning"
																className="ml-1"
															>
																{tr("waitingNamed", { name: r.name })}
															</Badge>
														))}
													{m.accessUntil && (
														<span
															className={`ml-2 text-footnote ${m.accessUntil.getTime() < Date.now() ? "text-destructive" : "text-muted-foreground"}`}
														>
															{t("until", { date: fmt.format(m.accessUntil) })}
														</span>
													)}
													{(m.grants?.length ?? 0) > 0 && (
														<span className="ml-2 text-muted-foreground text-footnote">
															· {m.grants?.length} {t("grantsShort")}
														</span>
													)}
												</TableCell>
												<TableCell className="text-footnote text-muted-foreground max-xl:hidden">
													{fmt.format(m.createdAt)}
												</TableCell>
												<TableCell className="max-md:hidden">
													<span className="flex flex-wrap gap-1">
														{factors.length > 0 ? (
															<Badge variant="success">
																{factors.join(" + ")}
															</Badge>
														) : (
															<Badge variant="muted">{t("mfaOpen")}</Badge>
														)}
														{m.sso && <Badge variant="muted">SSO</Badge>}
													</span>
												</TableCell>
												<TableCell className="max-sm:hidden">
													{m.due.level === "none" ? (
														<span className="text-footnote text-muted-foreground">
															{t("dueNone")}
														</span>
													) : (
														<span className="flex flex-wrap gap-1">
															{m.due.overdue > 0 && (
																<Badge variant="destructive">
																	{t("dueOverdue", { n: m.due.overdue })}
																</Badge>
															)}
															{m.due.soon > 0 && (
																<Badge variant="warning">
																	{t("dueSoon", { n: m.due.soon })}
																</Badge>
															)}
														</span>
													)}
												</TableCell>
												<TableCell className="text-footnote text-muted-foreground max-xl:hidden">
													{m.lastReminded ? fmt.format(m.lastReminded) : "–"}
												</TableCell>
												<TableCell className="pr-4 text-right">
													{canManage && (
														<span className="inline-flex items-center gap-1">
															{m.due.level !== "none" &&
																m.userId !== ctx.userId && (
																	<RemindButton
																		userId={m.userId}
																		name={m.name || m.email}
																		disabled={
																			!remindAllowed(m.lastReminded, now)
																		}
																	/>
																)}
															{(isExternal(role) || m.accessUntil) && (
																<MemberAccessForm
																	memberId={m.memberId}
																	accessUntil={m.accessUntil}
																	grants={m.grants ?? []}
																/>
															)}
															{canHoldOwnRole(role) && (
																<MemberRolesForm
																	memberId={m.memberId}
																	name={m.name || m.email}
																	roles={customRoles}
																	current={[
																		...(roleMap.get(m.memberId) ?? []).map(
																			(r) => r.id,
																		),
																		...customRoles
																			.filter((r) =>
																				r.proposed.includes(m.userId),
																			)
																			.map((r) => r.id),
																	]}
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
						</div>
					)}
				</section>
			)}
			{view === "eingeladen" && (
				<section className="flex flex-col gap-3">
					<h2 className="sr-only">{t("pending")}</h2>
					{invitations.length === 0 ? (
						<p className="text-muted-foreground text-subhead">
							{t("noPending")}
						</p>
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
												.filter((r) =>
													r.pending.includes(i.email.toLowerCase()),
												)
												.map((r) => (
													<Badge key={r.id} variant="muted" className="ml-1">
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
			)}
			{canManage && view === "alle" && (
				<section className="mt-8 max-w-xl">
					<AccessReview lastAt={lastReview} />
				</section>
			)}
		</>
	);
}

export default withMessages(TeamPage, [
	"Auth",
	"Common",
	"Entity",
	"Roles",
	"Team",
]);
