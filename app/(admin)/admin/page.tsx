import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePlatformAdminPage } from "@/lib/auth/gates";
import { platformCounts } from "@/lib/db/global";

export default async function AdminHome() {
	await requirePlatformAdminPage();
	const t = await getTranslations("Admin");
	const counts = await platformCounts();
	const tiles = [
		{ href: "/admin/orgs", label: t("orgs"), value: counts.organizations },
		{ href: "/admin/users", label: t("users"), value: counts.users },
		{ href: "/admin/audit", label: t("audit"), value: "→" },
		{ href: "/admin/cms", label: t("cms"), value: "→" },
	];
	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{tiles.map((tile) => (
				<Link key={tile.href} href={tile.href}>
					<Card className="h-full transition-colors hover:bg-muted/40">
						<CardHeader>
							<CardTitle className="text-base">{tile.label}</CardTitle>
						</CardHeader>
						<CardContent className="font-serif-display text-3xl text-primary">
							{tile.value}
						</CardContent>
					</Card>
				</Link>
			))}
		</div>
	);
}
