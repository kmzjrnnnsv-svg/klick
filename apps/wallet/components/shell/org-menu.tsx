"use client";

import { switchOrg } from "@wallet/app/actions/auth";
import { ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// sidebar: in der Seitenleiste klein und grau wie in Klick (Name der Org
// über dem Menü), sonst im Kopf
export function OrgMenu({
	current,
	orgs,
	sidebar = false,
}: {
	current: { id: string; name: string };
	orgs: { id: string; name: string }[];
	sidebar?: boolean;
}) {
	const t = useTranslations("Shell");
	const router = useRouter();
	const text = sidebar
		? "font-medium text-footnote text-muted-foreground"
		: "font-medium text-subhead";
	if (orgs.length < 2)
		return <span className={cn("block truncate", text)}>{current.name}</span>;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className={cn(
					"flex min-w-0 max-w-full items-center gap-1 rounded-md px-2 py-1 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary",
					text,
					sidebar && "-mx-2",
				)}
			>
				<span className="truncate">{current.name}</span>
				<ChevronsUpDown className="size-3.5 shrink-0" aria-hidden />
				<span className="sr-only">{t("orgSwitch")}</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				<DropdownMenuLabel>{t("orgSwitch")}</DropdownMenuLabel>
				{orgs.map((o) => (
					<DropdownMenuItem
						key={o.id}
						disabled={o.id === current.id}
						onSelect={async () => {
							const res = await switchOrg(o.id);
							if (res.ok) {
								router.push("/unlock");
								router.refresh();
							}
						}}
					>
						{o.name}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
