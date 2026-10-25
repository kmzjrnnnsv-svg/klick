"use client";

import {
	changeMemberRole,
	removeMember,
	revokeInvitation,
} from "@wallet/app/actions/members";
import type { MemberRole } from "@wallet/db/schema/enums";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { withStepUp } from "../auth/step-up-dialog";
import { useActionFeedback } from "./use-action-feedback";

export function RoleSelect({
	memberId,
	name,
	role,
	roles,
}: {
	memberId: string;
	name: string;
	role: MemberRole;
	roles: { value: MemberRole; label: string }[];
}) {
	const t = useTranslations("Members");
	const router = useRouter();
	const feedback = useActionFeedback();
	const [value, setValue] = useState(role);
	return (
		<Select
			value={value}
			onValueChange={async (v) => {
				const next = v as MemberRole;
				const res = await withStepUp(() =>
					changeMemberRole({ memberId, role: next }),
				);
				if (feedback(res, t("saved"))) {
					setValue(next);
					router.refresh();
				}
			}}
		>
			<SelectTrigger
				aria-label={t("roleOf", { name })}
				size="sm"
				className="w-36"
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{roles.map((r) => (
					<SelectItem key={r.value} value={r.value}>
						{r.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export function RemoveMember({
	memberId,
	name,
	org,
}: {
	memberId: string;
	name: string;
	org: string;
}) {
	const t = useTranslations("Members");
	const tc = useTranslations("Common");
	const router = useRouter();
	const feedback = useActionFeedback();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="ghost" size="sm">
					{t("remove")}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("removeTitle", { name })}</AlertDialogTitle>
					<AlertDialogDescription>
						{t("removeLead", { org })}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							const res = await withStepUp(() => removeMember(memberId));
							if (feedback(res, t("saved"))) router.refresh();
						}}
					>
						{t("remove")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function RevokeInvitation({ id }: { id: string }) {
	const t = useTranslations("Members");
	const router = useRouter();
	const feedback = useActionFeedback();
	return (
		<Button
			variant="ghost"
			size="sm"
			onClick={async () => {
				const res = await withStepUp(() => revokeInvitation(id));
				if (feedback(res, t("saved"))) router.refresh();
			}}
		>
			{t("revoke")}
		</Button>
	);
}
