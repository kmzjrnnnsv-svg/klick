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
	search = true,
	ignore = [],
}: {
	filters: FilterDef[];
	chips?: ChipDef[];
	searchPlaceholder?: string;
	// ohne Suchfeld, z. B. über Auswertungen
	search?: boolean;
	// Parameter, die nicht als Filter zählen (z. B. die Ansicht)
	ignore?: string[];
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

	const active = [...params.keys()].some((k) => !ignore.includes(k));

	return (
		<div className="flex flex-wrap items-center gap-2">
			{search && (
				<Input
					type="search"
					defaultValue={params.get("q") ?? ""}
					placeholder={searchPlaceholder ?? t("search")}
					onChange={(e) => update("q", e.target.value.trim() || null)}
					className="w-full sm:max-w-xs"
					aria-label={t("search")}
				/>
			)}
			{filters.map((f) => {
				// Auswahl als Chip (wie die Schalter daneben): „Status“ ohne Wahl,
				// „Status: Umgesetzt“ mit Wahl, dann gefüllt
				const value = params.get(f.key);
				const chosen = value
					? f.options.find((o) => o.value === value)
					: undefined;
				return (
					<Select
						key={f.key}
						value={value ?? "all"}
						onValueChange={(v) => update(f.key, v)}
					>
						<SelectTrigger
							size="sm"
							aria-label={f.label}
							className={cn(
								"hit-area max-w-full rounded-full font-medium text-footnote data-[size=sm]:text-footnote sm:max-w-64",
								chosen &&
									"bg-primary-fill text-white hover:bg-primary-fill/90 [&_svg]:opacity-90",
							)}
						>
							<SelectValue placeholder={f.label}>
								{chosen ? `${f.label}: ${chosen.label}` : f.label}
							</SelectValue>
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
				);
			})}
			<div className="contents">
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
					onClick={() => {
						const keep = new URLSearchParams();
						for (const k of ignore) {
							const v = params.get(k);
							if (v) keep.set(k, v);
						}
						const qs = keep.toString();
						router.replace(qs ? `${pathname}?${qs}` : pathname, {
							scroll: false,
						});
					}}
				>
					<X />
					{t("clearFilters")}
				</Button>
			)}
		</div>
	);
}
