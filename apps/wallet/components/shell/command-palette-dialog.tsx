"use client";

import type { WalletNavGroup } from "@wallet/lib/nav";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@/components/ui/command";
import { NavIcon } from "./nav-icon";

// Inhalt der ⌘K-Palette, nachgeladen von command-palette.tsx: alle Seiten
// der Seitenleiste und die Einstellungen
export function PaletteDialog({
	groups,
	open,
	onOpenChange,
}: {
	groups: WalletNavGroup[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useTranslations("Shell");
	const router = useRouter();
	const items = [
		...groups.flatMap((g) =>
			g.items.map((i) => ({
				key: i.key,
				label: t(i.labelKey),
				href: i.href,
				icon: i.icon,
				group: g.labelKey ? t(g.labelKey) : "",
			})),
		),
		{
			key: "settings",
			label: t("settings"),
			href: "/settings",
			icon: "settings" as const,
			group: "",
		},
	];
	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title={t("searchHint")}
			description={t("searchHint")}
		>
			<CommandInput placeholder={t("searchHint")} />
			<CommandList>
				<CommandEmpty>{t("searchEmpty")}</CommandEmpty>
				<CommandGroup heading={t("nav")}>
					{items.map((item) => (
						<CommandItem
							key={item.key}
							value={`${item.label} ${item.group}`}
							onSelect={() => {
								onOpenChange(false);
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
