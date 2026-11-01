"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setMemberAccess } from "@/app/actions/team";
import { withStepUp } from "@/components/auth/step-up-dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { ACCESS_GRANTS } from "@/lib/validation/options";

// Zeitlich begrenzter Zugang + Grants für sensible Register (Prüfer-Sicht).
export function MemberAccessForm({
	memberId,
	accessUntil,
	grants,
}: {
	memberId: string;
	accessUntil: Date | null;
	grants: string[];
}) {
	const t = useTranslations("Team");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [until, setUntil] = useState(
		accessUntil ? accessUntil.toISOString().slice(0, 10) : "",
	);
	const [picked, setPicked] = useState<Set<string>>(new Set(grants));
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="ghost" className="">
					{t("access")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await withStepUp(() =>
								setMemberAccess({
									memberId,
									accessUntil: until ? new Date(`${until}T23:59:59`) : null,
									grants: [...picked],
								}),
							);
							if (!res.ok)
								return void toast.error(
									res.error === "step_up_required"
										? t("stepUp")
										: errorText(tc, res),
								);
							toast.success(t("accessSaved"));
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("access")}</DialogTitle>
						<DialogDescription>{t("accessLead")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ma-until">{t("accessUntil")}</Label>
						<Input
							id="ma-until"
							type="date"
							value={until}
							onChange={(e) => setUntil(e.target.value)}
						/>
					</div>
					<fieldset className="flex flex-col gap-2 text-subhead">
						<legend className="font-medium text-footnote mb-1 text-muted-foreground">
							{t("grants")}
						</legend>
						{ACCESS_GRANTS.map((g) => (
							<label key={g} className="flex items-center gap-2">
								<Checkbox
									checked={picked.has(g)}
									onCheckedChange={(v) => {
										const next = new Set(picked);
										if (v) next.add(g);
										else next.delete(g);
										setPicked(next);
									}}
								/>
								{t(`grant_${g}`)}
							</label>
						))}
					</fieldset>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button type="submit" disabled={pending}>
							{tc("save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
