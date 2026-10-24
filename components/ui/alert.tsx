import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

// Hinweis im Inhalt (kein Modal): getönte Fläche, Symbol in der Statusfarbe,
// Text in der Vordergrundfarbe — Farbe nie allein, der Titel nennt den Zustand

const alertVariants = cva(
	"relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-xl px-4 py-3 text-subhead has-[>svg]:grid-cols-[calc(var(--spacing)*5)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-5 [&>svg]:text-current",
	{
		variants: {
			variant: {
				default: "bg-card text-card-foreground [&>svg]:text-primary",
				destructive: "bg-destructive/10 text-foreground [&>svg]:text-destructive dark:bg-destructive/18",
				warning: "bg-warning/12 text-foreground [&>svg]:text-warning dark:bg-warning/18",
				success: "bg-success/10 text-foreground [&>svg]:text-success dark:bg-success/18",
			},
		},
		defaultVariants: { variant: "default" },
	},
);

function Alert({
	className,
	variant,
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
	return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="alert-title"
			className={cn("col-start-2 min-h-5 font-semibold", className)}
			{...props}
		/>
	);
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="alert-description"
			className={cn("col-start-2 grid justify-items-start gap-1 text-foreground/80 text-subhead [&_p]:leading-relaxed", className)}
			{...props}
		/>
	);
}

export { Alert, AlertTitle, AlertDescription };
