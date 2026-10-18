import { getTranslations } from "next-intl/server";
import { OrgPriceGroupSelect } from "@/components/admin/org-price-group-select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { requirePlatformAdminPage } from "@/lib/auth/gates";
import { listOrganizationsWithCounts } from "@/lib/db/global";
import { orgProfilesForAdmin } from "@/lib/db/org-profiles";
import { listPriceGroups, orgPriceGroupIds } from "@/lib/db/pricing";
import { withPlatform } from "@/lib/db/with-org";

export default async function AdminOrgsPage() {
	const admin = await requirePlatformAdminPage();
	const t = await getTranslations("Admin");
	const ts = await getTranslations("Setup");
	const [orgs, groups, assignments, profiles] = await Promise.all([
		listOrganizationsWithCounts(),
		listPriceGroups(),
		withPlatform(
			{
				userId: admin.userId,
				reason: "Admin: Organisationen mit Preisgruppen",
				ip: admin.ip,
				userAgent: admin.userAgent,
			},
			(tx) => orgPriceGroupIds(tx),
		),
		withPlatform(
			{
				userId: admin.userId,
				reason: "Admin: Organisationen mit Profil aus der Einrichtung",
				ip: admin.ip,
				userAgent: admin.userAgent,
			},
			(tx) => orgProfilesForAdmin(tx),
		),
	]);
	// Vorschlag aus der Größe → Preisgruppe gleichen Namens (geseedet)
	const SUGGESTED_GROUP: Record<string, string> = {
		small: "Kleine Unternehmen",
		standard: "Standard",
		large: "Große Unternehmen",
	};
	const defaultGroup = groups.find((r) => r.group.isDefault)?.group ?? null;
	const options = groups.map((r) => ({ id: r.group.id, name: r.group.name }));
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
						<TableHead>{t("orgProfile")}</TableHead>
						<TableHead>{t("priceGroup")}</TableHead>
						<TableHead>Angelegt</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{orgs.map((o) => {
						const assigned = assignments.has(o.id);
						const groupId = assignments.get(o.id) ?? null;
						const profile = profiles.get(o.id);
						const suggested = profile?.classification.priceGroup
							? SUGGESTED_GROUP[profile.classification.priceGroup]
							: undefined;
						const current =
							options.find((g) => g.id === groupId)?.name ?? defaultGroup?.name;
						return (
							<TableRow key={o.id}>
								<TableCell className="font-medium">{o.name}</TableCell>
								<TableCell className="whitespace-nowrap font-mono text-xs">
									{o.slug}
								</TableCell>
								<TableCell>{Number(o.members)}</TableCell>
								<TableCell className="text-xs">
									{profile ? (
										<>
											<span>
												{profile.classification.size
													? ts(`size_${profile.classification.size}`)
													: ts("sizeUnknown")}
												{profile.employees != null
													? ` · ${profile.employees} MA`
													: ""}
											</span>
											<span className="block text-muted-foreground">
												{ts(`nis2_${profile.classification.nis2}`)} ·{" "}
												{t("orgSites", { n: profile.sites })}
											</span>
										</>
									) : (
										"—"
									)}
								</TableCell>
								<TableCell>
									{assigned ? (
										<>
											<OrgPriceGroupSelect
												orgId={o.id}
												orgName={o.name}
												value={groupId}
												groups={options}
												defaultName={defaultGroup?.name ?? null}
											/>
											{suggested && suggested !== current && (
												<span className="mt-1 block text-muted-foreground text-xs">
													{t("priceGroupSuggested", { name: suggested })}
												</span>
											)}
										</>
									) : (
										<span className="text-muted-foreground text-xs">
											Onboarding offen
										</span>
									)}
								</TableCell>
								<TableCell className="text-muted-foreground">
									{fmt.format(o.createdAt)}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</>
	);
}
