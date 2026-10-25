"use client";

import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	cancelInvitation,
	invitationLink,
	removeMember,
	resetMemberAccess,
	updateMemberRole,
} from "@/app/actions/team";
import { ResetAccessDialog } from "@/components/auth/reset-access-dialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";
import { ORG_ROLES } from "@/lib/auth/session-rules";
import { InviteLinkPanel } from "./invite-form";

const ROLES = ORG_ROLES;

export function MemberActions({
	memberId,
	userId,
	name,
	currentRole,
	isSelf,
}: {
	memberId: string;
	userId: string;
	name: string;
	currentRole: string;
	isSelf: boolean;
}) {
	const t = useTranslations("Team");
	const tc = useTranslations("Common");
	const [pending, start] = useTransition();
	const [resetOpen, setResetOpen] = useState(false);
	if (isSelf) return null;
	return (
		<>
			<ResetAccessDialog
				open={resetOpen}
				onOpenChange={setResetOpen}
				name={name}
				run={() => resetMemberAccess(userId)}
			/>
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
											res.error.includes(" ") ? res.error : errorText(tc, res),
										);
								})
							}
						>
							{t(`role${r[0].toUpperCase()}${r.slice(1)}` as "roleOwner")}
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={() => setResetOpen(true)}>
						{t("resetAccess")}
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						onSelect={() =>
							start(async () => {
								const res = await removeMember(memberId);
								if (!res.ok)
									toast.error(
										res.error.includes(" ") ? res.error : errorText(tc, res),
									);
							})
						}
					>
						{t("remove")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
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
					if (!res.ok) toast.error(errorText(tc, res));
				})
			}
		>
			{t("cancel")}
		</Button>
	);
}

// Neuer Einladungslink für eine offene Einladung (der alte wird ungültig).
export function InvitationLinkButton({
	invitationId,
}: {
	invitationId: string;
}) {
	const t = useTranslations("Team");
	const tc = useTranslations("Common");
	const [pending, start] = useTransition();
	const [url, setUrl] = useState<string | null>(null);
	return (
		<>
			<Button
				variant="ghost"
				size="sm"
				disabled={pending}
				onClick={() =>
					start(async () => {
						const res = await invitationLink(invitationId);
						if (res.ok) setUrl(res.data.url);
						else toast.error(errorText(tc, res));
					})
				}
			>
				{t("inviteNewLink")}
			</Button>
			<Dialog open={url !== null} onOpenChange={(o) => !o && setUrl(null)}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>{t("inviteLinkTitle")}</DialogTitle>
						<DialogDescription>{t("inviteLinkLead")}</DialogDescription>
					</DialogHeader>
					{url && (
						<InviteLinkPanel
							url={url}
							mailed={null}
							onDone={() => setUrl(null)}
						/>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
