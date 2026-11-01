import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Pagination, type Paging } from "./pagination";
import {
	type ChipDef,
	type FilterDef,
	RegisterFilters,
} from "./register-filters";

export type Column<T> = {
	key: string;
	header: string;
	className?: string;
	// Spalten, die < 640 px in der Kartenansicht erscheinen
	mobile?: boolean;
	// Eigenes Bedienelement (z. B. Auswahl-Checkbox): nie im Zeilen-Link,
	// der Link sitzt dann in der ersten Spalte ohne Bedienelement
	interactive?: boolean;
	cell: (row: T) => ReactNode;
};

// Seitentyp Register: Kopf, Toolbar (Suche, Filter, Chips, Aktionen),
// Tabelle mit festen Spalten auf einer Fläche; unter 640 px eine gruppierte
// Liste nach Apple HIG (erste Spalte als Titel, weitere als Zeile darunter,
// Pfeil für Drill-down).
export function RegisterPage<T extends { id: string }>({
	title,
	lead,
	eyebrow,
	actions,
	filters,
	chips,
	searchPlaceholder,
	columns,
	rows,
	rowHref,
	empty,
	footer,
	paging,
}: {
	title: string;
	lead?: string;
	eyebrow?: string;
	actions?: ReactNode;
	filters: FilterDef[];
	chips?: ChipDef[];
	searchPlaceholder?: string;
	columns: Column<T>[];
	rows: T[];
	rowHref: (row: T) => string;
	empty: ReactNode;
	footer?: ReactNode;
	// `rows` ist dann eine Seite; ohne zeichnet die Seite alle Zeilen
	paging?: Paging;
}) {
	const linkKey = columns.find((c) => !c.interactive)?.key;
	return (
		<>
			<PageHeader
				title={title}
				lead={lead}
				eyebrow={eyebrow}
				actions={actions}
			/>
			<div className="mb-4">
				<RegisterFilters
					filters={filters}
					chips={chips}
					searchPlaceholder={searchPlaceholder}
				/>
			</div>
			{rows.length === 0 ? (
				empty
			) : (
				<>
					<div className="hidden overflow-hidden rounded-2xl bg-card sm:block">
						<Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
							<TableHeader>
								<TableRow>
									{columns.map((c) => (
										<TableHead key={c.key} className={c.className}>
											{c.header}
										</TableHead>
									))}
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row) => (
									<TableRow key={row.id} className="group">
										{columns.map((c) => (
											<TableCell
												key={c.key}
												className={cn(c.className, "align-top")}
											>
												{c.key === linkKey ? (
													<Link
														href={rowHref(row)}
														className="hit-area block underline-offset-4 hover:underline"
													>
														{c.cell(row)}
													</Link>
												) : (
													c.cell(row)
												)}
											</TableCell>
										))}
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
					<ul className="overflow-hidden rounded-2xl bg-card sm:hidden">
						{rows.map((row) => {
							const [first, ...rest] = columns.filter(
								(c) => c.mobile !== false,
							);
							return (
								<li
									key={row.id}
									className="relative before:pointer-events-none before:absolute before:top-0 before:right-0 before:left-4 before:h-px before:bg-border/70 first:before:hidden"
								>
									<Link
										href={rowHref(row)}
										className="flex items-center gap-3 py-3 pr-3 pl-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted"
									>
										<div className="flex min-w-0 flex-1 flex-col gap-1">
											{first && (
												<div className="min-w-0 break-words font-medium text-body">
													{first.cell(row)}
												</div>
											)}
											{rest.length > 0 && (
												<dl className="flex flex-wrap gap-x-3 gap-y-1 text-footnote">
													{rest.map((c) => (
														<div
															key={c.key}
															className="flex min-w-0 items-baseline gap-1"
														>
															<dt className="text-muted-foreground">
																{c.header}
															</dt>
															<dd className="min-w-0">{c.cell(row)}</dd>
														</div>
													))}
												</dl>
											)}
										</div>
										<ChevronRight
											aria-hidden="true"
											className="size-4 shrink-0 text-muted-foreground/70"
										/>
									</Link>
								</li>
							);
						})}
					</ul>
				</>
			)}
			{paging && rows.length > 0 && <Pagination {...paging} />}
			{footer && (
				<div className="mt-3 px-4 text-footnote text-muted-foreground">
					{footer}
				</div>
			)}
		</>
	);
}
