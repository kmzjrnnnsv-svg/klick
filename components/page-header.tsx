import type { ReactNode } from "react";
import { BackLink } from "@/components/ui/back-link";

// Seitenkopf nach Apple HIG: Large Title (fett, Vordergrundfarbe), darunter
// ein Satz Zweck; Aktionen hinten, höchstens eine hervorgehoben. eyebrow ist
// nur noch leiser Kontext (Bereich), keine Versalien, keine Farbe.
export function PageHeader({
	back,
	eyebrow,
	title,
	lead,
	actions,
}: {
	// Zurück zur Elternseite (Chevron links + Titel, docs/design/hig.md)
	back?: { href: string; label: string };
	eyebrow?: string;
	title: string;
	lead?: string;
	actions?: ReactNode;
}) {
	return (
		<div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
			<div className="min-w-0">
				{back && <BackLink href={back.href} label={back.label} />}
				{eyebrow && (
					<p className="font-medium text-footnote text-muted-foreground">
						{eyebrow}
					</p>
				)}
				<h1 className="mt-0.5 hyphens-auto break-words font-bold text-foreground text-title-1 text-balance sm:text-large-title">
					{title}
				</h1>
				{lead && (
					<p className="mt-2 max-w-2xl text-callout text-muted-foreground text-pretty">
						{lead}
					</p>
				)}
			</div>
			{actions && (
				<div className="flex min-w-0 flex-wrap items-center gap-2 sm:max-w-[60%] sm:shrink-0 sm:justify-end">
					{actions}
				</div>
			)}
		</div>
	);
}
