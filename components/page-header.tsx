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
			<div>
				{eyebrow && (
					<p className="lv-eyebrow text-[0.6rem] text-brown">{eyebrow}</p>
				)}
				<h1 className="mt-2 font-serif-display text-3xl text-primary sm:text-4xl">
					{title}
				</h1>
				{lead && <p className="mt-3 max-w-2xl text-muted-foreground">{lead}</p>}
			</div>
			{actions && <div className="flex shrink-0 gap-2">{actions}</div>}
		</div>
	);
}
