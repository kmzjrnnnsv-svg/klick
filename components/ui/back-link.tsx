import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Zurück nach Apple HIG: Chevron links mit dem Titel der Elternseite, über
// dem großen Titel — nie ein Pfeil (docs/design/hig.md, „Pfeile und
// Chevrons“). Tippfläche 44 px.
export function BackLink({
	href,
	label,
	className,
}: {
	href: string;
	label: string;
	className?: string;
}) {
	return (
		<Link
			href={href}
			className={cn(
				"-ml-1 mb-1 inline-flex min-h-11 items-center gap-0.5 rounded-md pr-2 text-body text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				className,
			)}
		>
			<ChevronLeft aria-hidden="true" className="size-5 shrink-0" />
			{label}
		</Link>
	);
}
