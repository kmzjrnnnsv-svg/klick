import type { ReactNode } from "react";
import { BackLink } from "@/components/ui/back-link";
import { cn } from "@/lib/utils";

// Seitenkopf nach Apple HIG: Large Title (fett, Vordergrundfarbe), darunter
// ein Satz Zweck; Aktionen hinten, höchstens eine hervorgehoben. eyebrow ist
// nur noch leiser Kontext (Bereich), keine Versalien, keine Farbe.
export function PageHeader({
	back,
	eyebrow,
	title,
	lead,
	actions,
	compact,
}: {
	// Zurück zur Elternseite (Chevron links + Titel, docs/design/hig.md)
	back?: { href: string; label: string };
	eyebrow?: string;
	title: string;
	lead?: string;
	actions?: ReactNode;
	// Kopf bleibt stehen (geteilte Ansicht): Titel statt Large Title, weniger
	// Abstand — wie die Leiste in iOS, wenn der große Titel eingeklappt ist
	compact?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
				compact ? "mb-4" : "mb-6 sm:mb-8",
			)}
		>
			<div className="min-w-0">
				{back && <BackLink href={back.href} label={back.label} />}
				{eyebrow && (
					<p className="font-medium text-footnote text-muted-foreground">
						{eyebrow}
					</p>
				)}
				<h1
					// in der geteilten Ansicht kompakt (styles/base.css)
					data-split-title=""
					className={cn(
						"mt-0.5 hyphens-auto break-words font-bold text-foreground text-balance",
						compact ? "text-title-2" : "text-title-1 sm:text-large-title",
					)}
				>
					{title}
				</h1>
				{lead && (
					<p
						className={cn(
							"max-w-2xl text-muted-foreground text-pretty",
							compact ? "mt-1 text-subhead" : "mt-2 text-callout",
						)}
					>
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
