"use client";

import { useDroppable } from "@dnd-kit/core";

export function KanbanColumn({
	statusKey,
	label,
	count,
	children,
}: {
	statusKey: string;
	label: string;
	count: number;
	children: React.ReactNode;
}) {
	const { setNodeRef, isOver } = useDroppable({ id: `col-${statusKey}` });
	return (
		<div
			ref={setNodeRef}
			className={`flex min-w-[220px] flex-col rounded-lg border border-border bg-muted/30 p-2 transition-colors ${
				isOver ? "border-primary bg-primary/5" : ""
			}`}
		>
			<div className="mb-2 flex items-baseline justify-between px-1">
				<h3 className="font-medium text-xs uppercase tracking-wide">{label}</h3>
				<span className="font-mono text-[11px] text-muted-foreground tabular-nums">
					{count}
				</span>
			</div>
			<div className="flex flex-col gap-2">{children}</div>
		</div>
	);
}
