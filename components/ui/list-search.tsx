"use client";

import { Search } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Input } from "@/components/ui/input";
import { ListKeys } from "@/components/ui/list-keys";
import { ListRow, ListSection } from "@/components/ui/list";
import { SourceItem, SourceList, SourceSection } from "@/components/ui/source-list";
import { matchesWords, searchWords } from "@/lib/text/search";
import { cn } from "@/lib/utils";

export type ListSearchItem = {
	id: string;
	title: string;
	subtitle?: string;
	href: string;
	icon?: ReactNode;
	// weitere Suchwörter, die nicht angezeigt werden
	terms?: string;
	current?: boolean;
};

// Suchfeld über einer kurzen Liste (Einstellungen, Hilfe): filtert im
// Browser nach Titel, Untertitel und Suchwörtern. Ohne Eingabe bleibt die
// gruppierte Liste (children). ⌘F springt hinein (PageFind), ↑/↓ wandert
// durch die Einträge (ListKeys). Mit action schickt die Eingabetaste die
// Suche als ?q= an diese Seite (Volltext, z. B. /hilfe).
// source: Treffer und Suchfeld in Seitenleisten-Optik (SourceList) — immer
// („always“) oder erst, wenn die Liste neben dem Inhalt steht („wide“,
// Container-Abfrage @3xl; darunter die gruppierte Liste wie am iPhone).
export function ListSearch({
	items,
	labels,
	sticky = false,
	action,
	source,
	children,
}: {
	items: ListSearchItem[];
	labels: { placeholder: string; results: string; empty: string };
	action?: string;
	source?: "always" | "wide";
	// Suchfeld bleibt oben in der eigenen Scrollfläche der Liste stehen,
	// sobald die Liste neben dem Inhalt steht (Container-Abfrage der Seite)
	sticky?: boolean;
	children: ReactNode;
}) {
	const [query, setQuery] = useState("");
	const words = searchWords(query);
	const hits =
		words.length > 0
			? items.filter((i) =>
					matchesWords(
						words,
						`${i.title} ${i.subtitle ?? ""} ${i.terms ?? ""}`,
					),
				)
			: null;
	const stick =
		sticky &&
		cn(
			"@3xl:sticky @3xl:top-0 @3xl:z-10 @3xl:-mx-1 @3xl:bg-background @3xl:px-1 @3xl:py-2",
			// die Liste liegt ab 1024 px auf der Fläche der Seitenleiste
			source && "lg:bg-sidebar",
		);
	// Suchfeld wie „Suchen …“ in der Seitenleiste der App (mit Maus; am
	// Touch-Bildschirm bleibt es 44 px hoch mit 16 px Schrift)
	const fieldLook =
		source === "always"
			? "rounded-lg pointer-fine:h-(--control-h-sm) pointer-fine:text-subhead"
			: source === "wide"
				? "@3xl:rounded-lg @3xl:pointer-fine:h-(--control-h-sm) @3xl:pointer-fine:text-subhead"
				: undefined;
	const field = (
		<label className={cn("relative block", !action && stick)}>
			<span className="sr-only">{labels.placeholder}</span>
			<Search
				aria-hidden="true"
				className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				type="search"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				placeholder={labels.placeholder}
				name={action ? "q" : undefined}
				autoComplete="off"
				spellCheck={false}
				data-page-search=""
				aria-keyshortcuts="Meta+F Control+F"
				className={cn("pl-9", fieldLook)}
			/>
		</label>
	);
	return (
		<ListKeys className="flex flex-col gap-4">
			{action ? (
				<form
					method="get"
					action={action}
					role="search"
					className={cn(stick)}
				>
					{field}
				</form>
			) : (
				field
			)}
			{hits === null ? (
				children
			) : (
				<div aria-live="polite">
					{source && (
						<SourceList
							className={cn(source === "wide" && "hidden @3xl:flex")}
						>
							<SourceSection title={labels.results}>
								{hits.length === 0 ? (
									<li className="px-2 py-1 text-muted-foreground">
										{labels.empty}
									</li>
								) : (
									hits.map((i) => (
										<SourceItem
											key={i.id}
											icon={i.icon}
											title={i.title}
											href={i.href}
											current={i.current}
										/>
									))
								)}
							</SourceSection>
						</SourceList>
					)}
					{source !== "always" && (
						<div className={cn(source === "wide" && "@3xl:hidden")}>
							<ListSection title={labels.results}>
								{hits.length === 0 ? (
									<ListRow title={labels.empty} />
								) : (
									hits.map((i) => (
										<ListRow
											key={i.id}
											icon={i.icon}
											title={i.title}
											subtitle={i.subtitle}
											href={i.href}
											current={i.current}
										/>
									))
								)}
							</ListSection>
						</div>
					)}
				</div>
			)}
		</ListKeys>
	);
}
