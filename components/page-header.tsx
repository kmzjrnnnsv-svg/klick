import type { ReactNode } from "react";
import { PageHelp } from "@/components/guide/page-help";

// Seitenkopf. `help` (Texte unter Help.<seite>) zeigt einklappbar „Worum
// geht’s? · Wofür? · Erster Schritt“; `tour` bietet die geführte Tour an.
export function PageHeader({
	eyebrow,
	title,
	lead,
	actions,
	help,
	tour,
}: {
	eyebrow?: string;
	title: string;
	lead?: string;
	actions?: ReactNode;
	help?: string;
	tour?: string;
}) {
	return (
		<div className="mb-8 flex flex-col gap-4">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					{eyebrow && (
						<p className="lv-eyebrow text-[0.6rem] text-brown">{eyebrow}</p>
					)}
					<h1 className="mt-2 font-serif-display text-3xl text-primary sm:text-4xl">
						{title}
					</h1>
					{lead && (
						<p className="mt-3 max-w-2xl text-muted-foreground">{lead}</p>
					)}
				</div>
				{actions && (
					<div
						data-tour="page-actions"
						className="flex flex-wrap gap-2 sm:shrink-0"
					>
						{actions}
					</div>
				)}
			</div>
			{(help || tour) && <PageHelp page={help} tour={tour} />}
		</div>
	);
}
