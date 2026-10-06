"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@/components/ui/command";
import type { NavGroup } from "@/lib/nav";
import { NavIcon } from "./nav-icon";

// ⌘K: Navigation (P0), Volltext + „Neu: …" + Entitäts-Aktionen folgen P1/P4.
export function CommandPalette({ groups }: { groups: NavGroup[] }) {
	const t = useTranslations("Nav");
	const router = useRouter();
	const [open, setOpen] = useState(false);

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setOpen((v) => !v);
			}
		}
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, []);

	const navigable = groups.flatMap((g) =>
		g.items
			.filter((i) => !i.phase)
			.map((i) => ({ ...i, group: g.labelKey ? t(g.labelKey) : "" })),
	);

	return (
		<>
			<Button
				variant="outline"
				size="sm"
				onClick={() => setOpen(true)}
				className="hidden normal-case tracking-normal text-muted-foreground md:inline-flex"
				aria-label={t("searchHint")}
			>
				<Search />
				<span className="text-xs">{t("searchHint")}</span>
			</Button>
			<Button
				variant="ghost"
				size="icon"
				onClick={() => setOpen(true)}
				className="md:hidden"
				aria-label={t("searchHint")}
			>
				<Search />
			</Button>
			<CommandDialog
				open={open}
				onOpenChange={setOpen}
				title={t("searchHint")}
				description={t("searchHint")}
			>
				<CommandInput placeholder={t("searchHint")} />
				<CommandList>
					<CommandEmpty>Nichts gefunden.</CommandEmpty>
					<CommandGroup heading="Navigation">
						{navigable.map((item) => (
							<CommandItem
								key={item.key}
								value={`${item.label ?? (item.labelKey ? t(item.labelKey) : item.key)} ${item.group}`}
								onSelect={() => {
									setOpen(false);
									router.push(item.href);
								}}
							>
								<NavIcon name={item.icon} className="size-4" />
								<span>
									{item.label ?? (item.labelKey ? t(item.labelKey) : item.key)}
								</span>
								{item.group && <CommandShortcut>{item.group}</CommandShortcut>}
							</CommandItem>
						))}
					</CommandGroup>
				</CommandList>
			</CommandDialog>
		</>
	);
}
