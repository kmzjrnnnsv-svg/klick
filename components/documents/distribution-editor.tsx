"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { updateDocument } from "@/app/actions/documents";
import {
	useFunctionLabel,
	useResponsibleOptions,
} from "@/components/entity/responsible-context";
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
import { errorText } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import type { FunctionKey } from "@/lib/compliance/function-key";
import { DISTRIBUTION_ALL, functionTarget } from "@/lib/documents/distribution";

// Verteiler eines Dokuments: wer die gültige Fassung unter /richtlinien
// sieht und bestätigen soll — alle, Mitarbeitende oder Funktionen (besetzt,
// aus dem App-Rahmen).
export function DistributionEditor({
	documentId,
	value,
	canEdit,
}: {
	documentId: string;
	value: string[];
	canEdit: boolean;
}) {
	const t = useTranslations("Documents");
	const tc = useTranslations("Common");
	const router = useRouter();
	const label = useFunctionLabel();
	const functions = [
		...new Set(useResponsibleOptions().map((o) => o.function)),
	] as FunctionKey[];
	const [open, setOpen] = useState(false);
	const [picked, setPicked] = useState<Set<string>>(new Set(value));
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);

	const all = value.length === 0 || value.includes(DISTRIBUTION_ALL);
	const summary = all
		? t("distributionAll")
		: value
				.map((v) =>
					v === "employee"
						? t("distributionEmployees")
						: v.startsWith("function:")
							? label(v.slice("function:".length) as FunctionKey)
							: v,
				)
				.join(", ");

	const toggle = (key: string, on: boolean) =>
		setPicked((prev) => {
			const next = new Set(prev);
			if (key === DISTRIBUTION_ALL) return new Set(on ? [key] : []);
			next.delete(DISTRIBUTION_ALL);
			if (on) next.add(key);
			else next.delete(key);
			return next;
		});

	if (!canEdit) return <span>{summary}</span>;
	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				setOpen(v);
				if (v) setPicked(new Set(all ? [DISTRIBUTION_ALL] : value));
				setError(null);
			}}
		>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-auto min-h-(--control-h-sm) justify-start px-0 text-left"
				>
					<span className="min-w-0 break-words">{summary}</span>
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("distribution")}</DialogTitle>
					<DialogDescription>{t("distributionLead")}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					{[
						{ key: DISTRIBUTION_ALL, text: t("distributionAll") },
						{ key: "employee", text: t("distributionEmployees") },
						...functions.map((f) => ({
							key: functionTarget(f),
							text: label(f),
						})),
					].map((o) => (
						<div key={o.key} className="flex items-center gap-3">
							<Checkbox
								id={`dist-${o.key}`}
								checked={picked.has(o.key)}
								onCheckedChange={(v) => toggle(o.key, v === true)}
							/>
							<Label htmlFor={`dist-${o.key}`} className="font-normal">
								{o.text}
							</Label>
						</div>
					))}
				</div>
				<FormAlert message={error} />
				<DialogFooter>
					<Button variant="ghost" onClick={() => setOpen(false)}>
						{tc("cancel")}
					</Button>
					<Button
						disabled={pending || picked.size === 0}
						onClick={() =>
							start(async () => {
								const res = await updateDocument({
									documentId,
									distribution: [...picked],
								});
								if (!res.ok) return void setError(errorText(tc, res));
								toast.success(t("distributionSaved"));
								setOpen(false);
								router.refresh();
							})
						}
					>
						{tc("save")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
