"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
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
import { errorText } from "@/components/ui/error-text";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

// Manuelle Anwendbarkeit (SoA-Begründung) je Anforderung. Ausschließen nur,
// wo das Rahmenwerk es kennt (`exclusion`: ISO Annex A, SOC 2
// Zusatzkategorien …); ein bestehender Ausschluss lässt sich immer zurücknehmen.
export function ApplicabilityToggle({
	framework,
	code,
	applicable,
	canEdit,
	exclusion,
}: {
	framework: string;
	code: string;
	applicable: boolean;
	canEdit: boolean;
	exclusion: { label: string; basis: string } | null;
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
				toast.error(
					res.error === "exclusion_not_allowed"
						? t("exclusionNotAllowed")
						: errorText(tc, res),
				);
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
	if (!exclusion) return null;
	return (
		<>
			<Button size="sm" variant="outline" onClick={() => setOpen(true)}>
				{t("markNotApplicable")}
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("markNotApplicable")}</DialogTitle>
						<DialogDescription>
							{t("exclusionHow", {
								label: exclusion.label,
								basis: exclusion.basis,
							})}
						</DialogDescription>
					</DialogHeader>
					<Textarea
						aria-label={t("applicabilityNote")}
						placeholder={t("applicabilityNote")}
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
