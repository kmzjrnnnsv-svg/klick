import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CmsEditor } from "@/components/admin/cms-editor";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { requirePlatformAdminPage } from "@/lib/auth/gates";
import { getCmsPageBySlug, listCmsPages } from "@/lib/db/global";

export default async function AdminCmsPage({
	searchParams,
}: {
	searchParams: Promise<{ slug?: string }>;
}) {
	await requirePlatformAdminPage();
	const t = await getTranslations("Admin");
	const { slug } = await searchParams;
	const pages = await listCmsPages();
	const editing = slug ? await getCmsPageBySlug(slug) : null;
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	});
	return (
		<>
			<h1 className="mb-6 font-serif-display text-3xl text-primary">
				{t("cms")}
			</h1>
			<div className="grid gap-8 lg:grid-cols-[1fr_2fr]">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("cmsSlug")}</TableHead>
							<TableHead>{t("cmsTitle")}</TableHead>
							<TableHead>Aktualisiert</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{pages.map((p) => (
							<TableRow key={p.id}>
								<TableCell className="font-mono text-xs">
									<Link
										href={`/admin/cms?slug=${p.slug}`}
										className="hover:underline"
									>
										{p.slug}
									</Link>
								</TableCell>
								<TableCell>{p.title}</TableCell>
								<TableCell className="text-muted-foreground text-xs">
									{fmt.format(p.updatedAt)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
				<CmsEditor
					key={editing?.slug ?? "new"}
					initial={
						editing
							? { slug: editing.slug, title: editing.title, body: editing.body }
							: undefined
					}
				/>
			</div>
		</>
	);
}
