"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setRequirementApplicability } from "@/app/actions/frameworks";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

// Manuelle Anwendbarkeit (SoA-Begründung) je Anforderung.
export function ApplicabilityToggle({
	framework,
	code,
	applicable,
	canEdit,
}: {
	framework: string;
	code: string;
	applicable: boolean;
	canEdit: boolean;
}) {
	const t = useTranslations("Frameworks");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [note, setNote] = useState("");
	const [pending, start] = useTransition();
	if (!canEdit) return null;

	function save(next: boolean) {
		start(async () => {
			const res = await setRequirementApplicability({
				framework,
				code,
				applicable: next,
				note,
			});
			if (!res.ok) {
				toast.error(tc("error"));
				return;
			}
			toast.success(t("applicabilitySaved"));
			setOpen(false);
			setNote("");
			router.refresh();
		});
	}

	if (!applicable) {
		return (
			<Button
				size="sm"
				variant="outline"
				disabled={pending}
				onClick={() => save(true)}
			>
				{t("markApplicable")}
			</Button>
		);
	}
	return (
		<>
			<Button size="sm" variant="outline" onClick={() => setOpen(true)}>
				{t("markNotApplicable")}
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("markNotApplicable")}</DialogTitle>
						<DialogDescription>{t("applicabilityNote")}</DialogDescription>
					</DialogHeader>
					<Textarea
						value={note}
						onChange={(e) => setNote(e.target.value)}
						rows={4}
						autoFocus
					/>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setOpen(false)}>
							{tc("cancel")}
						</Button>
						<Button
							disabled={pending || note.trim().length < 3}
							onClick={() => save(false)}
						>
							{tc("save")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
