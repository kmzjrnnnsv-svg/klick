"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createDelegation } from "@/app/actions/approvals";
import type { MemberOption } from "@/components/entity/owner-assignee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export function DelegationForm({
	members,
	selfId,
}: {
	members: MemberOption[];
	selfId: string;
}) {
	const t = useTranslations("Approvals");
	const tc = useTranslations("Common");
	const router = useRouter();
	const others = members.filter((m) => m.userId !== selfId);
	const [to, setTo] = useState(others[0]?.userId ?? "");
	const [until, setUntil] = useState("");
	const [pending, start] = useTransition();
	if (others.length === 0) return null;
	return (
		<form
			className="flex flex-col gap-3 rounded-md border p-3 text-sm sm:flex-row sm:items-end"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					const res = await createDelegation({
						toUserId: to,
						validUntil: new Date(`${until}T23:59:59`),
					});
					if (!res.ok) toast.error(tc("error"));
					else {
						toast.success(t("delegationCreated"));
						setUntil("");
						router.refresh();
					}
				});
			}}
		>
			<div className="flex flex-1 flex-col gap-1.5">
				<Label>{t("delegateTo")}</Label>
				<Select value={to} onValueChange={setTo}>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{others.map((m) => (
							<SelectItem key={m.userId} value={m.userId}>
								{m.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="deleg-until">{t("delegationUntil")}</Label>
				<Input
					id="deleg-until"
					type="date"
					required
					value={until}
					onChange={(e) => setUntil(e.target.value)}
				/>
			</div>
			<Button
				type="submit"
				size="sm"
				variant="outline"
				disabled={pending || !to || !until}
			>
				{t("delegation")}
			</Button>
		</form>
	);
}
