import { MarkdownView } from "@/components/markdown-view";
import { type ActivityEntry, formatValue } from "@/lib/history";
import { UserChip } from "./user-chip";

// Ein Strom: Kommentare und Feld-Historie gemischt (Linear/GitHub-Stil).
export function ActivityStream({
	entries,
	names,
	labels,
}: {
	entries: ActivityEntry[];
	names: Map<string, string>;
	labels: { empty: string; changed: string; commented: string; system: string };
}) {
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	});
	if (entries.length === 0) {
		return <p className="text-muted-foreground text-sm">{labels.empty}</p>;
	}
	return (
		<ol className="flex flex-col gap-4 text-sm">
			{entries.map((e) => {
				if (e.type === "comment") {
					const name = e.comment.authorUserId
						? names.get(e.comment.authorUserId)
						: null;
					return (
						<li key={`c-${e.comment.id}`} className="flex flex-col gap-1">
							<div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
								<UserChip name={name ?? labels.system} />
								<time dateTime={e.at.toISOString()}>{fmt.format(e.at)}</time>
							</div>
							<div className="rounded-md bg-muted/50 px-3 py-2">
								<MarkdownView
									source={e.comment.bodyMarkdown}
									className="text-sm [&_p]:my-1"
								/>
							</div>
						</li>
					);
				}
				const name = e.item.actorUserId ? names.get(e.item.actorUserId) : null;
				return (
					<li key={`h-${e.item.id}`} className="flex flex-col gap-1">
						<div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
							<span className="inline-flex items-center gap-1.5">
								<UserChip name={name ?? labels.system} />
								<span>· {labels.changed}</span>
							</span>
							<time dateTime={e.at.toISOString()}>{fmt.format(e.at)}</time>
						</div>
						{e.item.changes.length > 0 ? (
							<ul className="flex flex-col gap-0.5 pl-1 text-xs">
								{e.item.changes.map((ch) => (
									<li
										key={ch.field}
										className="flex flex-wrap items-baseline gap-1.5"
									>
										<span className="font-mono text-muted-foreground">
											{ch.field}
										</span>
										<span className="text-muted-foreground line-through">
											{formatValue(ch.before)}
										</span>
										<span>→</span>
										<span className="font-medium">{formatValue(ch.after)}</span>
									</li>
								))}
							</ul>
						) : (
							<p className="pl-1 text-muted-foreground text-xs">
								{e.item.action}
							</p>
						)}
					</li>
				);
			})}
		</ol>
	);
}
