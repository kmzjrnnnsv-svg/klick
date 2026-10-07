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
				"flex min-h-40 flex-col gap-2 rounded-md border bg-muted/30 p-3 transition-colors",
				isOver && "border-primary/60 bg-primary/5",
			)}
		>
			<header className="flex items-baseline justify-between gap-2">
				<h2 className="lv-eyebrow text-[0.6rem] text-muted-foreground">
					{title}
				</h2>
				<span className="text-muted-foreground text-xs">{count}</span>
			</header>
			{hint && <p className="text-muted-foreground text-xs">{hint}</p>}
			<SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
				<div className="flex flex-col gap-2">{children}</div>
			</SortableContext>
		</section>
	);
}
