"use client";

import {
	closestCorners,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { type ReactNode, useEffect, useState } from "react";
import { KanbanColumn } from "./column";
import { SortableCard } from "./sortable-card";

// Generisches Kanban (einziges Drag-and-drop in v1, UX-Leitlinie): Spalten
// mit sortierbaren Karten; Verschieben innerhalb/zwischen Spalten meldet
// Zielspalte und die neue Reihenfolge der Zielspalte an `onMove`.

export type KanbanItem = { id: string; column: string; sortOrder: number };

export type KanbanColumnDef = {
	key: string;
	title: string;
	hint?: string;
};

export function KanbanBoard<T extends KanbanItem>({
	columns,
	items,
	renderCard,
	onMove,
	disabled,
}: {
	columns: KanbanColumnDef[];
	items: T[];
	renderCard: (item: T, dragging: boolean) => ReactNode;
	onMove: (move: {
		id: string;
		column: string;
		orderedIds: string[];
	}) => Promise<void> | void;
	disabled?: boolean;
}) {
	const [local, setLocal] = useState<T[]>(items);
	const [activeId, setActiveId] = useState<string | null>(null);
	// Server-Stand übernehmen, wenn er sich ändert (router.refresh()).
	useEffect(() => setLocal(items), [items]);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);

	const byColumn = (col: string) =>
		local
			.filter((i) => i.column === col)
			.sort((a, b) => a.sortOrder - b.sortOrder);
	const findColumn = (id: string): string | undefined =>
		columns.some((c) => c.key === id)
			? id
			: local.find((i) => i.id === id)?.column;

	function onDragStart(e: DragStartEvent) {
		setActiveId(String(e.active.id));
	}

	// Beim Überfahren einer fremden Spalte die Karte dorthin verschieben, damit
	// sie sich einsortieren lässt (dnd-kit-Standardmuster).
	function onDragOver(e: DragOverEvent) {
		const { active, over } = e;
		if (!over) return;
		const from = findColumn(String(active.id));
		const to = findColumn(String(over.id));
		if (!from || !to || from === to) return;
		setLocal((prev) => {
			const moving = prev.find((i) => i.id === active.id);
			if (!moving) return prev;
			const target = prev
				.filter((i) => i.column === to && i.id !== active.id)
				.sort((a, b) => a.sortOrder - b.sortOrder);
			const overIndex = target.findIndex((i) => i.id === over.id);
			const insertAt = overIndex >= 0 ? overIndex : target.length;
			const ordered = [...target];
			ordered.splice(insertAt, 0, { ...moving, column: to });
			const others = prev.filter((i) => i.column !== to && i.id !== active.id);
			return [
				...others,
				...ordered.map((i, idx) => ({ ...i, column: to, sortOrder: idx * 10 })),
			];
		});
	}

	async function onDragEnd(e: DragEndEvent) {
		const { active, over } = e;
		setActiveId(null);
		if (!over) return;
		const col = findColumn(String(over.id)) ?? findColumn(String(active.id));
		if (!col) return;
		const current = byColumn(col);
		const fromIndex = current.findIndex((i) => i.id === active.id);
		const toIndex = current.findIndex((i) => i.id === over.id);
		let ordered = current;
		if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
			ordered = arrayMove(current, fromIndex, toIndex);
			setLocal((prev) => [
				...prev.filter((i) => i.column !== col),
				...ordered.map((i, idx) => ({ ...i, sortOrder: idx * 10 })),
			]);
		}
		await onMove({
			id: String(active.id),
			column: col,
			orderedIds: ordered.map((i) => i.id),
		});
	}

	const active = activeId ? local.find((i) => i.id === activeId) : null;

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCorners}
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDragEnd={onDragEnd}
			onDragCancel={() => setActiveId(null)}
		>
			<div className="grid gap-4 md:grid-cols-3">
				{columns.map((col) => {
					const list = byColumn(col.key);
					return (
						<KanbanColumn
							key={col.key}
							id={col.key}
							title={col.title}
							hint={col.hint}
							count={list.length}
							itemIds={list.map((i) => i.id)}
						>
							{list.map((item) => (
								<SortableCard key={item.id} id={item.id} disabled={disabled}>
									{renderCard(item, item.id === activeId)}
								</SortableCard>
							))}
						</KanbanColumn>
					);
				})}
			</div>
			<DragOverlay>
				{active ? (
					<div className="rounded-md border bg-card p-3 shadow-lg">
						{renderCard(active, true)}
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}
