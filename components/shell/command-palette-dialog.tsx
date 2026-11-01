"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@/components/ui/command";
import { NAV_SECTIONS, type NavGroup } from "@/lib/nav";
import { NavIcon } from "./nav-icon";

// Inhalt der ⌘K-Palette, nachgeladen von command-palette.tsx
export function CommandPaletteDialog({
	groups,
	open,
	onOpenChange,
}: {
	groups: NavGroup[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useTranslations("Nav");
	const router = useRouter();
	const [query, setQuery] = useState("");
	const setOpen = onOpenChange;

	// Einträge der Seitenleiste, dazu die Seiten unter einem geteilten
	// Eintrag (Umschalter) und die Sprungziele (jedes Rahmenwerk)
	const navigable = groups.flatMap((g) => {
		const group = g.labelKey ? t(g.labelKey) : "";
		return g.items
			.filter((i) => !i.phase)
			.flatMap((i) => [
				{
					key: i.key,
					label: i.label ?? (i.labelKey ? t(i.labelKey) : i.key),
					href: i.href,
					icon: i.icon,
					group,
				},
				...(i.sections ? NAV_SECTIONS[i.sections] : [])
					.filter((s) => s.href !== i.href)
					.map((s) => ({
						key: s.key,
						label: t(s.labelKey),
						href: s.href,
						icon: s.icon,
						group,
					})),
				...(i.jumps ?? []).map((j) => ({
					...j,
					icon: i.icon,
					group: i.labelKey ? t(i.labelKey) : group,
				})),
			]);
	});

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("searchHint")}
			description={t("searchHint")}
		>
			<CommandInput
				placeholder={t("searchHint")}
				value={query}
				onValueChange={setQuery}
			/>
			<CommandList>
				<CommandEmpty>Nichts gefunden.</CommandEmpty>
				{query.trim().length >= 2 && (
					<CommandGroup heading={t("searchGroup")}>
						<CommandItem
							value={`suche ${query}`}
							onSelect={() => {
								setOpen(false);
								router.push(`/suche?q=${encodeURIComponent(query.trim())}`);
								setQuery("");
							}}
						>
							<Search className="size-4" />
							<span>{t("searchFor", { q: query.trim() })}</span>
						</CommandItem>
					</CommandGroup>
				)}
				<CommandGroup heading="Navigation">
					{navigable.map((item) => (
						<CommandItem
							key={item.key}
							value={`${item.label} ${item.group}`}
							onSelect={() => {
								setOpen(false);
								router.push(item.href);
							}}
						>
							<NavIcon name={item.icon} className="size-4" />
							<span>{item.label}</span>
							{item.group && <CommandShortcut>{item.group}</CommandShortcut>}
						</CommandItem>
					))}
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
