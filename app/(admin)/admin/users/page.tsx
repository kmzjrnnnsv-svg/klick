import { getTranslations } from "next-intl/server";
import { CreateAccountDialog } from "@/components/admin/account-dialogs";
import { UserActions } from "@/components/admin/user-actions";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
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

export default async function AdminUsersPage() {
	const admin = await requirePlatformAdminPage();
	const t = await getTranslations("Admin");
	const ta = await getTranslations("AdminAccounts");
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
	return (
		<>
			<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<h1 className="font-serif-display text-3xl text-primary">
					{t("users")}
				</h1>
				<CreateAccountDialog
					orgs={orgs.map((o) => ({ id: o.id, name: o.name }))}
					days={ACTIVATION_DAYS}
				/>
			</div>
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
					{users.map((u) => {
						const linkUntil = pending.get(u.id) ?? null;
						const status = accountStatus(
							{ ...u, pendingActivation: linkUntil !== null },
							now,
						);
						return (
							<TableRow key={u.id}>
								<TableCell className="font-medium">{u.name}</TableCell>
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
										<span className="text-muted-foreground text-xs">—</span>
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
										<Badge variant="success">{mfaFactors(u).join(" + ")}</Badge>
									) : (
										<Badge variant="muted">offen</Badge>
									)}
								</TableCell>
								<TableCell>
									{status === "blocked" ? (
										<span className="flex flex-col items-start gap-0.5">
											<Badge
												variant="destructive"
												title={u.banReason ?? undefined}
											>
												{ta("statusBlocked")}
											</Badge>
											{u.banExpires && (
												<span className="text-muted-foreground text-xs">
													{ta("statusBlockedUntil", {
														date: fmt.format(u.banExpires),
													})}
												</span>
											)}
										</span>
									) : status === "pending" && linkUntil ? (
										<span className="flex flex-col items-start gap-0.5">
											<Badge variant="warning">{ta("statusPending")}</Badge>
											<span className="text-muted-foreground text-xs">
												{linkUntil < now
													? ta("statusPendingExpired")
													: ta("statusPendingUntil", {
															date: fmt.format(linkUntil),
														})}
											</span>
										</span>
									) : (
										<span className="text-muted-foreground text-xs">
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
		</>
	);
}
