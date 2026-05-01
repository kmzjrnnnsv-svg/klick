import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({
	className,
	...props
}: InputHTMLAttributes<HTMLInputElement>) {
	return (
		<input
			className={cn(
				"flex h-11 w-full rounded-sm border-0 border-b border-border/80 bg-transparent px-1 py-2 text-sm tracking-wide placeholder:text-muted-foreground/70 focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}
