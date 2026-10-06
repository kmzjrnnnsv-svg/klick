import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

// Maison-Buttons: Versalien mit Laufweite, flache Ecken, Trust-Blau als
// Default, Braun für die primäre Handlung einer Seite (CTA).
const buttonVariants = cva(
	"inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium uppercase tracking-[0.16em] transition-[opacity,background-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:opacity-90",
				brown: "bg-brown text-brown-foreground hover:opacity-90",
				secondary: "bg-secondary text-secondary-foreground hover:bg-muted",
				outline:
					"border border-foreground/30 bg-transparent text-foreground hover:bg-foreground hover:text-background",
				ghost: "bg-transparent text-foreground hover:bg-muted",
				destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
				link: "normal-case tracking-normal text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-10 px-5 text-[0.7rem]",
				sm: "h-8 px-3 text-[0.66rem]",
				lg: "h-12 px-8 text-[0.76rem]",
				icon: "size-9 tracking-normal",
				"icon-sm": "size-8 tracking-normal",
			},
		},
		defaultVariants: { variant: "default", size: "default" },
	},
);

function Button({
	className,
	variant,
	size,
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
	const Comp = asChild ? Slot.Root : "button";
	return (
		<Comp
			data-slot="button"
			className={cn(buttonVariants({ variant, size }), className)}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
