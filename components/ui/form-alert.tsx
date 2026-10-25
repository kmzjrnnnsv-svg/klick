import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// Prüffehler eines Formulars direkt über dem Absenden-Knopf (Apple HIG:
// Fehler dort zeigen, wo sie entstehen, mit Lösung) — nicht im Toast, der
// von selbst verschwindet. Ohne Meldung rendert nichts.
export function FormAlert({
	message,
	className,
}: {
	message?: string | null;
	className?: string;
}) {
	if (!message) return null;
	return (
		<Alert variant="destructive" className={cn("py-2.5", className)}>
			<CircleAlert aria-hidden="true" />
			<AlertDescription className="text-foreground">{message}</AlertDescription>
		</Alert>
	);
}
