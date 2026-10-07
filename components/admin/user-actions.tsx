"use client";

import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { banUser, setPlatformRole, unbanUser } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserActions({
	userId,
	banned,
	isAdmin,
	isSelf,
}: {
	userId: string;
	banned: boolean;
	isAdmin: boolean;
	isSelf: boolean;
}) {
	const t = useTranslations("Admin");
	const [pending, start] = useTransition();
	if (isSelf) return null;
	const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
		start(async () => {
			const res = await fn();
			if (!res.ok) toast.error(res.error ?? "Fehler");
		});
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					disabled={pending}
					aria-label="Aktionen"
				>
					<MoreHorizontal />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{banned ? (
					<DropdownMenuItem onSelect={() => run(() => unbanUser(userId))}>
						{t("unban")}
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem
						variant="destructive"
						onSelect={() =>
							run(() => banUser(userId, "Gesperrt durch Plattform-Admin"))
						}
					>
						{t("ban")}
					</DropdownMenuItem>
				)}
				{isAdmin ? (
					<DropdownMenuItem
						onSelect={() => run(() => setPlatformRole(userId, "user"))}
					>
						{t("unsetAdmin")}
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem
						onSelect={() => run(() => setPlatformRole(userId, "admin"))}
					>
						{t("setAdmin")}
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
