"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

function RadioGroup({
	className,
	...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
	return (
		<RadioGroupPrimitive.Root
			data-slot="radio-group"
			className={cn("grid gap-2", className)}
			{...props}
		/>
	);
}

// Karte als Radio: ganze Fläche klickbar, Pfeiltasten wechseln (Radix).
function RadioCard({
	className,
	children,
	...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
	return (
		<RadioGroupPrimitive.Item
			data-slot="radio-card"
			className={cn(
				"flex w-full flex-col items-start gap-1 rounded-md border border-input p-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary/5",
				className,
			)}
			{...props}
		>
			{children}
		</RadioGroupPrimitive.Item>
	);
}

export { RadioCard, RadioGroup };
