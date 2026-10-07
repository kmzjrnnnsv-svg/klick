"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { assignControl } from "@/app/actions/controls";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export type MemberOption = { userId: string; name: string; email: string };

// Verantwortlich (Owner) und Bearbeitet von (Assignee) — zwei Auswahlfelder,
// sofort gespeichert. Zuweisung löst eine Benachrichtigung aus.
export function OwnerAssignee({
	implementationId,
	ownerUserId,
	assigneeUserId,
	members,
	canAssign,
}: {
	implementationId: string;
	ownerUserId: string | null;
	assigneeUserId: string | null;
	members: MemberOption[];
	canAssign: boolean;
}) {
	const t = useTranslations("Entity");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();

	function save(field: "ownerUserId" | "assigneeUserId", value: string) {
		start(async () => {
			const res = await assignControl({
				implementationId,
				[field]: value === "none" ? null : value,
			});
			if (!res.ok) toast.error(tc("error"));
			else router.refresh();
		});
	}

	const label = (id: string | null) =>
		members.find((m) => m.userId === id)?.name ?? "—";

	if (!canAssign) {
		return (
			<>
				<div className="flex flex-col gap-0.5">
					<dt className="lv-eyebrow text-[0.52rem] text-muted-foreground">
						{t("owner")}
					</dt>
					<dd>{label(ownerUserId)}</dd>
				</div>
				<div className="flex flex-col gap-0.5">
					<dt className="lv-eyebrow text-[0.52rem] text-muted-foreground">
						{t("assignee")}
					</dt>
					<dd>{label(assigneeUserId)}</dd>
				</div>
			</>
		);
	}

	const Picker = ({
		field,
		value,
		title,
	}: {
		field: "ownerUserId" | "assigneeUserId";
		value: string | null;
		title: string;
	}) => (
		<div className="flex flex-col gap-0.5">
			<dt className="lv-eyebrow text-[0.52rem] text-muted-foreground">
				{title}
			</dt>
			<dd>
				<Select
					value={value ?? "none"}
					onValueChange={(v) => save(field, v)}
					disabled={pending}
				>
					<SelectTrigger className="h-8 w-full" aria-label={title}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="none">—</SelectItem>
						{members.map((m) => (
							<SelectItem key={m.userId} value={m.userId}>
								{m.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</dd>
		</div>
	);

	return (
		<>
			<Picker field="ownerUserId" value={ownerUserId} title={t("owner")} />
			<Picker
				field="assigneeUserId"
				value={assigneeUserId}
				title={t("assignee")}
			/>
		</>
	);
}
