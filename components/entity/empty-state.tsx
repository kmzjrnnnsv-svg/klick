import type { ReactNode } from "react";

// Leere Register sind tot: ein Satz Zweck, Aktionen, und welches Control /
// welche Anforderung das Register fordert („Gefordert von …").
export function EmptyState({
	title,
	lead,
	requiredBy,
	actions,
}: {
	title: string;
	lead?: string;
	requiredBy?: string;
	actions?: ReactNode;
}) {
	return (
		<div className="flex flex-col items-start gap-3 rounded-md border border-dashed p-6 sm:p-8">
			<h2 className="font-serif-display text-xl text-primary">{title}</h2>
			{lead && <p className="max-w-xl text-muted-foreground text-sm">{lead}</p>}
			{actions && <div className="flex flex-wrap gap-2">{actions}</div>}
			{requiredBy && (
				<p className="lv-eyebrow text-[0.58rem] text-muted-foreground">
					{requiredBy}
				</p>
			)}
		</div>
	);
}
