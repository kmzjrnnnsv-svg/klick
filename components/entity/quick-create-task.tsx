"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTask } from "@/app/actions/tasks";
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
import type { EntityKind } from "@/db/schema/enums";
import type { MemberOption } from "./owner-assignee";

// „+ Aufgabe": höchstens vier Felder (Titel, Verantwortlich, Fällig, Priorität).
export function QuickCreateTask({
	entityType,
	entityId,
	members,
	defaultAssignee,
	sourceKind = "manual",
	label,
	variant = "outline",
}: {
	entityType?: EntityKind;
	entityId?: string;
	members: MemberOption[];
	defaultAssignee?: string;
	sourceKind?:
		| "manual"
		| "remediation"
		| "review"
		| "evidence_request"
		| "treatment"
		| "incident_action";
	label?: string;
	variant?: "outline" | "brown" | "default" | "ghost";
}) {
	const t = useTranslations("Tasks");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [title, setTitle] = useState("");
	const [assignee, setAssignee] = useState(defaultAssignee ?? "");
	const [dueAt, setDueAt] = useState("");
	const [priority, setPriority] = useState<
		"low" | "normal" | "high" | "critical"
	>("normal");

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant={variant}>
					<Plus />
					{label ?? t("new")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await createTask({
								title,
								assigneeUserId: assignee || null,
								dueAt: dueAt || null,
								priority,
								entityType,
								entityId,
								sourceKind,
							});
							if (!res.ok) {
								toast.error(tc("error"));
								return;
							}
							toast.success(t("created"));
							setOpen(false);
							setTitle("");
							setDueAt("");
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("new")}</DialogTitle>
						<DialogDescription>{t("quickLead")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="task-title">{t("title")}</Label>
						<Input
							id="task-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							required
							maxLength={200}
							autoFocus
						/>
					</div>
					<div className="grid gap-4 sm:grid-cols-3">
						<div className="flex flex-col gap-1.5">
							<Label>{t("assignee")}</Label>
							<Select
								value={assignee || "me"}
								onValueChange={(v) => setAssignee(v === "me" ? "" : v)}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="me">{t("me")}</SelectItem>
									{members.map((m) => (
										<SelectItem key={m.userId} value={m.userId}>
											{m.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="task-due">{t("dueAt")}</Label>
							<Input
								id="task-due"
								type="date"
								value={dueAt}
								onChange={(e) => setDueAt(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("priority")}</Label>
							<Select
								value={priority}
								onValueChange={(v) => setPriority(v as typeof priority)}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{(["low", "normal", "high", "critical"] as const).map((p) => (
										<SelectItem key={p} value={p}>
											{t(`priority_${p}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
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
							disabled={pending || title.trim().length === 0}
						>
							{tc("create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
