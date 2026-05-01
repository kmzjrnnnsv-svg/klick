import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium uppercase tracking-[0.18em] transition-opacity disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background select-none",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:opacity-90",
				outline:
					"border border-foreground/40 bg-transparent hover:bg-foreground hover:text-background text-foreground",
				ghost: "bg-transparent hover:bg-muted text-foreground",
			},
			size: {
				default: "h-11 px-6 text-[0.72rem]",
				sm: "h-9 px-4 text-[0.68rem]",
				lg: "h-12 px-8 text-[0.78rem]",
				icon: "h-9 w-9 tracking-normal",
			},
		},
		defaultVariants: { variant: "default", size: "default" },
	},
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
	VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
	return (
		<button
			className={cn(buttonVariants({ variant, size }), className)}
			{...props}
		/>
	);
}

export { buttonVariants };
