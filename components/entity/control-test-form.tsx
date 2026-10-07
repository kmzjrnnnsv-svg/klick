"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { recordControlTest } from "@/app/actions/registers";
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
import {
	CONTROL_TEST_METHODS,
	type ControlTestMethod,
} from "@/db/schema/enums";

export function ControlTestForm({
	implementationId,
	defaultMethod,
}: {
	implementationId: string;
	defaultMethod?: ControlTestMethod | null;
}) {
	const t = useTranslations("Tests");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [method, setMethod] = useState<ControlTestMethod>(
		defaultMethod ?? "inspection",
	);
	const [result, setResult] = useState<"pass" | "partial" | "fail">("pass");
	const [scope, setScope] = useState("");
	const [notes, setNotes] = useState("");
	const [nextTestAt, setNextTestAt] = useState("");
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					<Plus />
					{t("new")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await recordControlTest({
								implementationId,
								method,
								result,
								scope: scope || undefined,
								notes: notes || undefined,
								nextTestAt: nextTestAt || null,
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
						<DialogDescription>{t("lead")}</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<Label>{t("method")}</Label>
							<Select
								value={method}
								onValueChange={(v) => setMethod(v as ControlTestMethod)}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CONTROL_TEST_METHODS.map((m) => (
										<SelectItem key={m} value={m}>
											{t(`method_${m}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("result")}</Label>
							<Select
								value={result}
								onValueChange={(v) => setResult(v as typeof result)}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{(["pass", "partial", "fail"] as const).map((r) => (
										<SelectItem key={r} value={r}>
											{t(`result_${r}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5 sm:col-span-2">
							<Label htmlFor="ct-scope">{t("scope")}</Label>
							<Input
								id="ct-scope"
								value={scope}
								onChange={(e) => setScope(e.target.value)}
								maxLength={400}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="ct-next">{t("nextTestAt")}</Label>
							<Input
								id="ct-next"
								type="date"
								value={nextTestAt}
								onChange={(e) => setNextTestAt(e.target.value)}
							/>
						</div>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ct-notes">{t("notes")}</Label>
						<Textarea
							id="ct-notes"
							rows={3}
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
						<Button type="submit" disabled={pending}>
							{tc("save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
