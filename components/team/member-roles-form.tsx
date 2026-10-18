"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setMemberRoles } from "@/app/actions/roles";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

// Eigene Rollen einer Person (ADR-020) — zusätzlich zur Grundrolle.
export function MemberRolesForm({
	memberId,
	name,
	roles,
	current,
}: {
	memberId: string;
	name: string;
	roles: { id: string; name: string }[];
	current: string[];
}) {
	const t = useTranslations("Roles");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [picked, setPicked] = useState<string[]>(current);

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (o) setPicked(current);
			}}
		>
			<DialogTrigger asChild>
				<Button size="sm" variant="ghost">
					{t("memberRoles")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t("memberRolesTitle", { name })}</DialogTitle>
					<DialogDescription>{t("memberRolesLead")}</DialogDescription>
				</DialogHeader>
				{roles.length === 0 ? (
					<p className="text-muted-foreground text-sm">{t("noRoles")}</p>
				) : (
					<div className="flex flex-col gap-2">
						{roles.map((r) => {
							const id = `mr-${memberId}-${r.id}`;
							return (
								<label
									key={r.id}
									htmlFor={id}
									className="flex items-center gap-2 text-sm"
								>
									<Checkbox
										id={id}
										checked={picked.includes(r.id)}
										onCheckedChange={(v) =>
											setPicked(
												v === true
													? [...picked, r.id]
													: picked.filter((x) => x !== r.id),
											)
										}
									/>
									{r.name}
								</label>
							);
						})}
					</div>
				)}
				<DialogFooter>
					<Button
						variant="brown"
						disabled={pending || roles.length === 0}
						onClick={() =>
							start(async () => {
								const res = await withStepUp(() =>
									setMemberRoles({ memberId, roleIds: picked }),
								);
								if (!res.ok) {
									toast.error(
										res.error === "rolesNotAllowed"
											? t("rolesNotAllowed")
											: res.error === "step_up_required"
												? t("stepUp")
												: tc("error"),
									);
									return;
								}
								toast.success(t("saved"));
								setOpen(false);
								router.refresh();
							})
						}
					>
						{t("save")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
