import type { ReactNode } from "react";

export function PageHeader({
	eyebrow,
	title,
	lead,
	actions,
}: {
	eyebrow?: string;
	title: string;
	lead?: string;
	actions?: ReactNode;
}) {
	return (
		<div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div className="min-w-0">
				{eyebrow && (
					<p className="lv-eyebrow text-[0.6rem] text-brown">{eyebrow}</p>
				)}
				<h1 className="mt-2 hyphens-auto break-words font-serif-display text-3xl text-primary sm:text-4xl">
					{title}
				</h1>
				{lead && <p className="mt-3 max-w-2xl text-muted-foreground">{lead}</p>}
			</div>
			{actions && (
				<div className="flex min-w-0 flex-wrap gap-2 sm:max-w-[60%] sm:shrink-0 sm:justify-end">
					{actions}
				</div>
			)}
		</div>
	);
}
