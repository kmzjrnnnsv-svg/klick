"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	applyTrainingRequirements,
	createTraining,
} from "@/app/actions/registers";
import type { MemberOption } from "@/components/entity/owner-assignee";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function TrainingForm({
	members,
	requirements,
}: {
	members: MemberOption[];
	requirements: { code: string; title: string }[];
}) {
	const t = useTranslations("Trainings");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [title, setTitle] = useState("");
	const [heldAt, setHeldAt] = useState(new Date().toISOString().slice(0, 10));
	const [requirementCode, setRequirementCode] = useState("");
	const [attendees, setAttendees] = useState<string[]>([]);
	const [audience, setAudience] = useState<
		"all" | "management" | "role_specific"
	>("all");
	const [notes, setNotes] = useState("");
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="brown">
					<Plus />
					{t("new")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await createTraining({
								title,
								heldAt,
								attendeeUserIds: attendees,
								audience,
								requirementCode: requirementCode || undefined,
								notes: notes || undefined,
							});
							if (!res.ok) return void toast.error(tc("error"));
							toast.success(t("created"));
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("new")}</DialogTitle>
					</DialogHeader>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5 sm:col-span-2">
							<Label htmlFor="tr-title">{t("titleField")}</Label>
							<Input
								id="tr-title"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								required
								maxLength={200}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="tr-date">{t("heldAt")}</Label>
							<Input
								id="tr-date"
								type="date"
								required
								value={heldAt}
								onChange={(e) => setHeldAt(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("requirement")}</Label>
							<Select
								value={requirementCode || "none"}
								onValueChange={(v) => setRequirementCode(v === "none" ? "" : v)}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">—</SelectItem>
									{requirements.map((r) => (
										<SelectItem key={r.code} value={r.code}>
											{r.title}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("audience")}</Label>
							<Select
								value={audience}
								onValueChange={(v) => setAudience(v as typeof audience)}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{(["all", "management", "role_specific"] as const).map(
										(a) => (
											<SelectItem key={a} value={a}>
												{t(`audience_${a}`)}
											</SelectItem>
										),
									)}
								</SelectContent>
							</Select>
						</div>
					</div>
					<fieldset className="flex flex-col gap-1.5">
						<legend className="lv-eyebrow mb-1 text-[0.52rem] text-muted-foreground">
							{t("attendees")}
						</legend>
						<div className="max-h-40 overflow-y-auto rounded-md border p-2">
							{members.map((m) => (
								<label
									key={m.userId}
									className="flex items-center gap-2 py-0.5 text-sm"
								>
									<Checkbox
										checked={attendees.includes(m.userId)}
										onCheckedChange={(v) =>
											setAttendees(
												v
													? [...attendees, m.userId]
													: attendees.filter((x) => x !== m.userId),
											)
										}
									/>
									{m.name}
								</label>
							))}
						</div>
					</fieldset>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="tr-notes">{t("notes")}</Label>
						<Textarea
							id="tr-notes"
							rows={2}
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button type="submit" disabled={pending || !title.trim()}>
							{tc("save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function ApplyRequirementsButton() {
	const t = useTranslations("Trainings");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			size="sm"
			variant="outline"
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await applyTrainingRequirements();
					if (!res.ok) toast.error(tc("error"));
					else {
						toast.success(
							t("requirementsApplied", { n: res.data.requirements }),
						);
						router.refresh();
					}
				})
			}
		>
			{t("applyRequirements")}
		</Button>
	);
}
