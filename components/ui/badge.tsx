import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

// Status-Label nach Apple HIG: Kapsel, Satzschreibung, Text immer in der
// Vordergrundfarbe (getönte Flächen drücken farbigen Text unter 4,5 : 1).
// Die Farbe trägt ein Punkt — nie allein: der Text nennt den Zustand.
const badgeVariants = cva(
	"inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full px-2 py-0.5 font-medium text-footnote text-foreground transition-colors [&>svg]:pointer-events-none [&>svg]:size-3.5",
	{
		variants: {
			variant: {
				default:
					"bg-primary/12 before:size-1.5 before:shrink-0 before:rounded-full before:bg-primary before:content-[''] dark:bg-primary/20",
				secondary: "bg-muted",
				outline: "border border-border",
				destructive:
					"bg-destructive/12 before:size-1.5 before:shrink-0 before:rounded-full before:bg-destructive before:content-[''] dark:bg-destructive/20",
				success:
					"bg-success/12 before:size-1.5 before:shrink-0 before:rounded-full before:bg-success before:content-[''] dark:bg-success/20",
				warning:
					"bg-warning/14 before:size-1.5 before:shrink-0 before:rounded-full before:bg-warning before:content-[''] dark:bg-warning/20",
				muted:
					"bg-muted before:size-1.5 before:shrink-0 before:rounded-full before:bg-muted-foreground before:content-['']",
			},
		},
		defaultVariants: { variant: "default" },
	},
);

function Badge({
	className,
	variant,
	asChild = false,
	...props
}: React.ComponentProps<"span"> &
	VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
	const Comp = asChild ? Slot.Root : "span";
	return (
		<Comp
			data-slot="badge"
			className={cn(badgeVariants({ variant }), className)}
			{...props}
		/>
	);
}

export { Badge, badgeVariants };
