"use client";

import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	cancelInvitation,
	removeMember,
	updateMemberRole,
} from "@/app/actions/team";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OrgRole } from "@/lib/auth/permissions";
import { roleChange } from "@/lib/auth/role-guide";
import { CapabilityList, RolePicker } from "./role-picker";

// Menü je Person: „Rolle ändern …“ öffnet einen Dialog mit Rollen-Karten
// und zeigt vor dem Bestätigen, was die Person dazubekommt bzw. verliert —
// vorher wechselte ein Klick im Menü die Rolle ohne Erklärung.
export function MemberActions({
	memberId,
	currentRole,
	isSelf,
	name,
}: {
	memberId: string;
	currentRole: OrgRole;
	isSelf: boolean;
	name: string;
}) {
	const t = useTranslations("Team");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [open, setOpen] = useState(false);
	const [role, setRole] = useState<OrgRole>(currentRole);
	if (isSelf) return null;
	const change = roleChange(currentRole, role);
	return (
		<>
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
					<DropdownMenuItem
						onSelect={() => {
							setRole(currentRole);
							setOpen(true);
						}}
					>
						{t("changeRole")} …
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						onSelect={() =>
							start(async () => {
								const res = await removeMember(memberId);
								if (!res.ok)
									toast.error(
										res.error.includes(" ") ? res.error : tc("error"),
									);
							})
						}
					>
						{t("remove")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
				<DialogContent className="sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>{t("changeRoleTitle", { name })}</DialogTitle>
					</DialogHeader>
					<RolePicker value={role} onChange={setRole} />
					{role !== currentRole && (
						<div className="grid gap-3 rounded-md border p-3 text-sm sm:grid-cols-2">
							{change.gains.length === 0 && change.losses.length === 0 ? (
								<p className="text-muted-foreground">{t("changeRoleNone")}</p>
							) : (
								<>
									{change.gains.length > 0 && (
										<div>
											<p className="lv-eyebrow mb-1 text-[0.52rem] text-success">
												{t("changeRoleGains")}
											</p>
											<CapabilityList role={role} only={change.gains} />
										</div>
									)}
									{change.losses.length > 0 && (
										<div>
											<p className="lv-eyebrow mb-1 text-[0.52rem] text-destructive">
												{t("changeRoleLosses")}
											</p>
											<CapabilityList role={currentRole} only={change.losses} />
										</div>
									)}
								</>
							)}
						</div>
					)}
					<DialogFooter>
						<Button
							variant="ghost"
							disabled={pending}
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button
							disabled={pending || role === currentRole}
							onClick={() =>
								start(async () => {
									const res = await updateMemberRole({ memberId, role });
									if (!res.ok)
										return void toast.error(
											res.error.includes(" ") ? res.error : tc("error"),
										);
									toast.success(t("roleChanged"));
									setOpen(false);
									router.refresh();
								})
							}
						>
							{t("changeRoleConfirm")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
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
					if (!res.ok)
						toast.error(res.error.includes(" ") ? res.error : tc("error"));
				})
			}
		>
			{t("cancel")}
		</Button>
	);
}
