import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PriceGroupEditor } from "@/components/admin/price-group-editor";
import { Badge } from "@/components/ui/badge";
import { requirePlatformAdminPage } from "@/lib/auth/gates";
import {
	listPriceGroups,
	listPriceOverrides,
	orgPriceGroupIds,
} from "@/lib/db/pricing";
import { withPlatform } from "@/lib/db/with-org";
import { LEVEL_LABEL } from "@/lib/pricing/presets";
import { cn } from "@/lib/utils";

// Preis-CMS: Preisgruppen (nach Unternehmensgröße) mit Stufe oder eigenen
// Werten. Die Standardgruppe steht öffentlich auf /preise und /leistungen.
export default async function AdminPricesPage({
	searchParams,
}: {
	searchParams: Promise<{ gruppe?: string }>;
}) {
	const admin = await requirePlatformAdminPage();
	const t = await getTranslations("Admin");
	const { gruppe } = await searchParams;
	const groups = await listPriceGroups();
	const assignments = await withPlatform(
		{
			userId: admin.userId,
			reason: "Admin: Preisgruppen-Übersicht",
			ip: admin.ip,
			userAgent: admin.userAgent,
		},
		(tx) => orgPriceGroupIds(tx),
	);
	const defaultId = groups.find((r) => r.group.isDefault)?.group.id ?? null;
	const orgCount = new Map<string, number>();
	for (const g of assignments.values()) {
		const id = g ?? defaultId;
		if (id) orgCount.set(id, (orgCount.get(id) ?? 0) + 1);
	}
	const selected =
		gruppe === "neu"
			? null
			: (groups.find((r) => r.group.id === gruppe) ??
				groups.find((r) => r.group.isDefault) ??
				groups[0] ??
				null);
	const overrides = selected ? await listPriceOverrides(selected.group.id) : [];

	return (
		<>
			<div className="mb-6 flex flex-wrap items-end justify-between gap-4">
				<h1 className="font-bold text-title-1">{t("prices")}</h1>
				<Link
					href="/admin/preise?gruppe=neu"
					scroll={false}
					className="text-subhead underline-offset-4 hover:underline"
				>
					Neue Gruppe
				</Link>
			</div>
			<p className="mb-6 max-w-3xl text-muted-foreground text-subhead">
				{t("pricesLead")}
			</p>
			<div className="grid grid-cols-1 gap-8 xl:grid-cols-[18rem_minmax(0,1fr)]">
				<nav
					aria-label="Preisgruppen"
					className="min-w-0 xl:sticky xl:top-20 xl:self-start"
				>
					{groups.length === 0 ? (
						<p className="text-muted-foreground text-subhead">
							Noch keine Gruppe — öffentlich gilt „Marktüblich“.
						</p>
					) : (
						<ul className="flex flex-col gap-1.5">
							{groups.map(({ group, overrides: n }) => {
								const on = selected?.group.id === group.id;
								const orgs = orgCount.get(group.id) ?? 0;
								return (
									<li key={group.id}>
										<Link
											href={`/admin/preise?gruppe=${group.id}`}
											scroll={false}
											aria-current={on ? "page" : undefined}
											className={cn(
												"flex flex-col gap-0.5 rounded-xl bg-card px-3 py-2.5 text-subhead transition-colors",
												on
													? "border-primary/50 bg-muted/60"
													: "border-border/60 hover:bg-muted/40",
											)}
										>
											<span className="flex min-w-0 items-center gap-2">
												<span className="truncate font-medium">
													{group.name}
												</span>
												{group.isDefault && (
													<Badge variant="secondary">Standard</Badge>
												)}
											</span>
											<span className="text-muted-foreground text-footnote">
												{LEVEL_LABEL[group.level]}
												{n > 0 && ` · ${n} eigene`} ·{" "}
												{orgs === 1
													? "1 Organisation"
													: `${orgs} Organisationen`}
											</span>
										</Link>
									</li>
								);
							})}
						</ul>
					)}
				</nav>
				<section aria-labelledby="pg-editor" className="min-w-0">
					<h2 id="pg-editor" className="mb-4 font-bold text-title-2">
						{selected ? selected.group.name : "Neue Gruppe"}
					</h2>
					<PriceGroupEditor
						key={selected?.group.id ?? "neu"}
						group={selected?.group ?? null}
						overrides={overrides}
					/>
				</section>
			</div>
		</>
	);
}
