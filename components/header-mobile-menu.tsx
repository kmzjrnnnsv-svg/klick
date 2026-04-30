"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HeaderMobileMenu({
	links,
	loginLabel,
	isLoggedIn,
	openLabel,
	closeLabel,
}: {
	links: { href: string; label: string }[];
	loginLabel: string;
	isLoggedIn: boolean;
	openLabel: string;
	closeLabel: string;
}) {
	const [open, setOpen] = useState(false);
	const pathname = usePathname();

	// Close on route change. We list `pathname` so the effect re-fires when
	// it changes; the body doesn't otherwise read it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger
	useEffect(() => {
		setOpen(false);
	}, [pathname]);

	// Lock background scroll while open.
	useEffect(() => {
		if (!open) return;
		const original = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = original;
		};
	}, [open]);

	if (links.length === 0 && isLoggedIn) {
		// Nothing useful to show on mobile (admin without nav etc.).
		return null;
	}

	return (
		<>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="sm:hidden"
				aria-expanded={open}
				aria-label={open ? closeLabel : openLabel}
				onClick={() => setOpen((v) => !v)}
			>
				{open ? (
					<X className="h-5 w-5" strokeWidth={1.5} />
				) : (
					<Menu className="h-5 w-5" strokeWidth={1.5} />
				)}
			</Button>

			{open && (
				<div className="fixed inset-x-0 top-14 z-30 sm:hidden">
					<div
						className="absolute inset-x-0 top-0 bg-background/80 backdrop-blur"
						style={{ height: "calc(100svh - 3.5rem)" }}
						onClick={() => setOpen(false)}
						aria-hidden
					/>
					<nav className="relative mx-2 mt-2 rounded-lg border border-border bg-popover p-1 shadow-lg">
						{links.map((l) => {
							const active =
								pathname === l.href ||
								(l.href !== "/" && pathname.startsWith(`${l.href}/`));
							return (
								<Link
									key={l.href}
									href={l.href}
									className={cn(
										"block rounded-md px-3 py-2.5 text-sm transition-colors",
										active
											? "bg-primary/10 font-medium text-primary"
											: "text-foreground hover:bg-muted",
									)}
								>
									{l.label}
								</Link>
							);
						})}
						{!isLoggedIn && (
							<Link
								href="/login"
								className="mt-1 block rounded-md bg-primary px-3 py-2.5 text-center font-medium text-primary-foreground text-sm"
							>
								{loginLabel}
							</Link>
						)}
					</nav>
				</div>
			)}
		</>
	);
}
