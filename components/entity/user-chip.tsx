import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((p) => p[0]?.toUpperCase() ?? "")
		.join("");
}

export function UserChip({
	name,
	fallback = "—",
	size = "sm",
	external = false,
}: {
	name: string | null | undefined;
	fallback?: string;
	size?: "sm" | "md";
	// Prüfer:in/Berater:in (ADR-018): kleine Kennzeichnung „extern“
	external?: boolean;
}) {
	if (!name) return <span className="text-muted-foreground">{fallback}</span>;
	return (
		<span className="inline-flex items-center gap-1.5">
			<Avatar className={size === "sm" ? "size-5" : "size-7"}>
				<AvatarFallback className="text-[0.55rem]">
					{initials(name)}
				</AvatarFallback>
			</Avatar>
			<span className="truncate">{name}</span>
			{external && (
				<span className="rounded-sm bg-warning/20 px-1 text-[0.6rem] text-foreground uppercase tracking-[0.1em]">
					extern
				</span>
			)}
		</span>
	);
}
