import Link from "next/link";
import { cn } from "@/lib/utils";

// Reiter als Links (?tab=…): serverseitig auswertbar, teilbar, kein Client-State.
// Nach Apple HIG bis fünf Abschnitte als segmentierte Steuerung, mehr als
// waagrecht scrollende Leiste mit Kapseln (Segmente müssen gleich breit
// und kurz bleiben).
export function UrlTabs({
	base,
	param = "tab",
	active,
	tabs,
}: {
	base: string;
	param?: string;
	active: string;
	tabs: { value: string; label: string; count?: number }[];
}) {
	const segmented = tabs.length <= 5;
	return (
		<nav
			aria-label="Reiter"
			className={cn(
				"mb-6 flex max-w-full overflow-x-auto [scrollbar-width:none]",
				segmented
					? "w-fit gap-0.5 rounded-[0.5625rem] bg-muted p-0.5"
					: "-mx-4 gap-2 px-4 sm:mx-0 sm:flex-wrap sm:px-0",
			)}
		>
			{tabs.map((tab) => {
				const on = tab.value === active;
				return (
					<Link
						key={tab.value}
						href={`${base}?${param}=${tab.value}`}
						scroll={false}
						aria-current={on ? "page" : undefined}
						className={cn(
							"inline-flex h-(--control-h-sm) shrink-0 items-center justify-center gap-1.5 whitespace-nowrap px-3 text-footnote transition-[background-color,box-shadow,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							segmented
								? cn(
										"flex-1 rounded-[0.4375rem] font-medium text-foreground",
										on
											? "bg-segment font-semibold shadow-[0_1px_3px_rgb(0_0_0/0.12)]"
											: "hover:bg-foreground/5",
									)
								: cn(
										"rounded-full font-medium",
										on
											? "bg-primary-fill text-white"
											: "bg-muted text-foreground hover:bg-foreground/12",
									),
						)}
					>
						{tab.label}
						{tab.count !== undefined && (
							<span
								className={cn(
									"tabular font-normal",
									on && !segmented ? "text-white/85" : "text-muted-foreground",
								)}
							>
								{tab.count}
							</span>
						)}
					</Link>
				);
			})}
		</nav>
	);
}
