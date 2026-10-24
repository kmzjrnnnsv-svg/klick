"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function KanbanColumn({
	id,
	title,
	hint,
	count,
	itemIds,
	children,
}: {
	id: string;
	title: string;
	hint?: string;
	count: number;
	itemIds: string[];
	children: ReactNode;
}) {
	const { setNodeRef, isOver } = useDroppable({ id });
	return (
		<section
			ref={setNodeRef}
			aria-label={title}
			className={cn(
				"flex min-h-40 flex-col gap-2 rounded-2xl bg-muted/60 p-3 transition-colors",
				isOver && "bg-accent ring-2 ring-primary/40",
			)}
		>
			<header className="flex items-baseline justify-between gap-2">
				<h2 className="font-semibold text-foreground text-subhead">
					{title}
				</h2>
				<span className="tabular text-footnote text-muted-foreground">{count}</span>
			</header>
			{hint && <p className="text-footnote text-muted-foreground">{hint}</p>}
			<SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
				<div className="flex flex-col gap-2">{children}</div>
			</SortableContext>
		</section>
	);
}
