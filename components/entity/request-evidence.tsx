"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { requestEvidence } from "@/app/actions/evidence";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { MemberOption } from "./owner-assignee";

export function RequestEvidence({
	implementationId,
	code,
	members,
}: {
	implementationId: string;
	code: string;
	members: MemberOption[];
}) {
	const t = useTranslations("Evidence");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [person, setPerson] = useState(members[0]?.userId ?? "");
	const [pending, start] = useTransition();
	if (members.length === 0) return null;
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					size="sm"
					variant="ghost"
					className="normal-case tracking-normal"
				>
					{t("requestTitle")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("requestTitle")}</DialogTitle>
					<DialogDescription>{t("requestLead")}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-1.5">
					<Label>{t("person")}</Label>
					<Select value={person} onValueChange={setPerson}>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{members.map((m) => (
								<SelectItem key={m.userId} value={m.userId}>
									{m.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={() => setOpen(false)}>
						{tc("cancel")}
					</Button>
					<Button
						disabled={pending || !person}
						onClick={() =>
							start(async () => {
								const res = await requestEvidence({
									implementationId,
									assigneeUserId: person,
									title: t("requestFor", { code }),
								});
								if (!res.ok) toast.error(tc("error"));
								else {
									toast.success(t("requested"));
									setOpen(false);
									router.refresh();
								}
							})
						}
					>
						{t("requestTitle")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
