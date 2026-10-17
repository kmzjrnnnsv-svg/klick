import { getTranslations } from "next-intl/server";
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
import { requirePlatformAdminPage } from "@/lib/auth/gates";
import { isExternal, roleLabel } from "@/lib/auth/memberships";
import { mfaFactors, normalizeRole } from "@/lib/auth/session-rules";
import { listUserMemberships, listUsers } from "@/lib/db/global";

export default async function AdminUsersPage() {
	const admin = await requirePlatformAdminPage();
	const t = await getTranslations("Admin");
	const [users, memberships] = await Promise.all([
		listUsers(),
		listUserMemberships(),
	]);
	const orgsByUser = new Map<string, typeof memberships>();
	for (const m of memberships)
		orgsByUser.set(m.userId, [...(orgsByUser.get(m.userId) ?? []), m]);
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeZone: "Europe/Berlin",
	});
	return (
		<>
			<h1 className="mb-6 font-serif-display text-3xl text-primary">
				{t("users")}
			</h1>
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
					{users.map((u) => (
						<TableRow key={u.id}>
							<TableCell className="font-medium">{u.name}</TableCell>
							<TableCell className="text-muted-foreground">{u.email}</TableCell>
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
								{u.banned ? (
									<Badge variant="destructive">gesperrt</Badge>
								) : (
									<span className="text-muted-foreground text-xs">aktiv</span>
								)}
							</TableCell>
							<TableCell className="text-muted-foreground">
								{fmt.format(u.createdAt)}
							</TableCell>
							<TableCell className="text-right">
								<UserActions
									userId={u.id}
									name={u.name || u.email}
									banned={Boolean(u.banned)}
									isAdmin={u.role === "admin"}
									isSelf={u.id === admin.userId}
								/>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</>
	);
}
