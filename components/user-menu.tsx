"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/actions/session";
import { cn } from "@/lib/utils";

export function UserMenu({
	email,
	name,
	role,
}: {
	email: string;
	name: string | null;
	role: "candidate" | "employer" | "admin";
}) {
	const t = useTranslations("Header.user");
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		function onClick(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", onClick);
		return () => document.removeEventListener("mousedown", onClick);
	}, [open]);

	const initials = (name ?? email)
		.split(/\s+|@/)
		.filter(Boolean)
		.slice(0, 2)
		.map((s) => s[0]?.toUpperCase() ?? "")
		.join("");

	return (
		<div ref={ref} className="relative">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex h-8 items-center gap-1.5 rounded-md px-1.5 text-sm transition-colors hover:bg-muted"
				aria-label={t("openMenu")}
				aria-expanded={open}
			>
				<span className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 font-medium text-primary text-xs">
					{initials || "?"}
				</span>
				<ChevronDown
					className={cn(
						"h-3 w-3 shrink-0 text-muted-foreground transition-transform",
						open && "rotate-180",
					)}
					strokeWidth={1.5}
				/>
			</button>

			{open && (
				<div className="absolute right-0 mt-1 w-56 rounded-md border border-border bg-popover p-1 shadow-lg">
					<div className="border-border/60 border-b px-3 py-2">
						<p className="truncate font-medium text-sm">{name ?? email}</p>
						<p className="mt-0.5 truncate text-muted-foreground text-xs">
							{email}
						</p>
						<p className="mt-1 inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">
							{t(`role.${role}`)}
						</p>
					</div>
					<form action={logoutAction}>
						<button
							type="submit"
							className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
						>
							<LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
							{t("logout")}
						</button>
					</form>
				</div>
			)}
		</div>
	);
}
