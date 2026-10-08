import Link from "next/link";

// Kompakte Liste verknüpfter Einträge (z. B. Prozesse eines Assets) mit
// „+n“, damit Register-Zeilen schmal bleiben.
export function LinkChips({
	items,
	max = 3,
}: {
	items: { key: string; label: string; href: string; title?: string }[];
	max?: number;
}) {
	if (items.length === 0)
		return <span className="text-muted-foreground text-xs">—</span>;
	const shown = items.slice(0, max);
	return (
		<span className="flex flex-wrap gap-1">
			{shown.map((i) => (
				<Link
					key={i.key}
					href={i.href}
					title={i.title}
					className="rounded border px-1.5 py-0.5 font-mono text-[0.65rem] hover:bg-muted"
				>
					{i.label}
				</Link>
			))}
			{items.length > max && (
				<span
					className="px-1 text-muted-foreground text-xs"
					title={items
						.slice(max)
						.map((i) => i.title ?? i.label)
						.join(", ")}
				>
					+{items.length - max}
				</span>
			)}
		</span>
	);
}
