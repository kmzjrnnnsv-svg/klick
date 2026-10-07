"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
	useTransition,
} from "react";
import { toast } from "sonner";
import { bulkUpdateControls } from "@/app/actions/controls";
import type { MemberOption } from "@/components/entity/owner-assignee";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

// Bulk-Aktionen im Register: Auswahl je Zeile (Checkbox stoppt den Zeilen-
// Link), schwebende Leiste mit Status/Zuweisung. Jede ID wird serverseitig
// über RLS geprüft; nicht erlaubte Übergänge werden übersprungen und gezählt.

type Ctx = {
	selected: ReadonlySet<string>;
	toggle: (id: string) => void;
	clear: () => void;
};
const BulkContext = createContext<Ctx | null>(null);

export function BulkProvider({ children }: { children: ReactNode }) {
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const toggle = useCallback((id: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);
	const clear = useCallback(() => setSelected(new Set()), []);
	const value = useMemo(
		() => ({ selected, toggle, clear }),
		[selected, toggle, clear],
	);
	return <BulkContext.Provider value={value}>{children}</BulkContext.Provider>;
}

export function BulkCheckbox({ id, label }: { id: string; label: string }) {
	const ctx = useContext(BulkContext);
	if (!ctx) return null;
	return (
		// Klick darf nicht zur Detailseite navigieren (Zeile ist ein Link).
		<Checkbox
			checked={ctx.selected.has(id)}
			aria-label={label}
			onClick={(e) => {
				e.stopPropagation();
				e.preventDefault();
				ctx.toggle(id);
			}}
			onKeyDown={(e) => {
				if (e.key === " " || e.key === "Enter") {
					e.stopPropagation();
					e.preventDefault();
					ctx.toggle(id);
				}
			}}
		/>
	);
}

export function BulkBar({ members }: { members: MemberOption[] }) {
	const ctx = useContext(BulkContext);
	const t = useTranslations("Controls");
	const ts = useTranslations("Status");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [status, setStatus] = useState<string>("none");
	const [owner, setOwner] = useState<string>("none");
	const [assignee, setAssignee] = useState<string>("none");
	if (!ctx || ctx.selected.size === 0) return null;
	const apply = () =>
		start(async () => {
			const res = await bulkUpdateControls({
				implementationIds: [...ctx.selected],
				status: status === "none" ? undefined : status,
				ownerUserId:
					owner === "none" ? undefined : owner === "clear" ? null : owner,
				assigneeUserId:
					assignee === "none"
						? undefined
						: assignee === "clear"
							? null
							: assignee,
			});
			if (!res.ok) return void toast.error(tc("error"));
			toast.success(
				t("bulkDone", { n: res.data.updated, skipped: res.data.skipped }),
			);
			ctx.clear();
			router.refresh();
		});
	return (
		<div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-md border bg-card p-3 shadow-lg">
			<span className="font-medium text-sm">
				{t("bulkSelected", { n: ctx.selected.size })}
			</span>
			<Select value={status} onValueChange={setStatus}>
				<SelectTrigger className="w-44">
					<SelectValue placeholder={t("bulkStatus")} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="none">{t("bulkStatus")}</SelectItem>
					<SelectItem value="planned">{ts("planned")}</SelectItem>
					<SelectItem value="in_progress">{ts("inProgress")}</SelectItem>
					<SelectItem value="not_started">{ts("notStarted")}</SelectItem>
				</SelectContent>
			</Select>
			<Select value={owner} onValueChange={setOwner}>
				<SelectTrigger className="w-48">
					<SelectValue placeholder={t("bulkOwner")} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="none">{t("bulkOwner")}</SelectItem>
					<SelectItem value="clear">—</SelectItem>
					{members.map((m) => (
						<SelectItem key={m.userId} value={m.userId}>
							{m.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select value={assignee} onValueChange={setAssignee}>
				<SelectTrigger className="w-48">
					<SelectValue placeholder={t("bulkAssignee")} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="none">{t("bulkAssignee")}</SelectItem>
					<SelectItem value="clear">—</SelectItem>
					{members.map((m) => (
						<SelectItem key={m.userId} value={m.userId}>
							{m.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button
				size="sm"
				variant="brown"
				disabled={
					pending ||
					(status === "none" && owner === "none" && assignee === "none")
				}
				onClick={apply}
			>
				{t("bulkApply")}
			</Button>
			<Button size="sm" variant="ghost" onClick={ctx.clear}>
				{tc("cancel")}
			</Button>
		</div>
	);
}
