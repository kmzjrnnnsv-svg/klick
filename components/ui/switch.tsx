"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

// Schalter nach Apple HIG: Grün für „an“, am Touch-Bildschirm 51 × 31 px,
// sonst 40 × 24; das unsichtbare Vorfeld (.hit-area) bringt die Tippfläche
// auf 44 px. Gehört in Listenzeilen (components/ui/list.tsx), die die
// Bedeutung nennen.
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			className={cn(
				"hit-area peer inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 outline-none transition-[background-color] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-success data-[state=unchecked]:bg-input pointer-coarse:h-[1.9375rem] pointer-coarse:w-[3.1875rem]",
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className="pointer-events-none block size-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.2)] ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0 pointer-coarse:size-[1.6875rem] pointer-coarse:data-[state=checked]:translate-x-5"
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch };
