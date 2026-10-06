"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteCmsPage, saveCmsPage } from "@/app/actions/cms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function CmsEditor({
	initial,
}: {
	initial?: { slug: string; title: string; body: string };
}) {
	const t = useTranslations("Admin");
	const router = useRouter();
	const [slug, setSlug] = useState(initial?.slug ?? "");
	const [title, setTitle] = useState(initial?.title ?? "");
	const [body, setBody] = useState(initial?.body ?? "");
	const [pending, start] = useTransition();

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					const res = await saveCmsPage({ slug, title, body });
					if (!res.ok) {
						toast.error(res.error);
						return;
					}
					toast.success("Gespeichert");
					router.push("/admin/cms");
					router.refresh();
				});
			}}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="grid gap-2">
					<Label htmlFor="slug">{t("cmsSlug")}</Label>
					<Input
						id="slug"
						value={slug}
						onChange={(e) => setSlug(e.target.value)}
						className="font-mono"
						disabled={Boolean(initial)}
						required
					/>
				</div>
				<div className="grid gap-2">
					<Label htmlFor="title">{t("cmsTitle")}</Label>
					<Input
						id="title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						required
					/>
				</div>
			</div>
			<div className="grid gap-2">
				<Label htmlFor="body">{t("cmsBody")}</Label>
				<Textarea
					id="body"
					value={body}
					onChange={(e) => setBody(e.target.value)}
					className="min-h-96 font-mono text-xs"
				/>
			</div>
			<div className="flex gap-2">
				<Button type="submit" variant="brown" disabled={pending}>
					{t("cmsSave")}
				</Button>
				{initial && (
					<Button
						type="button"
						variant="destructive"
						disabled={pending}
						onClick={() =>
							start(async () => {
								const res = await deleteCmsPage(initial.slug);
								if (!res.ok) toast.error(res.error);
								else {
									router.push("/admin/cms");
									router.refresh();
								}
							})
						}
					>
						Löschen
					</Button>
				)}
			</div>
		</form>
	);
}
