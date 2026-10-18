import { Badge } from "@/components/ui/badge";
import type { StatusMachine, Tone } from "@/lib/entities/types";

const VARIANT: Record<
	Tone,
	"muted" | "default" | "warning" | "success" | "destructive"
> = {
	muted: "muted",
	default: "default",
	warning: "warning",
	success: "success",
	destructive: "destructive",
};

// Status-Pille aus der Maschine: Ton + Label-Key. Label wird vom Aufrufer
// übersetzt (Namespace "Status"), damit die Komponente server- und
// clientseitig gleich bleibt. waitingLabel: offener Freigabe-Antrag
// („Wartet auf Freigabe“) als zweite Pille.
export function StatusBadge<S extends string>({
	machine,
	status,
	label,
	className,
	waitingLabel,
}: {
	machine: StatusMachine<S>;
	status: S;
	label: string;
	className?: string;
	waitingLabel?: string;
}) {
	const badge = (
		<Badge
			variant={VARIANT[machine.tone[status] ?? "muted"]}
			className={className}
		>
			{label}
		</Badge>
	);
	if (!waitingLabel) return badge;
	return (
		<span className="inline-flex flex-wrap items-center gap-1">
			{badge}
			<Badge variant="warning">{waitingLabel}</Badge>
		</span>
	);
}
