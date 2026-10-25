"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { updateDocument } from "@/app/actions/documents";
import { errorText } from "@/components/ui/error-text";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { ROLE_FUNCTIONS, type RoleFunction } from "@/db/schema/enums";

// „Freigabe durch“: wer nach der Eigner:in freigibt (Ablauf
// document_publish, Stelle approver_of_entity). „Keine“ = nur Eigner:in.
export function ApproverFunctionOptions() {
	const t = useTranslations("Documents");
	const tf = useTranslations("Functions");
	return (
		<>
			<SelectItem value="none">{t("approverNone")}</SelectItem>
			{ROLE_FUNCTIONS.map((fn) => (
				<SelectItem key={fn} value={fn}>
					{tf(fn)}
				</SelectItem>
			))}
		</>
	);
}

export function ApproverFunctionSelect({
	documentId,
	value,
	canEdit,
}: {
	documentId: string;
	value: RoleFunction | null;
	canEdit: boolean;
}) {
	const t = useTranslations("Documents");
	const tf = useTranslations("Functions");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	if (!canEdit) return <>{value ? tf(value) : t("approverNone")}</>;
	return (
		<Select
			value={value ?? "none"}
			disabled={pending}
			onValueChange={(v) =>
				start(async () => {
					const res = await updateDocument({
						documentId,
						approverFunction: v === "none" ? null : (v as RoleFunction),
					});
					if (!res.ok) return void toast.error(errorText(tc, res));
					toast.success(t("approverSaved"));
					router.refresh();
				})
			}
		>
			<SelectTrigger className="w-full" aria-label={t("approver")}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<ApproverFunctionOptions />
			</SelectContent>
		</Select>
	);
}
