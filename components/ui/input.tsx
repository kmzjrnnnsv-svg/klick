import type * as React from "react";
import { cn } from "@/lib/utils";

// Gefülltes Feld nach Apple HIG: grau getönt, 10 px Ecken, Höhe aus
// --control-h. Schrift mindestens 16 px (sonst zoomt Safari auf iOS beim
// Fokussieren). Label steht darüber (components/ui/label.tsx).
const inputClass =
	"flex h-(--control-h) w-full min-w-0 rounded-md border border-transparent bg-muted px-3 py-1.5 text-callout text-foreground transition-[box-shadow,background-color] placeholder:text-muted-foreground file:mr-3 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-subhead focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/30";

// Natives <select> im selben Stil (Formulare mit vielen Zeilen, Assistenten);
// die kompakte Variante steht in Tabellenzeilen und neben Fragen
const nativeSelectClass =
	"h-(--control-h) w-full min-w-0 rounded-md bg-muted px-3 text-callout text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60";
const nativeSelectCompactClass =
	"h-(--control-h-sm) min-w-0 rounded-md bg-muted px-2.5 text-callout text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(inputClass, className)}
			{...props}
		/>
	);
}

export { Input, inputClass, nativeSelectClass, nativeSelectCompactClass };
