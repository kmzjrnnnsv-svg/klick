import Link from "next/link";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDate } from "@/lib/compliance/page-data";

// Karten auf /heute: gleicher Kopf (Titel + Link) und Zeilen auf einem
// gemeinsamen Raster Titel · Datum · Aktion. Die Zeilen sind Subgrids der
// Liste, deshalb stehen Daten und Knöpfe einer Karte genau untereinander,
// egal wie breit das einzelne Badge ist. Leere Spalten nehmen keinen Platz;
// am Handy rutschen Datum und Aktion unter den Titel.
export function TodayCard({
	title,
	link,
	className,
	children,
}: {
	title: string;
	link?: { href: string; label: string };
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-headline">
					<span className="min-w-0 break-words">{title}</span>
					{link && (
						<Link
							href={link.href}
							className="shrink-0 font-normal text-primary text-subhead underline-offset-4 hover:underline"
						>
							{link.label}
						</Link>
					)}
				</CardTitle>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

export function TodayEmpty({ children }: { children: React.ReactNode }) {
	return (
		<p className="flex min-h-12 items-center text-muted-foreground text-subhead">
			{children}
		</p>
	);
}

export function TodayList({ children }: { children: React.ReactNode }) {
	return (
		<ul className="flex flex-col text-subhead sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto]">
			{children}
		</ul>
	);
}

export function TodayRow({
	title,
	href,
	sub,
	date,
	action,
	below,
}: {
	title: React.ReactNode;
	href?: string;
	sub?: React.ReactNode;
	date?: React.ReactNode;
	action?: React.ReactNode;
	below?: React.ReactNode;
}) {
	return (
		<li className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1.5 border-border/60 border-t py-2 first:border-t-0 sm:col-span-3 sm:grid sm:grid-cols-subgrid sm:gap-x-0 sm:gap-y-2">
			<div className="min-w-0 basis-full sm:basis-auto">
				{href ? (
					<Link
						href={href}
						className="block truncate underline-offset-4 hover:underline"
					>
						{title}
					</Link>
				) : (
					<p className="truncate">{title}</p>
				)}
				{sub}
			</div>
			<div className="max-sm:empty:hidden sm:justify-self-end sm:not-empty:pl-3">
				{date}
			</div>
			<div className="ml-auto max-sm:empty:hidden sm:ml-0 sm:justify-self-end sm:not-empty:pl-3">
				{action}
			</div>
			{below && <div className="basis-full sm:col-span-3">{below}</div>}
		</li>
	);
}

// Ein Datum, eine Darstellung: überfällig rot, bald fällig gelb, sonst
// umrandet — gleich breit, damit die Spalte ruhig steht.
export function DueBadge({
	date,
	today,
	soonDays = 7,
	overdueLabel,
}: {
	date: string;
	today: string;
	soonDays?: number;
	overdueLabel: string;
}) {
	const day = date.slice(0, 10);
	const soon = new Date(`${today}T00:00:00Z`);
	soon.setUTCDate(soon.getUTCDate() + soonDays);
	const overdue = day < today;
	const variant = overdue
		? "destructive"
		: day <= soon.toISOString().slice(0, 10)
			? "warning"
			: "outline";
	return (
		<Badge variant={variant} className="min-w-[6.75rem] tabular-nums">
			{fmtDate.format(new Date(date))}
			{overdue && <span className="sr-only"> ({overdueLabel})</span>}
		</Badge>
	);
}

export function TodayMeta({ children }: { children: React.ReactNode }) {
	return (
		<span className="text-muted-foreground text-footnote tabular-nums">
			{children}
		</span>
	);
}
