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
	// Jede Zeile nur einmal ausliefern (P3, Nov 2026): eine Tabelle, die unter
	// 640 px per CSS als gruppierte Liste erscheint (erste Spalte als Titel,
	// weitere mit Kopf als Zeile darunter, ganze Zeile tippbar, Pfeil für
	// Drill-down). Vorher standen Tabelle und Liste beide im HTML und im
	// RSC-Strom, also jede Zeile doppelt.
	const linkKey = columns.find((c) => !c.interactive)?.key;
	const mobileCols = columns.filter((c) => c.mobile !== false);
	const titleKey = mobileCols[0]?.key;
	// Link der Liste: erste Spalte, die auch am Handy steht
	const mobileLinkKey = mobileCols.find((c) => !c.interactive)?.key;
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
				<div className="overflow-hidden rounded-2xl bg-card">
					<Table className="register-table sm:[&_td:first-child]:pl-4 sm:[&_td:last-child]:pr-4 sm:[&_th:first-child]:pl-4 sm:[&_th:last-child]:pr-4">
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
									{columns.map((c) => {
										const asLink = c.key === linkKey || c.key === mobileLinkKey;
										const m =
											c.mobile === false
												? "hide"
												: c.key === titleKey
													? "title"
													: "meta";
										return (
											<TableCell
												key={c.key}
												className={cn(c.className, "align-top")}
												data-m={m}
												data-interactive={c.interactive ? "" : undefined}
											>
												{m === "meta" && (
													<span data-m-label="">{c.header}</span>
												)}
												{asLink ? (
													<Link
														href={rowHref(row)}
														className="hit-area block underline-offset-4 hover:underline"
														data-row-link={
															c.key === mobileLinkKey ? "" : undefined
														}
													>
														{c.cell(row)}
													</Link>
												) : (
													c.cell(row)
												)}
												{m === "title" && (
													<ChevronRight aria-hidden="true" data-chevron="" />
												)}
											</TableCell>
										);
									})}
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
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
