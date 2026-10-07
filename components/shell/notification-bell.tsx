"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { markAllNotificationsRead } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type BellItem = {
	id: string;
	title: string;
	body: string | null;
	link: string | null;
	readAt: Date | null;
	createdAt: Date;
};

export function NotificationBell({
	items,
	unread,
}: {
	items: BellItem[];
	unread: number;
}) {
	const t = useTranslations("Nav");
	const [pending, start] = useTransition();
	const fmt = new Intl.DateTimeFormat("de-DE", {
		day: "2-digit",
		month: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "Europe/Berlin",
	});

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={t("notifications")}
					className="relative"
				>
					<Bell />
					{unread > 0 && (
						<span className="-top-0.5 -right-0.5 absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-medium text-[0.55rem] text-primary-foreground">
							{unread > 9 ? "9+" : unread}
						</span>
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-80">
				<DropdownMenuLabel className="flex items-center justify-between">
					<span>{t("notifications")}</span>
					{unread > 0 && (
						<button
							type="button"
							disabled={pending}
							onClick={() => start(() => markAllNotificationsRead())}
							className="normal-case tracking-normal text-primary text-xs hover:underline"
						>
							alle gelesen
						</button>
					)}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{items.length === 0 ? (
					<p className="px-2 py-6 text-center text-muted-foreground text-sm">
						Keine Benachrichtigungen.
					</p>
				) : (
					<ul className="max-h-80 overflow-y-auto">
						{items.map((n) => {
							const content = (
								<div
									className={cn(
										"flex flex-col gap-0.5 px-2 py-2",
										!n.readAt && "bg-primary/5",
									)}
								>
									<p className="text-sm leading-snug">{n.title}</p>
									{n.body && (
										<p className="line-clamp-2 text-muted-foreground text-xs">
											{n.body}
										</p>
									)}
									<p className="text-[0.62rem] text-muted-foreground">
										{fmt.format(n.createdAt)}
									</p>
								</div>
							);
							return (
								<li
									key={n.id}
									className="border-border/50 border-b last:border-0"
								>
									{n.link ? (
										<Link href={n.link} className="block hover:bg-muted">
											{content}
										</Link>
									) : (
										content
									)}
								</li>
							);
						})}
					</ul>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
