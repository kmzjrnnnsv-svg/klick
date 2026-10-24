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
		<span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
			<Avatar className={size === "sm" ? "size-5 shrink-0" : "size-7 shrink-0"}>
				<AvatarFallback className="text-footnote">
					{initials(name)}
				</AvatarFallback>
			</Avatar>
			{/* Lange Namen (oft die E-Mail bei Magic-Link-Konten) kürzen ab, sonst
			    schiebt die Zelle Tabellen zur Seite; voller Name im Tooltip. */}
			<span className="max-w-40 truncate" title={name}>
				{name}
			</span>
			{external && (
				<span className="rounded-sm bg-warning/20 px-1 text-footnote text-foreground">
					extern
				</span>
			)}
		</span>
	);
}
