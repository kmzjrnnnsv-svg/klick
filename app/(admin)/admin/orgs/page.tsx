import { getTranslations } from "next-intl/server";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { listOrganizationsWithCounts } from "@/lib/db/global";

export default async function AdminOrgsPage() {
	await requirePlatformAdmin();
	const t = await getTranslations("Admin");
	const orgs = await listOrganizationsWithCounts();
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeZone: "Europe/Berlin",
	});
	return (
		<>
			<h1 className="mb-6 font-serif-display text-3xl text-primary">
				{t("orgs")}
			</h1>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Slug</TableHead>
						<TableHead>Mitglieder</TableHead>
						<TableHead>Angelegt</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{orgs.map((o) => (
						<TableRow key={o.id}>
							<TableCell className="font-medium">{o.name}</TableCell>
							<TableCell className="font-mono text-xs">{o.slug}</TableCell>
							<TableCell>{Number(o.members)}</TableCell>
							<TableCell className="text-muted-foreground">
								{fmt.format(o.createdAt)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</>
	);
}
