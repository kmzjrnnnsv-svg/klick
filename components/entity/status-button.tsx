"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setControlStatus } from "@/app/actions/controls";
import { setTaskStatus } from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import type { ImplStatus } from "@/db/schema/enums";
import { CONTROL_STATUS } from "@/lib/entities/control";
import { nextTransitions } from "@/lib/entities/status-machine";
import { TASK_STATUS, type TaskStatus } from "@/lib/entities/task";
import type { StatusMachine } from "@/lib/entities/types";
import { StatusBadge } from "./status-badge";

type Target =
	| { kind: "control"; implementationId: string; status: ImplStatus }
	| { kind: "task"; taskId: string; status: TaskStatus };

// Status wechselt per Button mit dem nächsten sinnvollen Übergang; weitere
// Übergänge im Menü. Begründungspflichtige Übergänge öffnen einen Dialog.
// Beim Control zeigt der Toast „Erfüllt damit …" plus Abdeckungsänderung.
export function StatusButton({
	target,
	frameworkNames,
	disabled,
}: {
	target: Target;
	frameworkNames?: Record<string, string>;
	disabled?: boolean;
}) {
	const t = useTranslations("Status");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [noteFor, setNoteFor] = useState<string | null>(null);
	const [note, setNote] = useState("");

	const machine = (
		target.kind === "control" ? CONTROL_STATUS : TASK_STATUS
	) as StatusMachine<string>;
	const options = nextTransitions(machine, target.status, { hasNote: true });
	const primary = options.find((o) => o.primary) ?? options[0];
	const rest = options.filter((o) => o !== primary);

	function run(to: string, withNote?: string) {
		start(async () => {
			if (target.kind === "control") {
				const res = await setControlStatus({
					implementationId: target.implementationId,
					status: to,
					note: withNote,
				});
				if (!res.ok) {
					toast.error(
						res.error.startsWith("transition_")
							? t("transitionBlocked")
							: tc("error"),
					);
					return;
				}
				const sat = res.data.satisfied;
				const fw = res.data.frameworks.filter((f) => f.before !== f.after);
				if (sat.length > 0 || fw.length > 0) {
					const names = frameworkNames ?? {};
					const satText = sat
						.slice(0, 4)
						.map((s) => `${names[s.framework] ?? s.framework} ${s.code}`)
						.join(" · ");
					const fwText = fw
						.map(
							(f) =>
								`${names[f.framework] ?? f.framework} ${f.before ?? 0} % → ${f.after ?? 0} %`,
						)
						.join(" · ");
					toast.success(
						sat.length > 0
							? t("satisfies", { list: satText })
							: t("statusChanged"),
						{ description: fwText || undefined, duration: 7000 },
					);
				} else {
					toast.success(t("statusChanged"));
				}
			} else {
				const res = await setTaskStatus({
					taskId: target.taskId,
					status: to,
					note: withNote,
				});
				if (!res.ok) {
					toast.error(
						res.error.startsWith("transition_")
							? t("transitionBlocked")
							: tc("error"),
					);
					return;
				}
				toast.success(t("statusChanged"));
			}
			setNoteFor(null);
			setNote("");
			router.refresh();
		});
	}

	function choose(to: string, requiresNote: boolean) {
		if (requiresNote) {
			setNoteFor(to);
			return;
		}
		run(to);
	}

	return (
		<div className="flex items-center gap-2">
			<StatusBadge
				machine={machine}
				status={target.status}
				label={t(machine.labelKey[target.status] as "notStarted")}
			/>
			{!disabled && primary && (
				<div className="flex">
					<Button
						size="sm"
						disabled={pending}
						onClick={() => choose(primary.to, primary.requires === "note")}
						className={rest.length > 0 ? "rounded-r-none" : undefined}
					>
						{t(primary.labelKey as "plan")}
					</Button>
					{rest.length > 0 && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									size="sm"
									variant="default"
									disabled={pending}
									className="rounded-l-none border-primary-foreground/20 border-l px-2"
									aria-label={t("moreTransitions")}
								>
									<ChevronDown />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{rest.map((o) => (
									<DropdownMenuItem
										key={o.to}
										onSelect={() => choose(o.to, o.requires === "note")}
									>
										{t(o.labelKey as "plan")}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
			)}
			<Dialog
				open={noteFor !== null}
				onOpenChange={(o) => !o && setNoteFor(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("noteTitle")}</DialogTitle>
						<DialogDescription>{t("noteLead")}</DialogDescription>
					</DialogHeader>
					<Textarea
						value={note}
						onChange={(e) => setNote(e.target.value)}
						rows={4}
						autoFocus
						placeholder={t("notePlaceholder")}
					/>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setNoteFor(null)}>
							{tc("cancel")}
						</Button>
						<Button
							disabled={pending || note.trim().length < 3}
							onClick={() => noteFor && run(noteFor, note)}
						>
							{tc("save")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
