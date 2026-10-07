"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SortableCard({
	id,
	disabled,
	children,
}: {
	id: string;
	disabled?: boolean;
	children: ReactNode;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id, disabled });
	return (
		<div
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={cn(
				"rounded-md border bg-card p-3 text-sm shadow-xs",
				!disabled && "cursor-grab active:cursor-grabbing",
				isDragging && "opacity-40",
			)}
			{...attributes}
			{...listeners}
		>
			{children}
		</div>
	);
}
