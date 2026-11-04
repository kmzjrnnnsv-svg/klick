"use client";

import { ListChecks } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { applyTaskBundle } from "@/app/actions/registers";
import { Button } from "@/components/ui/button";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

export type BundleOption = {
	code: string;
	name: string;
	description: string;
	items: number;
};

// „Aufgabenpaket anwenden“: eine Checkliste (Eintritt, Austritt,
// Schlüsselzeremonie …) als Aufgaben anlegen, Fristen ab dem Startdatum,
// zuständig nach der Regel je Punkt (Funktion, Rolle, sonst du).
export function ApplyBundle({ bundles }: { bundles: BundleOption[] }) {
	const t = useTranslations("Bundles");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [code, setCode] = useState(bundles[0]?.code ?? "");
	const [startDate, setStartDate] = useState("");
	const chosen = bundles.find((b) => b.code === code);
	if (bundles.length === 0) return null;
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					<ListChecks aria-hidden="true" />
					{t("apply")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await applyTaskBundle({
								code,
								startDate: startDate || undefined,
							});
							if (!res.ok) return void toast.error(errorText(tc, res));
							toast.success(t("applied", { n: res.data.created }));
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("title")}</DialogTitle>
						<DialogDescription>{t("lead")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label>{t("pick")}</Label>
						<Select value={code} onValueChange={setCode}>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{bundles.map((b) => (
									<SelectItem key={b.code} value={b.code}>
										{b.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{chosen && (
							<p className="text-footnote text-muted-foreground">
								{chosen.description} {t("items", { n: chosen.items })}
							</p>
						)}
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="bundle-start">{t("startDate")}</Label>
						<Input
							id="bundle-start"
							type="date"
							value={startDate}
							onChange={(e) => setStartDate(e.target.value)}
						/>
						<p className="text-footnote text-muted-foreground">
							{t("startHint")}
						</p>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button type="submit" disabled={pending || !code}>
							{t("apply")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
