import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

// Maison: Unterstrich-Eingabefeld als Default; "boxed" für dichte Formulare.
const inputVariants = cva(
	"flex h-10 w-full min-w-0 bg-transparent text-sm tracking-wide text-foreground placeholder:text-muted-foreground/70 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
	{
		variants: {
			variant: {
				underline:
					"rounded-none border-0 border-b border-input px-1 py-2 focus-visible:border-foreground focus-visible:outline-none",
				boxed:
					"rounded-sm border border-input px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
			},
		},
		defaultVariants: { variant: "underline" },
	},
);

function Input({
	className,
	variant,
	type,
	...props
}: React.ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(inputVariants({ variant }), className)}
			{...props}
		/>
	);
}

export { Input, inputVariants };
