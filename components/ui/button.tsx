import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

// Buttons nach Apple HIG (docs/design/hig.md): Kapsel, Satzschreibung, Höhe
// aus --control-h (44 px am Touch-Bildschirm). Rollen: default = Primär
// (gefüllt, je Ansicht höchstens eine bis zwei), secondary/outline = grau
// getönt, ghost = schlicht in Akzentfarbe, destructive = Rot, nie Primärrolle.
const buttonVariants = cva(
	"inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-[opacity,background-color,color,filter] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:opacity-70 disabled:pointer-events-none disabled:opacity-40 aria-busy:cursor-progress aria-invalid:ring-2 aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default: "bg-primary-fill font-semibold text-white hover:brightness-110",
				secondary: "bg-muted text-foreground hover:bg-foreground/12",
				outline: "bg-muted text-foreground hover:bg-foreground/12",
				ghost: "bg-transparent text-primary hover:bg-accent",
				destructive:
					"bg-destructive-fill font-semibold text-white hover:brightness-110",
				link: "h-auto rounded-sm px-0 text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-(--control-h) px-4 text-subhead",
				sm: "h-(--control-h-sm) px-3 text-footnote",
				lg: "h-12 px-6 text-body",
				icon: "size-(--control-h)",
				"icon-sm": "size-(--control-h-sm)",
			},
		},
		compoundVariants: [
			{ variant: "link", size: ["default", "sm", "lg"], className: "h-auto px-0" },
		],
		defaultVariants: { variant: "default", size: "default" },
	},
);

function Button({
	className,
	variant,
	size,
	asChild = false,
	pending = false,
	disabled,
	children,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
		// Ladezustand: gesperrt, aria-busy, Spinner vor der Beschriftung
		// (die Beschriftung selbst ändert der Aufrufer, z. B. „Speichert …“)
		pending?: boolean;
	}) {
	const Comp = asChild ? Slot.Root : "button";
	return (
		<Comp
			data-slot="button"
			className={cn(buttonVariants({ variant, size }), className)}
			disabled={asChild ? disabled : disabled || pending}
			aria-busy={pending || undefined}
			{...props}
		>
			{pending && !asChild ? (
				<>
					<Loader2 className="animate-spin" aria-hidden="true" />
					{children}
				</>
			) : (
				children
			)}
		</Comp>
	);
}

export { Button, buttonVariants };
