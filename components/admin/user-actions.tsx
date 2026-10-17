"use client";

import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	banUser,
	resetUserAccessAdmin,
	setPlatformRole,
	unbanUser,
} from "@/app/actions/admin";
import { ResetAccessDialog } from "@/components/auth/reset-access-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserActions({
	userId,
	name,
	banned,
	isAdmin,
	isSelf,
}: {
	userId: string;
	name: string;
	banned: boolean;
	isAdmin: boolean;
	isSelf: boolean;
}) {
	const t = useTranslations("Admin");
	const tt = useTranslations("Team");
	const [pending, start] = useTransition();
	const [resetOpen, setResetOpen] = useState(false);
	if (isSelf) return null;
	const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
		start(async () => {
			const res = await fn();
			if (!res.ok) toast.error(res.error ?? "Fehler");
		});
	return (
		<>
			<ResetAccessDialog
				open={resetOpen}
				onOpenChange={setResetOpen}
				name={name}
				run={() => resetUserAccessAdmin(userId)}
			/>
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
					<DropdownMenuItem onSelect={() => setResetOpen(true)}>
						{tt("resetAccess")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
}
