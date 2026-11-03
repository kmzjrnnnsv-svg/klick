import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Kacheln über einem Register (Platz `summary` in RegisterPage): je Kachel
// ein Titel und eine Aussage, Zahlen führen auf den passenden Filter.
export function SummaryGrid({ children }: { children: ReactNode }) {
	return (
		<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
			{children}
		</div>
	);
}

export function SummaryCard({
	title,
	children,
	className,
}: {
	title: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section className={cn("min-w-0 rounded-2xl bg-card p-4", className)}>
			<h2 className="mb-3 font-semibold text-subhead">{title}</h2>
			{children}
		</section>
	);
}
