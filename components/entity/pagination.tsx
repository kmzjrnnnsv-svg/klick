import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { type PageQuery, pageCount, pageHref } from "@/lib/paging";
import { cn } from "@/lib/utils";

export type Paging = {
	page: number;
	total: number;
	pageSize: number;
	path: string;
	query: PageQuery;
};

// Blättern unter einem Register: „51–100 von 1 951“, Chevrons zurück/vor
// (Apple HIG: Chevrons zum Blättern). Erscheint erst ab zwei Seiten.
export async function Pagination({
	page,
	total,
	pageSize,
	path,
	query,
}: Paging) {
	const pages = pageCount(total, pageSize);
	if (pages <= 1) return null;
	const t = await getTranslations("Entity");
	const from = (page - 1) * pageSize + 1;
	const to = Math.min(total, page * pageSize);
	const fmt = new Intl.NumberFormat("de-DE");
	const step = (target: number, label: string, Icon: typeof ChevronLeft) => {
		const disabled = target < 1 || target > pages;
		const cls = cn(
			"hit-area inline-flex size-(--control-h) items-center justify-center rounded-full",
			disabled
				? "pointer-events-none text-muted-foreground/50"
				: "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
		);
		return disabled ? (
			<span className={cls} aria-disabled="true">
				<Icon className="size-5" aria-hidden />
				<span className="sr-only">{label}</span>
			</span>
		) : (
			<Link
				href={pageHref(path, query, target)}
				className={cls}
				aria-label={label}
			>
				<Icon className="size-5" aria-hidden />
			</Link>
		);
	};
	return (
		<nav
			aria-label={t("pageNav")}
			className="mt-3 flex items-center justify-end gap-2 text-footnote text-muted-foreground"
		>
			<span className="tabular-nums">
				{t("pageRange", {
					from: fmt.format(from),
					to: fmt.format(to),
					total: fmt.format(total),
				})}
			</span>
			{step(page - 1, t("pagePrev"), ChevronLeft)}
			{step(page + 1, t("pageNext"), ChevronRight)}
		</nav>
	);
}
