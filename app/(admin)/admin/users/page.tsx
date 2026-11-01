import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CreateAccountDialog } from "@/components/admin/account-dialogs";
import { UserActions } from "@/components/admin/user-actions";
import { withMessages } from "@/components/i18n/with-messages";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	parseUserFilter,
	USER_STATUS_FILTERS,
	userFilterHref,
	userMatches,
} from "@/lib/admin/users";
import { accountStatus } from "@/lib/auth/account-status";
import { ACTIVATION_DAYS } from "@/lib/auth/admin-accounts";
import { requirePlatformAdminPage } from "@/lib/auth/gates";
import { isExternal, roleLabel } from "@/lib/auth/memberships";
import { pendingActivations } from "@/lib/auth/registration-link";
import { mfaFactors, normalizeRole } from "@/lib/auth/session-rules";
import {
	listOrganizationsWithCounts,
	listUserMemberships,
	listUsers,
} from "@/lib/db/global";

// Admin > Nutzer:innen (Admin-Portal, Teil 3): Liste mit Suche und Filter
// über die URL; Faktoren, Sitzungen und Anmeldungen auf der Detailseite.
async function AdminUsersPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; status?: string }>;
}) {
	const admin = await requirePlatformAdminPage();
	const t = await getTranslations("Admin");
	const ta = await getTranslations("AdminAccounts");
	const tu = await getTranslations("AdminUsers");
	const sp = await searchParams;
	const filter = parseUserFilter(sp);
	const [users, memberships, orgs] = await Promise.all([
		listUsers(),
		listUserMemberships(),
		listOrganizationsWithCounts(),
	]);
	const pending = await pendingActivations(users.map((u) => u.id));
	const now = new Date();
	const orgsByUser = new Map<string, typeof memberships>();
	for (const m of memberships)
		orgsByUser.set(m.userId, [...(orgsByUser.get(m.userId) ?? []), m]);
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeZone: "Europe/Berlin",
	});
	const rows = users
		.map((u) => {
			const linkUntil = pending.get(u.id) ?? null;
			const status = accountStatus(
				{ ...u, pendingActivation: linkUntil !== null },
				now,
			);
			return { u, linkUntil, status, orgs: orgsByUser.get(u.id) ?? [] };
		})
		.filter((r) =>
			userMatches(
				{
					name: r.u.name,
					email: r.u.email,
					role: r.u.role,
					status: r.status,
					factors: mfaFactors(r.u).length,
					orgNames: r.orgs.map((m) => m.orgName),
				},
				filter,
			),
		);
	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title={t("users")}
				lead={tu("listLead")}
				actions={
					<CreateAccountDialog
						orgs={orgs.map((o) => ({ id: o.id, name: o.name }))}
						days={ACTIVATION_DAYS}
					/>
				}
			/>
			<form className="flex max-w-md gap-2">
				<label htmlFor="user-q" className="sr-only">
					{tu("search")}
				</label>
				<Input
					id="user-q"
					name="q"
					type="search"
					defaultValue={sp.q ?? ""}
					placeholder={tu("searchPlaceholder")}
					autoComplete="off"
					spellCheck={false}
				/>
				{filter.status !== "all" && (
					<input type="hidden" name="status" value={filter.status} />
				)}
			</form>
			<nav aria-label={tu("filter")} className="flex flex-wrap gap-2">
				{USER_STATUS_FILTERS.map((f) => (
					<Link
						key={f}
						href={userFilterHref({ q: filter.q, status: f })}
						aria-current={filter.status === f ? "page" : undefined}
						className={`inline-flex h-(--control-h-sm) items-center rounded-full px-3 text-subhead transition-colors ${
							filter.status === f
								? "bg-foreground text-background"
								: "bg-muted text-foreground hover:bg-muted/70"
						}`}
					>
						{tu(`filter_${f}`)}
					</Link>
				))}
			</nav>
			{rows.length < users.length && (
				<p className="text-footnote text-muted-foreground tabular-nums">
					{tu("countShown", { n: rows.length, total: users.length })}
				</p>
			)}
			{rows.length === 0 ? (
				<p className="text-muted-foreground">{tu("listEmpty")}</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>E-Mail</TableHead>
							<TableHead>Konto</TableHead>
							<TableHead>Unternehmen</TableHead>
							<TableHead>MFA</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Angelegt</TableHead>
							<TableHead className="text-right" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map(({ u, linkUntil, status }) => {
							return (
								<TableRow key={u.id}>
									<TableCell>
										<Link
											href={`/admin/users/${u.id}`}
											className="font-medium hover:underline"
										>
											{u.name || u.email}
										</Link>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{u.email}
									</TableCell>
									<TableCell>
										{u.role === "admin" ? (
											<Badge>Klick-Admin</Badge>
										) : (orgsByUser.get(u.id) ?? []).length > 0 ? (
											<Badge variant="outline">Kunde</Badge>
										) : (
											<Badge variant="muted">ohne Organisation</Badge>
										)}
									</TableCell>
									<TableCell>
										{(orgsByUser.get(u.id) ?? []).length === 0 ? (
											<span className="text-muted-foreground text-footnote">
												—
											</span>
										) : (
											<ul className="flex flex-col gap-1">
												{(orgsByUser.get(u.id) ?? []).map((m) => (
													<li
														key={m.orgId}
														className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
													>
														<span>{m.orgName}</span>
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
													</li>
												))}
											</ul>
										)}
									</TableCell>
									<TableCell>
										{mfaFactors(u).length > 0 ? (
											<Badge variant="success">
												{mfaFactors(u).join(" + ")}
											</Badge>
										) : (
											<Badge variant="muted">offen</Badge>
										)}
									</TableCell>
									<TableCell>
										{status === "blocked" ? (
											<span className="flex flex-col items-start gap-0.5">
												<Badge variant="destructive">
													{ta("statusBlocked")}
												</Badge>
												{u.banReason && (
													<span className="max-w-48 break-words text-muted-foreground text-footnote">
														{ta("statusBlockedReason", { reason: u.banReason })}
													</span>
												)}
												{u.banExpires && (
													<span className="text-muted-foreground text-footnote">
														{ta("statusBlockedUntil", {
															date: fmt.format(u.banExpires),
														})}
													</span>
												)}
											</span>
										) : status === "pending" && linkUntil ? (
											<span className="flex flex-col items-start gap-0.5">
												<Badge variant="warning">{ta("statusPending")}</Badge>
												<span className="text-muted-foreground text-footnote">
													{linkUntil < now
														? ta("statusPendingExpired")
														: ta("statusPendingUntil", {
																date: fmt.format(linkUntil),
															})}
												</span>
											</span>
										) : (
											<span className="text-muted-foreground text-footnote">
												{ta("statusActive")}
											</span>
										)}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{fmt.format(u.createdAt)}
									</TableCell>
									<TableCell className="text-right">
										<UserActions
											userId={u.id}
											name={u.name || u.email}
											email={u.email}
											status={status}
											isAdmin={u.role === "admin"}
											isSelf={u.id === admin.userId}
											activationDays={ACTIVATION_DAYS}
										/>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			)}
		</div>
	);
}

export default withMessages(AdminUsersPage, [
	"Admin",
	"AdminAccounts",
	"Auth",
	"Common",
	"Roles",
	"Team",
]);
