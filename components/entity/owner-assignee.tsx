"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { assignControl } from "@/app/actions/controls";
import { errorText } from "@/components/ui/error-text";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { FunctionKey } from "@/db/schema/enums";
import { responsibleValue } from "@/lib/validation/responsible-ref";
import {
	ResponsibleLabel,
	type ResponsibleOption,
	ResponsibleSelect,
} from "./responsible-select";

export type MemberOption = { userId: string; name: string; email: string };

// Verantwortlich (Funktion oder Person) und Bearbeitet von (Person) — zwei
// Auswahlfelder, sofort gespeichert. Zuweisung löst eine Benachrichtigung aus.
export function OwnerAssignee({
	implementationId,
	ownerUserId,
	ownerFunction,
	assigneeUserId,
	members,
	functions,
	canAssign,
}: {
	implementationId: string;
	ownerUserId: string | null;
	ownerFunction: FunctionKey | null;
	assigneeUserId: string | null;
	members: MemberOption[];
	functions: ResponsibleOption[];
	canAssign: boolean;
}) {
	const t = useTranslations("Entity");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();

	function save(field: "ownerUserId" | "assigneeUserId", value: string | null) {
		start(async () => {
			const res = await assignControl({
				implementationId,
				[field]: value === "none" ? null : value,
			});
			if (!res.ok) toast.error(errorText(tc, res));
			else router.refresh();
		});
	}

	const label = (id: string | null) =>
		members.find((m) => m.userId === id)?.name ?? "—";

	if (!canAssign) {
		return (
			<>
				<div className="flex flex-col gap-0.5">
					<dt className="font-medium text-footnote text-muted-foreground">
						{t("owner")}
					</dt>
					<dd>
						<ResponsibleLabel
							ownerFunction={ownerFunction}
							ownerName={ownerUserId ? label(ownerUserId) : null}
						/>
					</dd>
				</div>
				<div className="flex flex-col gap-0.5">
					<dt className="font-medium text-footnote text-muted-foreground">
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
		field: "assigneeUserId";
		value: string | null;
		title: string;
	}) => (
		<div className="flex flex-col gap-0.5">
			<dt className="font-medium text-footnote text-muted-foreground">
				{title}
			</dt>
			<dd>
				<Select
					value={value ?? "none"}
					onValueChange={(v) => save(field, v)}
					disabled={pending}
				>
					<SelectTrigger size="sm" className="w-full" aria-label={title}>
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
			<div className="flex flex-col gap-0.5">
				<dt className="font-medium text-footnote text-muted-foreground">
					{t("owner")}
				</dt>
				<dd>
					<ResponsibleSelect
						size="sm"
						value={responsibleValue({ ownerFunction, ownerUserId })}
						onChange={(v) => save("ownerUserId", v)}
						members={members}
						functions={functions}
						disabled={pending}
						aria-label={t("owner")}
					/>
				</dd>
			</div>
			<Picker
				field="assigneeUserId"
				value={assigneeUserId}
				title={t("assignee")}
			/>
		</>
	);
}
