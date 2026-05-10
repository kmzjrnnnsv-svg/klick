"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import type { BoardApp } from "./kanban-board";

export function KanbanCard({ app }: { app: BoardApp }) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
		useSortable({ id: app.id });
	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.4 : 1,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			className="cursor-grab rounded-md border border-border bg-background p-2.5 text-xs shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
		>
			<div className="flex items-baseline gap-2">
				<span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[10px] text-primary">
					{app.candidateInitials}
				</span>
				<span className="flex-1 truncate font-medium">
					{app.candidateName ?? `Kandidat #${app.id.slice(0, 6)}`}
				</span>
				{app.matchScore !== null && (
					<span className="font-mono text-[10px] text-muted-foreground tabular-nums">
						{app.matchScore}%
					</span>
				)}
			</div>
			<p className="mt-1 truncate text-muted-foreground text-[10px]">
				{app.jobTitle}
			</p>
			<div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
				<span className="font-mono">
					{app.daysInStatus === 0 ? "heute" : `${app.daysInStatus} T`}
				</span>
				<Link
					href={`/jobs/${app.jobId}/applications/${app.id}`}
					onClick={(e) => e.stopPropagation()}
					onPointerDown={(e) => e.stopPropagation()}
					className="text-primary hover:underline"
				>
					<ExternalLink className="h-3 w-3" strokeWidth={1.5} />
				</Link>
			</div>
		</div>
	);
}
