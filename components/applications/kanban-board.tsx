"use client";

import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	PointerSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setApplicationStatus } from "@/app/actions/applications";
import { KanbanCard } from "@/components/applications/kanban-card";
import { KanbanColumn } from "@/components/applications/kanban-column";

export type BoardApp = {
	id: string;
	jobId: string;
	jobTitle: string;
	candidateName: string | null;
	candidateInitials: string;
	matchScore: number | null;
	daysInStatus: number;
	status: string;
	createdAt: Date;
};

const COLUMNS: { key: string; label: string }[] = [
	{ key: "submitted", label: "Eingereicht" },
	{ key: "seen", label: "Gesehen" },
	{ key: "in_review", label: "In Prüfung" },
	{ key: "shortlisted", label: "Shortlist" },
	{ key: "interview", label: "Interview" },
	{ key: "offer", label: "Angebot" },
];

export function KanbanBoard({ initial }: { initial: BoardApp[] }) {
	const t = useTranslations("ApplicationsBoard");
	const [apps, setApps] = useState<BoardApp[]>(initial);
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 200, tolerance: 5 },
		}),
	);

	function handleDragEnd(e: DragEndEvent) {
		const appId = e.active.id as string;
		const overId = e.over?.id as string | undefined;
		if (!overId) return;
		const newStatus = overId.startsWith("col-")
			? overId.slice(4)
			: apps.find((a) => a.id === overId)?.status;
		if (!newStatus) return;
		const current = apps.find((a) => a.id === appId);
		if (!current || current.status === newStatus) return;

		// Optimistic update — Rollback bei Fehler
		const prev = apps;
		setApps((list) =>
			list.map((a) =>
				a.id === appId ? { ...a, status: newStatus, daysInStatus: 0 } : a,
			),
		);
		setError(null);
		startTransition(async () => {
			const r = await setApplicationStatus({
				applicationId: appId,
				status: newStatus as never,
			});
			if (!r.ok) {
				setApps(prev);
				setError(r.error);
			}
		});
	}

	return (
		<div className="space-y-3">
			{error && (
				<p className="rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
					{error}
				</p>
			)}
			{isPending && (
				<p className="inline-flex items-center gap-2 text-muted-foreground text-xs">
					<Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
					{t("saving")}
				</p>
			)}
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragEnd={handleDragEnd}
			>
				<div className="grid gap-3 overflow-x-auto pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
					{COLUMNS.map((col) => {
						const items = apps.filter((a) => a.status === col.key);
						return (
							<KanbanColumn
								key={col.key}
								statusKey={col.key}
								label={col.label}
								count={items.length}
							>
								<SortableContext items={items.map((a) => a.id)}>
									{items.length === 0 ? (
										<p className="rounded-sm border border-border border-dashed p-3 text-center text-muted-foreground text-xs">
											{t("empty")}
										</p>
									) : (
										items.map((a) => <KanbanCard key={a.id} app={a} />)
									)}
								</SortableContext>
							</KanbanColumn>
						);
					})}
				</div>
			</DndContext>
		</div>
	);
}
