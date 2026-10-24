import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { cn } from "@/lib/utils";

// Gruppierte Liste nach Apple HIG („inset grouped“, wie die iOS-Einstellungen):
// Abschnitte mit Kopf und Fuß, Zeilen mit Titel, Untertitel, Wert, Zubehör
// (Schalter, Status) und Pfeil für Drill-down. Trennlinien eingerückt bis zum
// Text. Server-tauglich; Zeilen mit href werden Links.

function ListGroup({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="list-group"
			className={cn("flex flex-col gap-7", className)}
			{...props}
		/>
	);
}

function ListSection({
	title,
	footer,
	actions,
	className,
	children,
	...props
}: Omit<React.ComponentProps<"section">, "title"> & {
	title?: React.ReactNode;
	footer?: React.ReactNode;
	// Kleine Aktion rechts im Kopf (z. B. „Bearbeiten“)
	actions?: React.ReactNode;
}) {
	return (
		<section
			data-slot="list-section"
			className={cn("flex min-w-0 flex-col gap-1.5", className)}
			{...props}
		>
			{(title || actions) && (
				<div className="flex items-end justify-between gap-3 px-4">
					{title && (
						<h2 className="font-semibold text-foreground text-subhead">{title}</h2>
					)}
					{actions}
				</div>
			)}
			<ul className="overflow-hidden rounded-2xl bg-card">{children}</ul>
			{footer && (
				<p className="px-4 text-footnote text-muted-foreground">{footer}</p>
			)}
		</section>
	);
}

// Eingerückte Trennlinie über jeder Zeile außer der ersten
const separator =
	"relative before:pointer-events-none before:absolute before:top-0 before:right-0 before:left-4 before:h-px before:bg-border/70 first:before:hidden";

function ListRow({
	title,
	subtitle,
	value,
	icon,
	accessory,
	href,
	current = false,
	destructive = false,
	className,
	children,
}: {
	title?: React.ReactNode;
	subtitle?: React.ReactNode;
	// Wert rechts (grau), z. B. „Aus“ oder ein Datum
	value?: React.ReactNode;
	// Symbol links (Lucide, wird in einer getönten Kachel gezeigt)
	icon?: React.ReactNode;
	// Bedienelement oder Status rechts (Switch, Badge, Button)
	accessory?: React.ReactNode;
	// Drill-down: ganze Zeile als Link mit Pfeil
	href?: string;
	// Gewählte Zeile in einer Liste als Seitenleiste (Einstellungen am Desktop)
	current?: boolean;
	destructive?: boolean;
	className?: string;
	// Eigener Inhalt statt Titel/Untertitel
	children?: React.ReactNode;
}) {
	const body = (
		<>
			{icon && (
				<span
					aria-hidden="true"
					className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-fill text-white [&_svg]:size-4"
				>
					{icon}
				</span>
			)}
			<span className="flex min-w-0 flex-1 items-center gap-3">
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					{title && (
						<span
							className={cn(
								"min-w-0 break-words text-body sm:text-subhead",
								destructive && "text-destructive",
							)}
						>
							{title}
						</span>
					)}
					{subtitle && (
						<span className="min-w-0 break-words text-footnote text-muted-foreground">
							{subtitle}
						</span>
					)}
					{children}
				</span>
				{value !== undefined && value !== null && (
					<span className="min-w-0 max-w-[50%] shrink truncate text-right text-body text-muted-foreground sm:text-subhead">
						{value}
					</span>
				)}
				{accessory && <span className="flex shrink-0 items-center">{accessory}</span>}
				{href && (
					<ChevronRight
						aria-hidden="true"
						className="size-4 shrink-0 text-muted-foreground/70"
					/>
				)}
			</span>
		</>
	);
	const rowClass =
		"flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left";
	return (
		<li data-slot="list-row" className={cn(separator, className)}>
			{href ? (
				<Link
					href={href}
					aria-current={current ? "page" : undefined}
					className={cn(
						rowClass,
						"transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted",
						current && "bg-primary/12 font-semibold hover:bg-primary/12",
					)}
				>
					{body}
				</Link>
			) : (
				<div className={rowClass}>{body}</div>
			)}
		</li>
	);
}

export { ListGroup, ListRow, ListSection };
