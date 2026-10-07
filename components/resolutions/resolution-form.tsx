"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createResolution } from "@/app/actions/resolutions";
import type { MemberOption } from "@/components/entity/owner-assignee";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export type RequiredOption = {
	code: string;
	title: string;
	legalBasis: string;
};

const BODIES = ["management", "supervisory", "shareholders"] as const;

// Beschluss anlegen — optional vorbefüllt aus einem Pflichtbeschluss.
export function ResolutionForm({
	members,
	required,
	preset,
	soloHint,
	trigger,
}: {
	members: MemberOption[];
	required: RequiredOption[];
	preset?: RequiredOption;
	soloHint?: boolean;
	trigger?: "button" | "link";
}) {
	const t = useTranslations("Resolutions");
	const ts = useTranslations("Status");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [subject, setSubject] = useState(preset?.title ?? "");
	const [decisionText, setDecisionText] = useState("");
	const [body, setBody] = useState<(typeof BODIES)[number]>("management");
	const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
	const [legalBasis, setLegalBasis] = useState(preset?.legalBasis ?? "");
	const [requiredCode, setRequiredCode] = useState<string>(
		preset?.code ?? "none",
	);
	const [attendees, setAttendees] = useState<Set<string>>(new Set());
	const [withApproval, setWithApproval] = useState(true);
	const [reason, setReason] = useState("");

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{trigger === "link" ? (
					<Button
						size="sm"
						variant="outline"
						className="normal-case tracking-normal"
					>
						{t("recordFor")}
					</Button>
				) : (
					<Button size="sm" variant="brown">
						<Plus />
						{t("new")}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await createResolution({
								subject,
								decisionText,
								body,
								date,
								legalBasis: legalBasis || undefined,
								requiredCode: requiredCode === "none" ? null : requiredCode,
								attendeeUserIds: [...attendees],
								requestApproval: withApproval,
								selfApprovalReason: reason || undefined,
							});
							if (!res.ok)
								return void toast.error(
									res.error.startsWith("solo_") || res.error === "no_approver"
										? ts(
												`approvalError_${res.error}` as "approvalError_no_approver",
											)
										: tc("error"),
								);
							toast.success(
								res.data.approval === "pending"
									? ts("approvalRequested")
									: t("created", { n: res.data.number }),
							);
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("new")}</DialogTitle>
						<DialogDescription>{t("formLead")}</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5 sm:col-span-2">
							<Label htmlFor="rs-subject">{t("subject")}</Label>
							<Input
								id="rs-subject"
								value={subject}
								onChange={(e) => setSubject(e.target.value)}
								required
								maxLength={200}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("required")}</Label>
							<Select
								value={requiredCode}
								onValueChange={(v) => {
									setRequiredCode(v);
									const r = required.find((x) => x.code === v);
									if (r) {
										if (!subject) setSubject(r.title);
										if (!legalBasis) setLegalBasis(r.legalBasis);
									}
								}}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">{t("noRequired")}</SelectItem>
									{required.map((r) => (
										<SelectItem key={r.code} value={r.code}>
											{r.title}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("body")}</Label>
							<Select
								value={body}
								onValueChange={(v) => setBody(v as (typeof BODIES)[number])}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{BODIES.map((b) => (
										<SelectItem key={b} value={b}>
											{t(`body_${b}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="rs-date">{t("date")}</Label>
							<Input
								id="rs-date"
								type="date"
								value={date}
								onChange={(e) => setDate(e.target.value)}
								required
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="rs-legal">{t("legalBasis")}</Label>
							<Input
								id="rs-legal"
								value={legalBasis}
								onChange={(e) => setLegalBasis(e.target.value)}
								maxLength={300}
							/>
						</div>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="rs-text">{t("decisionText")}</Label>
						<Textarea
							id="rs-text"
							rows={5}
							value={decisionText}
							onChange={(e) => setDecisionText(e.target.value)}
							required
						/>
					</div>
					<fieldset className="flex flex-wrap gap-3 text-sm">
						<legend className="lv-eyebrow mb-1 text-[0.52rem] text-muted-foreground">
							{t("attendees")}
						</legend>
						{members.map((m) => (
							<label key={m.userId} className="flex items-center gap-2">
								<Checkbox
									checked={attendees.has(m.userId)}
									onCheckedChange={(v) => {
										const next = new Set(attendees);
										if (v) next.add(m.userId);
										else next.delete(m.userId);
										setAttendees(next);
									}}
								/>
								{m.name}
							</label>
						))}
					</fieldset>
					<div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
						<label className="flex items-center justify-between gap-3">
							<span>
								<span className="font-medium">{t("withApproval")}</span>
								<span className="block text-muted-foreground text-xs">
									{t("withApprovalLead")}
								</span>
							</span>
							<Switch
								checked={withApproval}
								onCheckedChange={setWithApproval}
							/>
						</label>
						{withApproval && soloHint && (
							<Input
								placeholder={t("soloReason")}
								value={reason}
								onChange={(e) => setReason(e.target.value)}
							/>
						)}
					</div>
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
							disabled={
								pending || !subject.trim() || decisionText.trim().length < 5
							}
						>
							{tc("save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
