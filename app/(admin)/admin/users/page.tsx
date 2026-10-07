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
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { listUsers } from "@/lib/db/global";

export default async function AdminUsersPage() {
	const admin = await requirePlatformAdmin();
	const t = await getTranslations("Admin");
	const users = await listUsers();
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
						<TableHead>Rolle</TableHead>
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
									<Badge>Admin</Badge>
								) : (
									<Badge variant="outline">User</Badge>
								)}
							</TableCell>
							<TableCell>
								{u.twoFactorEnabled ? (
									<Badge variant="success">aktiv</Badge>
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
