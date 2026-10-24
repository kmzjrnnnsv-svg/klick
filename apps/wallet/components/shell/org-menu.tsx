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

export function OrgMenu({
	current,
	orgs,
}: {
	current: { id: string; name: string };
	orgs: { id: string; name: string }[];
}) {
	const t = useTranslations("Shell");
	const router = useRouter();
	if (orgs.length < 2)
		return (
			<span className="block truncate font-medium text-subhead">
				{current.name}
			</span>
		);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger className="flex min-w-0 max-w-full items-center gap-1 rounded-md px-2 py-1 font-medium text-subhead hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary">
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
