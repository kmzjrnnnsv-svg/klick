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
	cell: (row: T) => ReactNode;
};

// Seitentyp Register: Kopf, Toolbar (Suche, Filter, Chips, Aktionen),
// Tabelle mit festen Spalten; unter 640 px eine Kartenliste.
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
}) {
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
					<div className="hidden sm:block">
						<Table>
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
										{columns.map((c, i) => (
											<TableCell
												key={c.key}
												className={cn(c.className, "align-top")}
											>
												{i === 0 ? (
													<Link
														href={rowHref(row)}
														className="block hover:underline underline-offset-4"
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
					<ul className="flex flex-col gap-2 sm:hidden">
						{rows.map((row) => (
							<li key={row.id}>
								<Link
									href={rowHref(row)}
									className="flex flex-col gap-1.5 rounded-md border p-3 text-sm"
								>
									{columns
										.filter((c) => c.mobile !== false)
										.map((c) => (
											<div
												key={c.key}
												className="flex items-baseline justify-between gap-3"
											>
												<span className="lv-eyebrow text-[0.52rem] text-muted-foreground">
													{c.header}
												</span>
												<span className="text-right">{c.cell(row)}</span>
											</div>
										))}
								</Link>
							</li>
						))}
					</ul>
				</>
			)}
			{footer && (
				<div className="mt-4 text-muted-foreground text-xs">{footer}</div>
			)}
		</>
	);
}
