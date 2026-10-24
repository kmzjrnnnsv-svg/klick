import Link from "next/link";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
	DATE_GROUPS,
	type DateEntry,
	type DateKind,
	type DateState,
} from "@/lib/compliance/dates";

const STATE_TONE: Record<
	DateState,
	"destructive" | "warning" | "outline" | "success"
> = {
	overdue: "destructive",
	soon: "warning",
	due: "outline",
	done: "success",
};

export type DateLabels = {
	kind: (k: DateKind) => string;
	state: (s: DateState) => string;
};

// Termine als Liste (Monatskarte, Wochenliste, Zeitachse): Tag und Titel mit
// Link, darunter Art, Hinweis, Zustand und optionale Aktion — zweizeilig,
// damit es auch in schmalen Spalten lesbar bleibt.
export function DateEntryList({
	entries,
	labels,
	names,
	fullDate = false,
	action,
}: {
	entries: readonly DateEntry[];
	labels: DateLabels;
	names?: ReadonlyMap<string, string>;
	// mit Jahr (Zeitachse, Überfälliges aus Vorjahren)
	fullDate?: boolean;
	action?: (e: DateEntry) => React.ReactNode;
}) {
	return (
		<ul className="flex flex-col divide-y divide-border/60">
			{entries.map((e) => {
				const owner = e.ownerUserId ? names?.get(e.ownerUserId) : undefined;
				const day = `${e.date.slice(8, 10)}.${e.date.slice(5, 7)}.`;
				return (
					<li
						key={`${e.kind}-${e.href}-${e.date}-${e.note ?? ""}-${e.title}`}
						className="flex flex-col gap-1 py-2 text-subhead"
					>
						<div className="flex items-baseline gap-2">
							<span className="shrink-0 font-mono text-muted-foreground text-footnote tabular-nums">
								{fullDate ? `${day}${e.date.slice(2, 4)}` : day}
							</span>
							<Link
								href={e.href}
								className="line-clamp-2 min-w-0 font-medium hover:underline"
								title={e.title}
							>
								{e.title}
							</Link>
						</div>
						<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-footnote">
							<span className="min-w-0">
								{labels.kind(e.kind)}
								{e.note ? ` · ${e.note}` : ""}
								{owner ? ` · ${owner}` : ""}
							</span>
							{e.state !== "due" && (
								<Badge variant={STATE_TONE[e.state]}>
									{labels.state(e.state)}
								</Badge>
							)}
							{action?.(e)}
						</div>
					</li>
				);
			})}
		</ul>
	);
}

// Filter-Chips je Gruppe (URL-Parameter ?art=, ohne Scrollsprung)
export function DateGroupChips({
	base,
	active,
	counts,
	labels,
}: {
	base: string;
	active: string | undefined;
	counts: Record<string, number>;
	labels: { all: string; group: (g: string) => string; aria: string };
}) {
	const sep = base.includes("?") ? "&" : "?";
	const chip = (key: string | undefined, label: string, n?: number) => {
		const on = (active ?? "") === (key ?? "");
		return (
			<Link
				key={key ?? "all"}
				href={key ? `${base}${sep}art=${key}` : base}
				scroll={false}
				aria-current={on ? "true" : undefined}
				className={`inline-flex h-(--control-h-sm) items-center gap-1 rounded-full px-3 text-footnote ${on ? "bg-primary-fill text-white" : "bg-muted hover:bg-foreground/12"}`}
			>
				{label}
				{n !== undefined && (
					<span className={on ? undefined : "text-muted-foreground"}>{n}</span>
				)}
			</Link>
		);
	};
	return (
		<nav aria-label={labels.aria} className="flex flex-wrap gap-1.5">
			{chip(undefined, labels.all)}
			{Object.keys(DATE_GROUPS).map((g) =>
				chip(g, labels.group(g), counts[g] ?? 0),
			)}
		</nav>
	);
}

export function groupCounts(
	entries: readonly DateEntry[],
): Record<string, number> {
	const out: Record<string, number> = {};
	for (const [g, kinds] of Object.entries(DATE_GROUPS))
		out[g] = entries.filter((e) => kinds.includes(e.kind)).length;
	return out;
}
