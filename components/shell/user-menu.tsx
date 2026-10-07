"use client";

import { LogOut, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth/client";

export function initialsOf(
	name: string | null | undefined,
	email: string,
): string {
	const base = (name ?? email).trim();
	const parts = base.split(/\s+|@/).filter(Boolean);
	return parts
		.slice(0, 2)
		.map((p) => p[0]?.toUpperCase() ?? "")
		.join("");
}

export function UserMenu({
	name,
	email,
	roleLabel,
	isPlatformAdmin,
}: {
	name: string | null;
	email: string;
	roleLabel: string;
	isPlatformAdmin: boolean;
}) {
	const t = useTranslations("Common");
	const tNav = useTranslations("Nav");
	const router = useRouter();

	async function signOut() {
		await authClient.signOut();
		router.replace("/login");
		router.refresh();
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={name ?? email}
				className="flex h-9 items-center gap-2 rounded-sm px-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<Avatar className="size-7">
					<AvatarFallback>{initialsOf(name, email) || "?"}</AvatarFallback>
				</Avatar>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuLabel className="normal-case tracking-normal">
					<p className="truncate font-medium text-foreground text-sm">
						{name ?? email}
					</p>
					<p className="truncate text-muted-foreground text-xs">{email}</p>
					<p className="lv-eyebrow mt-1.5 text-[0.56rem] text-muted-foreground">
						{roleLabel}
					</p>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link href="/einstellungen">
						<Settings /> {tNav("settings")}
					</Link>
				</DropdownMenuItem>
				{isPlatformAdmin && (
					<DropdownMenuItem asChild>
						<Link href="/admin">
							<ShieldCheck /> {tNav("admin")}
						</Link>
					</DropdownMenuItem>
				)}
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={() => void signOut()}>
					<LogOut /> {t("logout")}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
