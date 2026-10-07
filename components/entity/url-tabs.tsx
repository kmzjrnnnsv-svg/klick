import Link from "next/link";
import { cn } from "@/lib/utils";

// Reiter als Links (?tab=…): serverseitig auswertbar, teilbar, kein Client-State.
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
	return (
		<nav
			aria-label="Reiter"
			className="mb-6 flex gap-1 overflow-x-auto border-border/60 border-b"
		>
			{tabs.map((tab) => {
				const on = tab.value === active;
				return (
					<Link
						key={tab.value}
						href={`${base}?${param}=${tab.value}`}
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
