import { cn } from "@/lib/utils";

// Lange Kennungen (Adressen, Hashes, txids) mit Auslassung in der Mitte nach
// Apple HIG: Anfang und Ende bleiben lesbar. Der volle Wert steht im DOM —
// Markieren und Kopieren liefert ihn ganz, Screenreader lesen ihn ganz.
export function MiddleEllipsis({
	value,
	tail = 6,
	mono = true,
	className,
}: {
	value: string;
	// Zeichen, die am Ende immer sichtbar bleiben
	tail?: number;
	mono?: boolean;
	className?: string;
}) {
	const cls = cn(mono && "font-mono", className);
	if (value.length <= tail * 2) {
		return (
			<span className={cls} translate="no">
				{value}
			</span>
		);
	}
	return (
		<span
			className={cn("inline-flex min-w-0 max-w-full", cls)}
			title={value}
			translate="no"
		>
			<span className="min-w-0 truncate">{value.slice(0, -tail)}</span>
			<span className="shrink-0">{value.slice(-tail)}</span>
		</span>
	);
}
