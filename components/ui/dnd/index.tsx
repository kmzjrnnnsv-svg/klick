"use client";

import {
	type Announcements,
	type CollisionDetection,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	pointerWithin,
	rectIntersection,
	TouchSensor,
	useDndContext,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import {
	type KeyboardEvent,
	type ReactNode,
	useEffect,
	useId,
	useMemo,
	useState,
} from "react";
import { cn } from "@/lib/utils";

// Gemeinsame Hülle für Ziehen und Ablegen (ADR-024: Rollen-Tafel,
// Organigramm, Freigabe-Designer). Maus, Touch (200 ms halten, damit
// Scrollen geht) und Tastatur (Leertaste nehmen, Pfeile, Leertaste ablegen,
// Escape). Ansagen auf Deutsch; bei „Bewegung reduzieren“ ohne Animation.
// Ziehen ist nie der einzige Weg: jede Stelle bietet dasselbe über ein Menü
// (HIG, WCAG 2.5.7).

export type DragItem = { kind: string; label: string; payload?: unknown };
export type DropTarget = {
	label: string;
	accepts: readonly string[];
	payload?: unknown;
};

export type DropEvent = {
	drag: DragItem;
	drop: DropTarget;
	dragId: string;
	dropId: string;
};

const dragOf = (d: unknown) => d as DragItem | undefined;
const dropOf = (d: unknown) => d as DropTarget | undefined;

// erst Zeiger im Ziel, sonst Überschneidung (Tastatur, Touch am Rand)
const collision: CollisionDetection = (args) => {
	const hits = pointerWithin(args);
	return hits.length > 0 ? hits : rectIntersection(args);
};

function useReducedMotion(): boolean {
	const [reduced, setReduced] = useState(false);
	useEffect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		setReduced(mq.matches);
		const on = () => setReduced(mq.matches);
		mq.addEventListener("change", on);
		return () => mq.removeEventListener("change", on);
	}, []);
	return reduced;
}

export function DndShell({
	onDrop,
	overlay,
	children,
}: {
	onDrop: (e: DropEvent) => void;
	overlay?: (item: DragItem) => ReactNode;
	children: ReactNode;
}) {
	const t = useTranslations("Dnd");
	// feste ID: sonst weichen die aria-describedby-IDs zwischen Server und
	// Browser ab (Hydration)
	const id = useId();
	const reduced = useReducedMotion();
	const [active, setActive] = useState<DragItem | null>(null);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 200, tolerance: 6 },
		}),
		useSensor(KeyboardSensor),
	);
	const announcements = useMemo<Announcements>(
		() => ({
			onDragStart: ({ active }) =>
				t("picked", { item: dragOf(active.data.current)?.label ?? "" }),
			onDragOver: ({ active, over }) => {
				const item = dragOf(active.data.current)?.label ?? "";
				const target = dropOf(over?.data.current);
				return target
					? target.accepts.includes(dragOf(active.data.current)?.kind ?? "")
						? t("over", { item, target: target.label })
						: t("notHere", { target: target.label })
					: t("nowhere", { item });
			},
			onDragEnd: ({ active, over }) => {
				const item = dragOf(active.data.current)?.label ?? "";
				const target = dropOf(over?.data.current);
				return target
					? t("dropped", { item, target: target.label })
					: t("cancelled", { item });
			},
			onDragCancel: ({ active }) =>
				t("cancelled", { item: dragOf(active.data.current)?.label ?? "" }),
		}),
		[t],
	);

	function start(e: DragStartEvent) {
		setActive(dragOf(e.active.data.current) ?? null);
	}
	function end(e: DragEndEvent) {
		setActive(null);
		const drag = dragOf(e.active.data.current);
		const drop = dropOf(e.over?.data.current);
		if (!drag || !drop || !e.over) return;
		if (!drop.accepts.includes(drag.kind)) return;
		onDrop({
			drag,
			drop,
			dragId: String(e.active.id),
			dropId: String(e.over.id),
		});
	}

	return (
		<DndContext
			id={id}
			sensors={sensors}
			collisionDetection={collision}
			onDragStart={start}
			onDragEnd={end}
			onDragCancel={() => setActive(null)}
			accessibility={{
				announcements,
				screenReaderInstructions: { draggable: t("instructions") },
			}}
		>
			{children}
			<DragOverlay dropAnimation={reduced ? null : undefined}>
				{active ? (
					<div className="pointer-events-none rounded-full bg-card px-3 py-2 text-subhead shadow-lg ring-1 ring-border">
						{overlay ? overlay(active) : active.label}
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}

// Ziehbares Element. Tastatur-Ziehen nur, wenn das Element selbst den Fokus
// hat — Enter/Leertaste in Knöpfen darin bleiben Klicks.
export function Draggable({
	id,
	item,
	disabled,
	className,
	ariaLabel,
	children,
}: {
	id: string;
	item: DragItem;
	disabled?: boolean;
	className?: string;
	// nur für Griffe ohne eigenen Text (z. B. „Stufe 2 verschieben“)
	ariaLabel?: string;
	children: ReactNode;
}) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id,
		data: item,
		disabled,
	});
	const { onKeyDown, ...pointer } = listeners ?? {};
	return (
		<div
			ref={setNodeRef}
			className={cn(
				"touch-manipulation outline-none focus-visible:ring-2 focus-visible:ring-ring",
				!disabled && "cursor-grab active:cursor-grabbing",
				isDragging && "opacity-40",
				className,
			)}
			{...attributes}
			aria-roledescription={attributes["aria-roledescription"]}
			aria-label={ariaLabel}
			{...pointer}
			onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
				if (e.target === e.currentTarget) onKeyDown?.(e);
			}}
		>
			{children}
		</div>
	);
}

// Ablagefläche: zeigt beim Ziehen, ob das gezogene Element hier passt
// (Rahmen + Tönung, nie nur Farbe — der Text der Ansage nennt es auch)
export function DropZone({
	id,
	target,
	disabled,
	className,
	children,
}: {
	id: string;
	target: DropTarget;
	disabled?: boolean;
	className?: string;
	children: ReactNode;
}) {
	const { active } = useDndContext();
	const { setNodeRef, isOver } = useDroppable({
		id,
		data: target,
		disabled,
	});
	const kind = dragOf(active?.data.current)?.kind;
	const fits = Boolean(kind && target.accepts.includes(kind)) && !disabled;
	return (
		<div
			ref={setNodeRef}
			data-drop-state={active ? (fits ? (isOver ? "over" : "ready") : "no") : undefined}
			className={cn(
				"transition-[outline-color,background-color] motion-reduce:transition-none",
				active &&
					fits &&
					"outline-2 outline-dashed outline-offset-2 outline-primary/50",
				isOver && fits && "bg-primary/10 outline-solid outline-primary",
				className,
			)}
		>
			{children}
		</div>
	);
}
