"use client";

import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Fragen eines Kapitels als eigene Spalte der geteilten Ansicht (ab 1024 px
// scrollt nur sie, data-split-pane in styles/base.css; darunter scrollt die
// Seite). Oben klebt die Kapitelzeile mit Fortschritt und „Nächste offene
// Frage“, unten blendet ein Verlauf ein, solange noch etwas folgt — wie der
// Scroll-Rand in iOS. Der Fortschritt zählt die Karten selbst
// (data-answered an QuestionCard), damit er sofort nach dem Antippen stimmt.
export function ChapterPane({
	title,
	total,
	answered: initial,
	children,
}: {
	title: string;
	total: number;
	answered: number;
	children: ReactNode;
}) {
	const t = useTranslations("Assessment");
	const pane = useRef<HTMLDivElement>(null);
	const head = useRef<HTMLDivElement>(null);
	const [answered, setAnswered] = useState(initial);
	const [more, setMore] = useState(false);

	const recount = useCallback(() => {
		const el = pane.current;
		if (el) setAnswered(el.querySelectorAll('[data-answered="true"]').length);
	}, []);

	useEffect(() => {
		const el = pane.current;
		if (!el) return;
		recount();
		const answers = new MutationObserver(recount);
		answers.observe(el, {
			subtree: true,
			attributes: true,
			attributeFilter: ["data-answered"],
		});
		// Verlauf nur, wenn die Spalte selbst scrollt und unten noch Inhalt ist
		const edge = () =>
			setMore(
				getComputedStyle(el).overflowY === "auto" &&
					el.scrollTop + el.clientHeight < el.scrollHeight - 8,
			);
		edge();
		el.addEventListener("scroll", edge, { passive: true });
		const size = new ResizeObserver(edge);
		size.observe(el);
		return () => {
			answers.disconnect();
			el.removeEventListener("scroll", edge);
			size.disconnect();
		};
	}, [recount]);

	// Nächste offene Frage unterhalb der Kapitelzeile, sonst die erste offene
	function nextOpen() {
		const el = pane.current;
		if (!el) return;
		const open = [
			...el.querySelectorAll<HTMLElement>('[data-answered="false"]'),
		];
		if (open.length === 0) return;
		const below =
			(head.current?.getBoundingClientRect().bottom ??
				el.getBoundingClientRect().top) + 8;
		const target =
			open.find((q) => q.getBoundingClientRect().top > below) ?? open[0];
		const reduce = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		target.scrollIntoView({
			behavior: reduce ? "auto" : "smooth",
			block: "start",
		});
		target.focus({ preventScroll: true });
	}

	const done = answered >= total;

	return (
		<div
			ref={pane}
			data-split-pane
			className="flex min-w-0 flex-col gap-4 lg:pb-6"
		>
			<div
				ref={head}
				data-pane-head
				className="sticky top-14 z-10 -mx-2 flex items-center gap-3 border-border/60 border-b bg-background px-2 py-2"
			>
				<div className="min-w-0 flex-1">
					<h2 className="truncate font-semibold text-headline">{title}</h2>
					<p
						className="text-footnote text-muted-foreground tabular-nums"
						aria-live="polite"
					>
						{t("progress", { answered, total })}
					</p>
				</div>
				{done ? (
					<span className="flex shrink-0 items-center gap-1.5 font-medium text-footnote text-success">
						<CircleCheck className="size-4" aria-hidden />
						{t("chapterDone")}
					</span>
				) : (
					<Button
						type="button"
						variant="secondary"
						size="sm"
						className="shrink-0"
						onClick={nextOpen}
					>
						{t("nextOpen")}
					</Button>
				)}
			</div>
			{children}
			<div
				aria-hidden
				className={cn(
					"pointer-events-none sticky bottom-0 -mt-16 h-12 shrink-0 bg-gradient-to-t from-background to-transparent transition-opacity duration-200",
					more ? "opacity-100" : "opacity-0",
				)}
			/>
		</div>
	);
}
