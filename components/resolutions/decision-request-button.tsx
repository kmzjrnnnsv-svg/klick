"use client";

import { Gavel } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createDecisionRequest } from "@/app/actions/decisions";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import type { EntityKind } from "@/db/schema/enums";

// „Entscheidung anfragen“ (E2): Frage an die Geschäftsleitung mit
// Ausgangslage, Empfehlung, Optionen und Frist. Bezug zur Entität und zu
// Rahmenwerk-Anforderungen ist vorbelegt; die Entscheidung wird ein
// Beschluss.
export function DecisionRequestButton({
	linkedEntityType,
	linkedEntityId,
	defaultQuestion,
	refs,
	soloHint,
	variant = "outline",
}: {
	linkedEntityType?: EntityKind;
	linkedEntityId?: string;
	defaultQuestion?: string;
	// vorbelegte Anforderungen (Anzeige; der Server leitet sie erneut ab)
	refs?: { frameworks: string[]; requirementKeys: string[] };
	soloHint?: boolean;
	variant?: "outline" | "brown";
}) {
	const t = useTranslations("Decisions");
	const tc = useTranslations("Common");
	const tr = useTranslations("Resolutions");
	const ts = useTranslations("Status");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [question, setQuestion] = useState(defaultQuestion ?? "");
	const [context, setContext] = useState("");
	const [recommendation, setRecommendation] = useState("");
	const [options, setOptions] = useState("");
	const [dueAt, setDueAt] = useState("");
	const [solo, setSolo] = useState("");

	function submit(e: React.FormEvent) {
		e.preventDefault();
		start(async () => {
			const res = await createDecisionRequest({
				question,
				context: context || undefined,
				recommendation: recommendation || undefined,
				options: options
					.split("\n")
					.map((o) => o.trim())
					.filter(Boolean),
				dueAt: dueAt || undefined,
				linkedEntityType,
				linkedEntityId,
				requirementKeys: refs?.requirementKeys ?? [],
				selfApprovalReason: solo || undefined,
			});
			if (!res.ok) {
				toast.error(
					res.error === "no_approver" ||
						res.error === "solo_reason_required" ||
						res.error === "solo_not_allowed"
						? ts(`approvalError_${res.error}`)
						: tc("error"),
				);
				return;
			}
			toast.success(
				res.data.status === "approved"
					? t("createdSolo", { code: res.data.code })
					: t("created", { code: res.data.code }),
			);
			setOpen(false);
			setQuestion(defaultQuestion ?? "");
			setContext("");
			setRecommendation("");
			setOptions("");
			setDueAt("");
			router.refresh();
		});
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant={variant} size="sm">
					<Gavel className="size-3.5" aria-hidden />
					{t("ask")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<form onSubmit={submit} className="flex flex-col gap-4">
					<DialogHeader>
						<DialogTitle>{t("title")}</DialogTitle>
						<DialogDescription>{t("lead")}</DialogDescription>
					</DialogHeader>
					<div className="grid gap-2">
						<Label htmlFor="dr-q">{t("question")}</Label>
						<Input
							id="dr-q"
							required
							minLength={5}
							maxLength={300}
							value={question}
							onChange={(e) => setQuestion(e.target.value)}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="dr-ctx">{t("context")}</Label>
						<Textarea
							id="dr-ctx"
							rows={3}
							value={context}
							onChange={(e) => setContext(e.target.value)}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="dr-rec">{t("recommendation")}</Label>
						<Textarea
							id="dr-rec"
							rows={2}
							value={recommendation}
							onChange={(e) => setRecommendation(e.target.value)}
						/>
					</div>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="grid gap-2">
							<Label htmlFor="dr-opt">{t("options")}</Label>
							<Textarea
								id="dr-opt"
								rows={3}
								placeholder={t("optionsHint")}
								value={options}
								onChange={(e) => setOptions(e.target.value)}
							/>
						</div>
						<div className="grid content-start gap-2">
							<Label htmlFor="dr-due">{t("dueAt")}</Label>
							<Input
								id="dr-due"
								type="date"
								value={dueAt}
								onChange={(e) => setDueAt(e.target.value)}
							/>
						</div>
					</div>
					{refs && refs.requirementKeys.length > 0 && (
						<div className="flex flex-col gap-1">
							<p className="text-muted-foreground text-xs">{t("refs")}</p>
							<div className="flex flex-wrap gap-1">
								{refs.requirementKeys.map((k) => (
									<Badge key={k} variant="muted" className="font-mono">
										{k.replace(":", " ")}
									</Badge>
								))}
							</div>
						</div>
					)}
					{soloHint && (
						<div className="grid gap-2">
							<Label htmlFor="dr-solo">{tr("soloReason")}</Label>
							<Textarea
								id="dr-solo"
								rows={2}
								value={solo}
								onChange={(e) => setSolo(e.target.value)}
							/>
						</div>
					)}
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button
							type="submit"
							disabled={pending || question.trim().length < 5}
						>
							{t("submit")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
