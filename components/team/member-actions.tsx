"use client";

import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import {
	cancelInvitation,
	removeMember,
	updateMemberRole,
} from "@/app/actions/team";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROLES = ["owner", "editor", "viewer", "auditor"] as const;

export function MemberActions({
	memberId,
	currentRole,
	isSelf,
}: {
	memberId: string;
	currentRole: string;
	isSelf: boolean;
}) {
	const t = useTranslations("Team");
	const tc = useTranslations("Common");
	const [pending, start] = useTransition();
	if (isSelf) return null;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={t("changeRole")}
					disabled={pending}
				>
					<MoreHorizontal />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuLabel>{t("changeRole")}</DropdownMenuLabel>
				{ROLES.filter((r) => r !== currentRole).map((r) => (
					<DropdownMenuItem
						key={r}
						onSelect={() =>
							start(async () => {
								const res = await updateMemberRole({ memberId, role: r });
								if (!res.ok)
									toast.error(
										res.error.includes(" ") ? res.error : tc("error"),
									);
							})
						}
					>
						{t(`role${r[0].toUpperCase()}${r.slice(1)}` as "roleOwner")}
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem
					variant="destructive"
					onSelect={() =>
						start(async () => {
							const res = await removeMember(memberId);
							if (!res.ok)
								toast.error(res.error.includes(" ") ? res.error : tc("error"));
						})
					}
				>
					{t("remove")}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function CancelInvitationButton({
	invitationId,
}: {
	invitationId: string;
}) {
	const t = useTranslations("Team");
	const tc = useTranslations("Common");
	const [pending, start] = useTransition();
	return (
		<Button
			variant="ghost"
			size="sm"
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await cancelInvitation(invitationId);
					if (!res.ok)
						toast.error(res.error.includes(" ") ? res.error : tc("error"));
				})
			}
		>
			{t("cancel")}
		</Button>
	);
}
