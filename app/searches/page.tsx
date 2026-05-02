import { Bookmark, Trash2 } from "lucide-react";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import {
	deleteSavedSearch,
	listMySavedSearches,
} from "@/app/actions/saved-searches";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";

export default async function SavedSearchesPage() {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const t = await getTranslations("SavedSearches");
	const fmt = await getFormatter();
	const items = await listMySavedSearches();

	async function remove(formData: FormData) {
		"use server";
		const id = formData.get("id")?.toString();
		if (id) await deleteSavedSearch(id);
	}

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-6">
					<p className="lv-eyebrow text-[0.6rem] text-primary">
						{t("eyebrow")}
					</p>
					<h1 className="mt-2 font-serif-display text-3xl sm:text-4xl">
						{t("title")}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						{t("subtitle")}
					</p>
				</header>

				{items.length === 0 ? (
					<div className="rounded-sm border border-border border-dashed p-10 text-center sm:p-14">
						<Bookmark
							className="mx-auto mb-3 h-5 w-5 text-muted-foreground"
							strokeWidth={1.5}
						/>
						<p className="text-muted-foreground text-sm">{t("empty")}</p>
						<p className="mt-2 text-muted-foreground text-xs">
							{t("emptyHint")}
						</p>
					</div>
				) : (
					<ul className="divide-y divide-border border-border border-t border-b">
						{items.map((s) => (
							<li
								key={s.id}
								className="grid grid-cols-[1fr_auto] items-start gap-3 py-4"
							>
								<div>
									<div className="font-serif-display text-lg">{s.name}</div>
									<div className="mt-1 flex flex-wrap gap-2 text-xs">
										{s.criteria.query && (
											<span className="rounded-sm bg-muted px-2 py-0.5">
												„{s.criteria.query}"
											</span>
										)}
										{s.criteria.skills?.map((sk) => (
											<span
												key={sk}
												className="rounded-sm bg-muted px-2 py-0.5 font-mono"
											>
												{sk}
											</span>
										))}
										{s.criteria.remote && s.criteria.remote !== "any" && (
											<span className="rounded-sm bg-muted px-2 py-0.5">
												{s.criteria.remote === "remote_only"
													? t("remoteOnly")
													: t("noRemote")}
											</span>
										)}
										{s.criteria.minSalary && (
											<span className="rounded-sm bg-muted px-2 py-0.5">
												≥{" "}
												{fmt.number(s.criteria.minSalary, {
													style: "currency",
													currency: "EUR",
													maximumFractionDigits: 0,
												})}
											</span>
										)}
										{s.criteria.location && (
											<span className="rounded-sm bg-muted px-2 py-0.5">
												{s.criteria.location}
											</span>
										)}
									</div>
									<p className="mt-2 font-mono text-[10px] text-muted-foreground">
										{t("createdAt", {
											date: fmt.dateTime(s.createdAt, { dateStyle: "medium" }),
										})}
										{s.lastNotifiedAt &&
											` · ${t("lastHit", {
												date: fmt.dateTime(s.lastNotifiedAt, {
													dateStyle: "short",
												}),
											})}`}
									</p>
								</div>
								<form action={remove}>
									<input type="hidden" name="id" value={s.id} />
									<Button
										type="submit"
										variant="ghost"
										size="icon"
										aria-label={t("delete")}
									>
										<Trash2 className="h-4 w-4" strokeWidth={1.5} />
									</Button>
								</form>
							</li>
						))}
					</ul>
				)}
			</main>
			<Footer />
		</>
	);
}
