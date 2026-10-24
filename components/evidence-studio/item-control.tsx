"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveSheetItem } from "@/app/actions/evidence-studio";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

// Beleg für eine freie Position: Nachweise des Controls verknüpfen oder
// kurz als Text belegen
export function ItemControl({
	controlCode,
	itemId,
	initial,
	evidenceOptions,
	disabled,
}: {
	controlCode: string;
	itemId: string;
	initial: { note?: string; evidenceIds?: string[] } | null;
	evidenceOptions: { id: string; title: string }[];
	disabled?: boolean;
}) {
	const t = useTranslations("EvidenceStudio");
	const tc = useTranslations("Common");
	const [note, setNote] = useState(initial?.note ?? "");
	const [ids, setIds] = useState<string[]>(initial?.evidenceIds ?? []);
	const [writing, setWriting] = useState(Boolean(initial?.note));
	const [pending, start] = useTransition();
	const dirty =
		note !== (initial?.note ?? "") ||
		ids.join() !== (initial?.evidenceIds ?? []).join();

	const save = () =>
		start(async () => {
			const empty = !note.trim() && ids.length === 0;
			const res = await saveSheetItem({
				controlCode,
				itemId,
				mode: empty ? null : ids.length > 0 ? "evidence" : "text",
				note: note.trim() || undefined,
				evidenceIds: ids.length > 0 ? ids : undefined,
			});
			if (res.ok) toast.success(t("saved"));
			else toast.error(tc("error"));
		});

	return (
		<div className="flex flex-col gap-2">
			{evidenceOptions.length > 0 && (
				<fieldset className="flex flex-col gap-1">
					<legend className="sr-only">{t("linkEvidence")}</legend>
					{evidenceOptions.map((e) => (
						<label
							key={e.id}
							className="flex min-w-0 items-center gap-2 text-subhead"
						>
							<Checkbox
								checked={ids.includes(e.id)}
								disabled={disabled || pending}
								onCheckedChange={(v) =>
									setIds((cur) =>
										v ? [...cur, e.id] : cur.filter((x) => x !== e.id),
									)
								}
							/>
							<span className="truncate">{e.title}</span>
						</label>
					))}
				</fieldset>
			)}
			{writing ? (
				<Textarea
					value={note}
					onChange={(e) => setNote(e.target.value)}
					placeholder={t("notePlaceholder")}
					aria-label={t("textEvidence")}
					rows={2}
					maxLength={4000}
					disabled={disabled || pending}
					className="min-h-0 text-subhead"
				/>
			) : (
				!disabled && (
					<div>
						<Button
							size="sm"
							variant="ghost"
							className="h-(--control-h-sm) px-2 text-footnote"
							onClick={() => setWriting(true)}
						>
							{t("textEvidence")}
						</Button>
					</div>
				)
			)}
			{dirty && !disabled && (
				<div>
					<Button size="sm" onClick={save} disabled={pending}>
						{pending ? `${t("save")}…` : t("save")}
					</Button>
				</div>
			)}
		</div>
	);
}
