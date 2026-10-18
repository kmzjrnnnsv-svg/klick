"use client";

import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	resetUserAccessAdmin,
	setPlatformRole,
	unbanUser,
} from "@/app/actions/admin";
import {
	RenewLinkDialog,
	WithdrawAccountDialog,
} from "@/components/admin/account-dialogs";
import { BanDialog } from "@/components/admin/ban-dialog";
import { ResetAccessDialog } from "@/components/auth/reset-access-dialog";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AccountStatus } from "@/lib/auth/account-status";

export function UserActions({
	userId,
	name,
	email,
	status,
	isAdmin,
	isSelf,
	activationDays,
}: {
	userId: string;
	name: string;
	email: string;
	status: AccountStatus;
	isAdmin: boolean;
	isSelf: boolean;
	activationDays: number;
}) {
	const t = useTranslations("Admin");
	const ta = useTranslations("AdminAccounts");
	const tt = useTranslations("Team");
	const [pending, start] = useTransition();
	const [dialog, setDialog] = useState<
		"reset" | "renew" | "withdraw" | "ban" | null
	>(null);
	if (isSelf) return null;
	const run = (
		fn: () => Promise<{ ok: boolean; error?: string }>,
		success?: string,
	) =>
		start(async () => {
			const res = await fn();
			if (!res.ok) toast.error(res.error ?? "Fehler");
			else if (success) toast.success(success);
		});
	const openChange = (o: boolean) => {
		if (!o) setDialog(null);
	};
	return (
		<>
			<ResetAccessDialog
				open={dialog === "reset"}
				onOpenChange={openChange}
				name={name}
				run={() => resetUserAccessAdmin(userId)}
			/>
			<RenewLinkDialog
				open={dialog === "renew"}
				onOpenChange={openChange}
				userId={userId}
				name={name}
				days={activationDays}
			/>
			<BanDialog
				open={dialog === "ban"}
				onOpenChange={openChange}
				userId={userId}
				name={name}
			/>
			<WithdrawAccountDialog
				open={dialog === "withdraw"}
				onOpenChange={openChange}
				userId={userId}
				email={email}
			/>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon-sm"
						disabled={pending}
						aria-label={`Aktionen für ${name}`}
					>
						<MoreHorizontal />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{status === "pending" && (
						<>
							<DropdownMenuItem onSelect={() => setDialog("renew")}>
								{ta("renew")}
							</DropdownMenuItem>
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setDialog("withdraw")}
							>
								{ta("withdraw")}
							</DropdownMenuItem>
						</>
					)}
					{status === "blocked" ? (
						<DropdownMenuItem
							onSelect={() =>
								run(() => withStepUp(() => unbanUser(userId)), ta("unbanned"))
							}
						>
							{t("unban")}
						</DropdownMenuItem>
					) : (
						!isAdmin && (
							<DropdownMenuItem
								variant="destructive"
								onSelect={() => setDialog("ban")}
							>
								{t("ban")}
							</DropdownMenuItem>
						)
					)}
					{status !== "pending" &&
						(isAdmin ? (
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
						))}
					{status === "active" && (
						<DropdownMenuItem onSelect={() => setDialog("reset")}>
							{tt("resetAccess")}
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
}
