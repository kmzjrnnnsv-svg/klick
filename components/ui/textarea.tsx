import type * as React from "react";
import { cn } from "@/lib/utils";

// Gefülltes Feld wie Input, mehrzeilig
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"flex min-h-24 w-full rounded-md border border-transparent bg-muted px-3 py-2 text-callout leading-relaxed transition-[box-shadow,background-color] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/30",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
