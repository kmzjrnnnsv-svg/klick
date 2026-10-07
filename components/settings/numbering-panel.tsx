"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateNumbering } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DocumentNumbering } from "@/db/schema/platform";
import { DEFAULT_PREFIXES, type DocType } from "@/lib/documents/numbering";

export function NumberingPanel({
	numbering,
	canEdit,
}: {
	numbering: DocumentNumbering;
	canEdit: boolean;
}) {
	const t = useTranslations("Settings");
	const td = useTranslations("Documents");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const types = Object.keys(DEFAULT_PREFIXES) as DocType[];
	const [state, setState] = useState<DocumentNumbering>(
		Object.fromEntries(
			types.map((ty) => [
				ty,
				numbering[ty] ?? { prefix: DEFAULT_PREFIXES[ty], next: 1 },
			]),
		),
	);
	return (
		<form
			className="flex flex-col gap-4 text-sm"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					const res = await updateNumbering({ numbering: state });
					if (!res.ok)
						toast.error(
							res.error === "step_up_required" ? t("stepUp") : tc("error"),
						);
					else {
						toast.success(t("saved"));
						router.refresh();
					}
				});
			}}
		>
			<p className="text-muted-foreground">{t("numberingLead")}</p>
			<div className="grid gap-2 sm:grid-cols-2">
				{types.map((ty) => (
					<div
						key={ty}
						className="flex items-center gap-2 rounded-md border p-2"
					>
						<span className="min-w-0 flex-1 truncate">{td(`type_${ty}`)}</span>
						<Input
							className="w-20 font-mono"
							aria-label={t("prefix")}
							value={state[ty]?.prefix ?? ""}
							disabled={!canEdit}
							onChange={(e) =>
								setState({
									...state,
									[ty]: {
										prefix: e.target.value.toUpperCase(),
										next: state[ty]?.next ?? 1,
									},
								})
							}
							maxLength={5}
						/>
						<Input
							className="w-24"
							type="number"
							min={1}
							aria-label={t("nextNumber")}
							value={state[ty]?.next ?? 1}
							disabled={!canEdit}
							onChange={(e) =>
								setState({
									...state,
									[ty]: {
										prefix: state[ty]?.prefix ?? DEFAULT_PREFIXES[ty],
										next: Number(e.target.value),
									},
								})
							}
						/>
					</div>
				))}
			</div>
			{canEdit && (
				<div className="flex justify-end">
					<Button type="submit" size="sm" disabled={pending}>
						{tc("save")}
					</Button>
				</div>
			)}
		</form>
	);
}
