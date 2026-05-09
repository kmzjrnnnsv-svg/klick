"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function HeaderNavDropdown({
	label,
	links,
}: {
	label: string;
	links: { href: string; label: string }[];
}) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const pathname = usePathname();

	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger
	useEffect(() => {
		setOpen(false);
	}, [pathname]);

	useEffect(() => {
		if (!open) return;
		function onDoc(e: MouseEvent) {
			if (!containerRef.current?.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		document.addEventListener("mousedown", onDoc);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDoc);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const active = links.some(
		(l) =>
			pathname === l.href ||
			(l.href !== "/" && pathname.startsWith(`${l.href}/`)),
	);

	return (
		<div ref={containerRef} className="relative">
			<button
				type="button"
				aria-expanded={open}
				aria-haspopup="menu"
				onClick={() => setOpen((v) => !v)}
				className={cn(
					"lv-nav inline-flex items-center gap-0.5 px-1 py-1 text-[0.7rem] transition-colors hover:text-foreground",
					active ? "text-foreground" : "text-muted-foreground",
				)}
			>
				{label}
				<ChevronDown
					className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
					strokeWidth={1.5}
				/>
			</button>
			{open && (
				<div
					role="menu"
					className="absolute top-full right-0 z-40 mt-1 min-w-[10rem] rounded-sm border border-border bg-background p-1 shadow-md"
				>
					{links.map((l) => {
						const isActive =
							pathname === l.href ||
							(l.href !== "/" && pathname.startsWith(`${l.href}/`));
						return (
							<Link
								key={l.href}
								href={l.href}
								role="menuitem"
								className={cn(
									"block rounded-sm px-3 py-1.5 text-xs transition-colors",
									isActive
										? "bg-primary/10 font-medium text-primary"
										: "text-foreground hover:bg-muted",
								)}
							>
								{l.label}
							</Link>
						);
					})}
				</div>
			)}
		</div>
	);
}
