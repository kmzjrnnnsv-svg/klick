"use client";

import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string };
export type FilterDef = { key: string; label: string; options: FilterOption[] };
export type ChipDef = { key: string; label: string };

// Filter-State lebt in der URL (?status=&owner=me&q=) — teilbar, zurück-
// navigierbar, serverseitig auswertbar. Chips sind boolesche Schalter.
export function RegisterFilters({
	filters,
	chips = [],
	searchPlaceholder,
}: {
	filters: FilterDef[];
	chips?: ChipDef[];
	searchPlaceholder?: string;
}) {
	const t = useTranslations("Entity");
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();

	const update = useCallback(
		(key: string, value: string | null) => {
			const next = new URLSearchParams(params.toString());
			// andere Filter = andere Treffer: zurück auf die erste Seite
			next.delete("seite");
			if (value === null || value === "" || value === "all") next.delete(key);
			else next.set(key, value);
			const qs = next.toString();
			router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
		},
		[params, pathname, router],
	);

	const active = [...params.keys()].length > 0;

	return (
		<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
			<Input
				type="search"
				defaultValue={params.get("q") ?? ""}
				placeholder={searchPlaceholder ?? t("search")}
				onChange={(e) => update("q", e.target.value.trim() || null)}
				className="sm:max-w-xs"
				aria-label={t("search")}
			/>
			{filters.map((f) => (
				<Select
					key={f.key}
					value={params.get(f.key) ?? "all"}
					onValueChange={(v) => update(f.key, v)}
				>
					<SelectTrigger className="w-full sm:w-44" aria-label={f.label}>
						<SelectValue placeholder={f.label} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">
							{f.label}: {t("all")}
						</SelectItem>
						{f.options.map((o) => (
							<SelectItem key={o.value} value={o.value}>
								{o.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			))}
			<div className="flex flex-wrap gap-1.5">
				{chips.map((c) => {
					const on = params.get(c.key) === "1";
					return (
						<button
							key={c.key}
							type="button"
							aria-pressed={on}
							onClick={() => update(c.key, on ? null : "1")}
							className={cn(
								"inline-flex h-(--control-h-sm) items-center rounded-full px-3 font-medium text-footnote transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								on
									? "bg-primary-fill text-white"
									: "bg-muted text-foreground hover:bg-foreground/12",
							)}
						>
							{c.label}
						</button>
					);
				})}
			</div>
			{active && (
				<Button
					variant="ghost"
					size="sm"
					onClick={() => router.replace(pathname, { scroll: false })}
				>
					<X />
					{t("clearFilters")}
				</Button>
			)}
		</div>
	);
}
