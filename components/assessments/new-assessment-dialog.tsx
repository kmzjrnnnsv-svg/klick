"use client";

import { ListChecks } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createAssessment } from "@/app/actions/assessments";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// „Neue Gap-Analyse“: Rahmenwerke (vorausgewählt: alle aktiven), optional
// Stichtag und „nur Neues“. Danach direkt in den Fragebogen.
export function NewAssessmentDialog({
	frameworks,
	hasPrevious,
	label,
	variant = "default",
}: {
	frameworks: { slug: string; name: string }[];
	hasPrevious: boolean;
	label?: string;
	variant?: "default" | "outline" | "brown";
}) {
	const t = useTranslations("Assessment");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [picked, setPicked] = useState<string[]>(frameworks.map((f) => f.slug));
	const [asOf, setAsOf] = useState("");
	const [title, setTitle] = useState("");
	const [onlyNew, setOnlyNew] = useState(false);
	const [pending, start] = useTransition();

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant={variant}>
					<ListChecks aria-hidden="true" />
					{label ?? t("new")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("new")}</DialogTitle>
					<DialogDescription>{t("newLead")}</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await createAssessment({
								frameworks: picked,
								asOf: asOf || null,
								title: title || undefined,
								onlyNew,
							});
							if (!res.ok) {
								toast.error(
									res.error === "noQuestions" ? t("noQuestions") : tc("error"),
								);
								return;
							}
							setOpen(false);
							router.push(`/gap-analyse/${res.data.id}?schritt=fragen`);
						});
					}}
				>
					<fieldset className="flex flex-col gap-2">
						<legend className="mb-1 font-medium text-sm">
							{t("newFrameworks")}
						</legend>
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
							{frameworks.map((f) => (
								<label
									key={f.slug}
									htmlFor={`fw-${f.slug}`}
									className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm"
								>
									<Checkbox
										id={`fw-${f.slug}`}
										checked={picked.includes(f.slug)}
										onCheckedChange={(v) =>
											setPicked(
												v
													? [...picked, f.slug]
													: picked.filter((s) => s !== f.slug),
											)
										}
									/>
									<span>{f.name}</span>
								</label>
							))}
						</div>
					</fieldset>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ga-asof">{t("newAsOf")}</Label>
							<Input
								id="ga-asof"
								name="asOf"
								type="date"
								value={asOf}
								onChange={(e) => setAsOf(e.target.value)}
							/>
							<p className="text-muted-foreground text-xs">
								{t("newAsOfHint")}
							</p>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ga-title">{t("newTitle")}</Label>
							<Input
								id="ga-title"
								name="title"
								value={title}
								maxLength={200}
								autoComplete="off"
								onChange={(e) => setTitle(e.target.value)}
							/>
						</div>
					</div>
					{hasPrevious && (
						<label
							htmlFor="ga-only-new"
							className="flex cursor-pointer items-start gap-2 text-sm"
						>
							<Checkbox
								id="ga-only-new"
								checked={onlyNew}
								onCheckedChange={(v) => setOnlyNew(v === true)}
							/>
							<span>{t("newOnlyNew")}</span>
						</label>
					)}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button type="submit" disabled={pending || picked.length === 0}>
							{pending ? t("starting") : t("start")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
