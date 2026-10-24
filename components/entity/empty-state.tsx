import type { ReactNode } from "react";

// Leere Register sind tot: ein Satz Zweck, der nächste Schritt als Aktion,
// und welches Control / welche Anforderung das Register fordert
// („Gefordert von …“).
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
		<div className="flex flex-col items-start gap-3 rounded-2xl bg-card p-6 sm:p-8">
			<h2 className="font-semibold text-foreground text-title-3">{title}</h2>
			{lead && (
				<p className="max-w-xl text-callout text-muted-foreground text-pretty">
					{lead}
				</p>
			)}
			{actions && <div className="flex flex-wrap gap-2">{actions}</div>}
			{requiredBy && (
				<p className="text-footnote text-muted-foreground">{requiredBy}</p>
			)}
		</div>
	);
}
