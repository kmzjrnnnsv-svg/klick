"use client";

import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { setReportsTo } from "@/app/actions/role-board";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Button } from "@/components/ui/button";
import {
	DndShell,
	Draggable,
	type DropEvent,
	DropZone,
} from "@/components/ui/dnd";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";
import type { FunctionKey } from "@/db/schema/enums";
import { type ChartNode, wouldCycle } from "@/lib/compliance/org-chart";

// Organigramm bearbeiten (ADR-024, individueller Modus): eine Funktion auf
// eine andere ziehen = „berichtet an“; auf die Geschäftsleitung = direkt.
// Kreise lehnt Klick ab (wouldCycle). Dasselbe im Menü „…“.

const TOP: FunctionKey = "management_body";

export function OrgChartEditor({
	roots,
	labels,
	canEdit,
}: {
	roots: ChartNode[];
	labels: Record<string, string>;
	canEdit: boolean;
}) {
	const t = useTranslations("OrgChartEditor");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const label = (k: string) => labels[k] ?? k;
	// derzeitiger Baum (für die Kreisprüfung im Browser)
	const parents = new Map<FunctionKey, FunctionKey | null>();
	const all: ChartNode[] = [];
	const walk = (n: ChartNode) => {
		parents.set(n.function, n.parent);
		all.push(n);
		for (const c of n.children) walk(c);
	};
	for (const r of roots) walk(r);

	const move = (fn: FunctionKey, parent: FunctionKey | null) => {
		const target = parent === TOP ? null : parent;
		if (wouldCycle(parents, fn, target)) return void toast.error(t("cycle"));
		if ((parents.get(fn) ?? null) === parent) return;
		start(async () => {
			const res = await withStepUp(() => setReportsTo({ fn, parent: target }));
			if (!res.ok)
				return void toast.error(
					res.error === "cycle" ? t("cycle") : errorText(tc, res),
				);
			toast.success(
				target
					? t("moved", { fn: label(fn), parent: label(target) })
					: t("movedTop", { fn: label(fn) }),
			);
			router.refresh();
		});
	};
	function onDrop(e: DropEvent) {
		if (pending || !canEdit) return;
		move(e.drag.payload as FunctionKey, e.drop.payload as FunctionKey);
	}

	const node = (n: ChartNode, depth: number) => {
		const top = n.function === TOP;
		const options = all.filter(
			(o) =>
				o.function !== n.function &&
				!wouldCycle(
					parents,
					n.function,
					o.function === TOP ? null : o.function,
				),
		);
		const card = (
			<div
				className={`flex min-h-(--control-h) items-center gap-2 rounded-xl px-3 py-2 ${
					top ? "bg-primary/8" : "bg-muted/60"
				}`}
			>
				<div className="flex min-w-0 grow flex-col">
					<span className="hyphens-auto break-words font-medium text-subhead">
						{label(n.function)}
					</span>
					<span
						className={`text-footnote ${n.vacant ? "text-destructive" : "text-muted-foreground"}`}
					>
						{n.vacant ? t("vacant") : n.holders.join(", ")}
					</span>
				</div>
				{canEdit && !top && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								size="icon"
								variant="ghost"
								className="size-(--control-h-sm) shrink-0"
								aria-label={t("menu", { fn: label(n.function) })}
								onPointerDown={(e) => e.stopPropagation()}
								onKeyDown={(e) => e.stopPropagation()}
							>
								<MoreHorizontal />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							className="max-h-96 overflow-y-auto"
						>
							<DropdownMenuLabel className="text-muted-foreground text-footnote">
								{t("reportsTo")}
							</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{options.map((o) => (
								<DropdownMenuItem
									key={o.function}
									onSelect={() => move(n.function, o.function)}
								>
									{label(o.function)}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>
		);
		return (
			<li key={n.function} className="flex flex-col gap-2">
				<DropZone
					id={`chart:${n.function}`}
					target={{
						label: label(n.function),
						accepts: ["chart-node"],
						payload: n.function,
					}}
					disabled={!canEdit}
					className="rounded-xl"
				>
					{top || !canEdit ? (
						card
					) : (
						<Draggable
							id={`chart-node:${n.function}`}
							item={{
								kind: "chart-node",
								label: label(n.function),
								payload: n.function,
							}}
							disabled={pending}
						>
							{card}
						</Draggable>
					)}
				</DropZone>
				{n.children.length > 0 && (
					<ul
						className={`flex flex-col gap-2 border-border border-l pl-3 ${depth === 0 ? "ml-2" : "ml-3"}`}
					>
						{n.children.map((c) => node(c, depth + 1))}
					</ul>
				)}
			</li>
		);
	};

	return (
		<DndShell onDrop={onDrop}>
			<div className="flex flex-col gap-2 rounded-2xl bg-card p-4">
				{canEdit && (
					<p className="text-muted-foreground text-footnote">{t("hint")}</p>
				)}
				<ul className="flex flex-col gap-2">{roots.map((r) => node(r, 0))}</ul>
			</div>
		</DndShell>
	);
}
