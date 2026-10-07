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
}: {
	name: string | null | undefined;
	fallback?: string;
	size?: "sm" | "md";
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
		</span>
	);
}
