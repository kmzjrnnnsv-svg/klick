import Link from "next/link";
import { cn } from "@/lib/utils";

// Reiter als Links (?tab=…): serverseitig auswertbar, teilbar, kein Client-State.
// `keep` trägt weitere Parameter mit (Jahr, Stichtag), die für alle Reiter gelten.
export function UrlTabs({
	base,
	param = "tab",
	active,
	tabs,
	keep,
}: {
	base: string;
	param?: string;
	active: string;
	tabs: { value: string; label: string; count?: number }[];
	keep?: Record<string, string | undefined>;
}) {
	const href = (value: string) => {
		const q = new URLSearchParams();
		q.set(param, value);
		for (const [k, v] of Object.entries(keep ?? {}))
			if (v && k !== param) q.set(k, v);
		return `${base}?${q.toString()}`;
	};
	return (
		<nav
			aria-label="Reiter"
			data-tour="url-tabs"
			className="mb-6 flex gap-1 overflow-x-auto border-border/60 border-b"
		>
			{tabs.map((tab) => {
				const on = tab.value === active;
				return (
					<Link
						key={tab.value}
						href={href(tab.value)}
						aria-current={on ? "page" : undefined}
						className={cn(
							"-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
							on
								? "border-primary font-medium text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground",
						)}
					>
						{tab.label}
						{tab.count !== undefined && (
							<span className="ml-1.5 text-muted-foreground text-xs">
								{tab.count}
							</span>
						)}
					</Link>
				);
			})}
		</nav>
	);
}
