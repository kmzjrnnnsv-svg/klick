import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-opacity disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background select-none",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:opacity-90",
				outline:
					"border border-border bg-transparent hover:bg-muted text-foreground",
				ghost: "bg-transparent hover:bg-muted text-foreground",
			},
			size: {
				default: "h-11 px-5 text-sm",
				sm: "h-9 px-3 text-sm",
				lg: "h-12 px-6 text-base",
				icon: "h-9 w-9",
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
