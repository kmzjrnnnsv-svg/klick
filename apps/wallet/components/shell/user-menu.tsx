"use client";

import { authClient } from "@wallet/lib/auth/client";
import { CircleUser } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({
	name,
	email,
	role,
}: {
	name: string;
	email: string;
	role: string;
}) {
	const t = useTranslations("Shell");
	const ta = useTranslations("Auth");
	const router = useRouter();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={t("account")}
				className="flex size-(--control-h) items-center justify-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
			>
				<CircleUser className="size-5" aria-hidden />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-56">
				<DropdownMenuLabel className="">
					<span className="block truncate font-medium">{name}</span>
					<span className="block truncate font-normal text-muted-foreground text-footnote">
						{email}
					</span>
					<span className="block font-normal text-muted-foreground text-footnote">
						{role}
					</span>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={async () => {
						await authClient.signOut().catch(() => {});
						router.replace("/login");
						router.refresh();
					}}
				>
					{ta("signOut")}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
