import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCmsPageBySlug, saveCmsPage } from "@/app/actions/cms";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { users } from "@/db/schema";

const STARTER_TEMPLATES: Record<string, { title: string; bodyKey: string }> = {
	imprint: { title: "Impressum", bodyKey: "starterImprint" },
	privacy: { title: "Datenschutzerklärung", bodyKey: "starterPrivacy" },
	terms: { title: "Allgemeine Geschäftsbedingungen", bodyKey: "starterTerms" },
};

export default async function CmsEditPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");
	const [user] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (user?.role !== "admin") redirect("/post-login");

	const t = await getTranslations("AdminCms");
	const { slug: rawSlug } = await params;
	const isNew = rawSlug === "new";
	const existing = isNew ? null : await getCmsPageBySlug(rawSlug);
	const starter = isNew ? null : STARTER_TEMPLATES[rawSlug];

	const initialSlug = isNew ? "" : rawSlug;
	const initialTitle = existing?.title ?? starter?.title ?? "";
	const initialBody = existing?.body ?? (starter ? t(starter.bodyKey) : "");

	async function action(fd: FormData) {
		"use server";
		await saveCmsPage(fd);
		redirect("/admin/cms");
	}

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-5">
					<Link
						href="/admin/cms"
						className="text-muted-foreground text-xs hover:text-foreground"
					>
						← {t("title")}
					</Link>
					<h1 className="mt-0.5 font-semibold text-xl tracking-tight sm:text-3xl">
						{existing ? existing.title : isNew ? t("newPage") : initialTitle}
					</h1>
				</header>

				<form action={action} className="space-y-4">
					<label className="block space-y-1.5">
						<span className="font-medium text-sm">{t("slug")}</span>
						<Input
							name="slug"
							defaultValue={initialSlug}
							placeholder="imprint"
							required
							pattern="[a-z0-9-]+"
							readOnly={!isNew}
						/>
						<span className="block text-muted-foreground text-xs">
							{t("slugHint")}
						</span>
					</label>

					<label className="block space-y-1.5">
						<span className="font-medium text-sm">{t("titleField")}</span>
						<Input name="title" defaultValue={initialTitle} required />
					</label>

					<label className="block space-y-1.5">
						<span className="font-medium text-sm">{t("body")}</span>
						<textarea
							name="body"
							defaultValue={initialBody}
							rows={20}
							className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
						/>
						<span className="block text-muted-foreground text-xs">
							{t("bodyHint")}
						</span>
					</label>

					<div className="flex justify-end">
						<Button type="submit">{t("save")}</Button>
					</div>
				</form>
			</main>
			<Footer />
		</>
	);
}
