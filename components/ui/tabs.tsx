"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

// Segmentierte Steuerung nach Apple HIG (bis fünf Abschnitte): graue
// Schiene, gewähltes Segment angehoben. Nicht für die Hauptnavigation.

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			className={cn("flex flex-col gap-4", className)}
			{...props}
		/>
	);
}

// Mehr als fünf Abschnitte: waagrecht scrollende Kapseln statt Segmenten
function TabsList({
	className,
	children,
	...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
	const many = React.Children.toArray(children).length > 5;
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			data-many={many || undefined}
			className={cn(
				"group/tabs flex max-w-full items-center overflow-x-auto [scrollbar-width:none]",
				many
					? "gap-2"
					: "w-fit gap-0.5 rounded-[0.5625rem] bg-muted p-0.5",
				className,
			)}
			{...props}
		>
			{children}
		</TabsPrimitive.List>
	);
}

function TabsTrigger({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				"inline-flex h-(--control-h-sm) shrink-0 grow items-center justify-center gap-1.5 whitespace-nowrap rounded-[0.4375rem] px-3 font-medium text-foreground text-footnote transition-[background-color,box-shadow,color] hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-segment data-[state=active]:font-semibold data-[state=active]:shadow-[0_1px_3px_rgb(0_0_0/0.12)] group-data-[many]/tabs:grow-0 group-data-[many]/tabs:rounded-full group-data-[many]/tabs:bg-muted group-data-[many]/tabs:hover:bg-foreground/12 group-data-[many]/tabs:data-[state=active]:bg-primary-fill group-data-[many]/tabs:data-[state=active]:text-white group-data-[many]/tabs:data-[state=active]:shadow-none [&_svg]:size-4",
				className,
			)}
			{...props}
		/>
	);
}

function TabsContent({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content
			data-slot="tabs-content"
			className={cn("flex-1 outline-none", className)}
			{...props}
		/>
	);
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
