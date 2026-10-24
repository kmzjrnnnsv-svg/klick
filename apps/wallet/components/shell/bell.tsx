"use client";

import { markNotificationsRead } from "@wallet/app/actions/members";
import { Bell as BellIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

export type BellItem = {
	id: string;
	title: string;
	body: string | null;
	link: string | null;
	read: boolean;
	at: string;
};

export function Bell({ items, unread }: { items: BellItem[]; unread: number }) {
	const t = useTranslations("Shell");
	const router = useRouter();
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "short",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	});
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					aria-label={`${t("notifications")}: ${t("unread", { count: unread })}`}
					className="relative"
				>
					<BellIcon aria-hidden />
					{unread > 0 && (
						<span
							className="absolute top-1 right-1 size-2 rounded-full bg-destructive"
							aria-hidden
						/>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 p-0">
				<div className="flex items-center justify-between border-b p-3">
					<p className="font-medium text-sm">{t("notifications")}</p>
					{unread > 0 && (
						<Button
							variant="link"
							size="sm"
							onClick={async () => {
								await markNotificationsRead();
								router.refresh();
							}}
						>
							{t("markRead")}
						</Button>
					)}
				</div>
				{items.length === 0 ? (
					<p className="p-4 text-muted-foreground text-sm">
						{t("noNotifications")}
					</p>
				) : (
					<ul className="max-h-96 divide-y overflow-y-auto overscroll-contain">
						{items.map((n) => (
							<li key={n.id} className={n.read ? "opacity-70" : undefined}>
								<Link
									href={n.link ?? "/"}
									className="block p-3 hover:bg-muted focus-visible:bg-muted"
								>
									<p className="font-medium text-sm">{n.title}</p>
									{n.body && (
										<p className="line-clamp-2 text-muted-foreground text-xs">
											{n.body}
										</p>
									)}
									<p className="mt-1 text-muted-foreground text-xs tabular-nums">
										{fmt.format(new Date(n.at))}
									</p>
								</Link>
							</li>
						))}
					</ul>
				)}
			</PopoverContent>
		</Popover>
	);
}
