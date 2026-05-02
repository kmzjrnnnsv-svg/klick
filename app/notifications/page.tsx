import { Bell } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { listMyNotifications, markAllRead } from "@/app/actions/notifications";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";

export default async function NotificationsPage() {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const t = await getTranslations("Notifications");
	const fmt = await getFormatter();
	const items = await listMyNotifications({ limit: 50 });

	async function markAll() {
		"use server";
		await markAllRead();
	}

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-6 flex items-end justify-between gap-3">
					<div>
						<p className="lv-eyebrow text-[0.6rem] text-primary">
							{t("eyebrow")}
						</p>
						<h1 className="mt-2 font-serif-display text-3xl sm:text-4xl">
							{t("title")}
						</h1>
					</div>
					{items.some((n) => !n.readAt) && (
						<form action={markAll}>
							<Button type="submit" variant="ghost" size="sm">
								{t("markAllRead")}
							</Button>
						</form>
					)}
				</header>
				{items.length === 0 ? (
					<div className="rounded-sm border border-border border-dashed p-10 text-center sm:p-14">
						<Bell
							className="mx-auto mb-3 h-5 w-5 text-muted-foreground"
							strokeWidth={1.5}
						/>
						<p className="text-muted-foreground text-sm">{t("empty")}</p>
					</div>
				) : (
					<ul className="divide-y divide-border border-border border-t border-b">
						{items.map((n) => {
							const inner = (
								<div className="grid grid-cols-[auto_1fr_auto] items-start gap-4">
									<span
										className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${
											n.readAt ? "bg-border" : "bg-primary"
										}`}
									/>
									<div className="min-w-0">
										<div className="font-medium text-sm">{n.title}</div>
										{n.body && (
											<div className="mt-0.5 text-muted-foreground text-xs leading-snug">
												{n.body}
											</div>
										)}
									</div>
									<span className="font-mono text-[10px] text-muted-foreground tabular-nums">
										{fmt.dateTime(n.createdAt, { dateStyle: "short" })}
									</span>
								</div>
							);
							return (
								<li key={n.id}>
									{n.link ? (
										<Link
											href={n.link}
											className="block px-2 py-4 transition-colors hover:bg-muted/40"
										>
											{inner}
										</Link>
									) : (
										<div className="px-2 py-4">{inner}</div>
									)}
								</li>
							);
						})}
					</ul>
				)}
			</main>
			<Footer />
		</>
	);
}
