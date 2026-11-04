import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Liste in Seitenleisten-Optik (Source List wie in Mail oder den
// Einstellungen am Mac) — derselbe Baustein wie das Menü beider Apps
// (components/shell/sidebar-nav.tsx, apps/wallet/components/shell/nav-links.tsx):
// Symbol in Akzentfarbe ohne Kachel, keine Karten und Trennlinien, Gruppenkopf
// klein und grau, Auswahl getönt. Für Listen neben dem Inhalt der geteilten
// Ansicht (Einstellungen, Hilfe, Kapitel), damit Menü und Liste wie eine
// Fläche wirken. Einklappbare Gruppen: SourceGroup (source-group.tsx).

// Gruppenkopf — geteilt mit SourceGroup
export const SOURCE_HEAD =
	"mb-0.5 flex min-h-7 items-center px-2 font-semibold text-footnote text-muted-foreground pointer-coarse:min-h-11";

export function SourceList({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex flex-col gap-4 text-subhead", className)}>
			{children}
		</div>
	);
}

// Zeilen einer Gruppe (ohne Kopf, z. B. die oberste Gruppe im Menü)
export function SourceItems({ children }: { children: ReactNode }) {
	return <ul className="flex flex-col gap-px">{children}</ul>;
}

export function SourceSection({
	title,
	children,
}: {
	title?: string;
	children: ReactNode;
}) {
	return (
		<section>
			{title && <h3 className={SOURCE_HEAD}>{title}</h3>}
			<SourceItems>{children}</SourceItems>
		</section>
	);
}

export function SourceItem({
	href,
	icon,
	title,
	current = false,
	trailing,
	truncate = false,
	onClick,
}: {
	href: string;
	icon?: ReactNode;
	title: ReactNode;
	current?: boolean;
	// rechts, z. B. eine Zahl
	trailing?: ReactNode;
	// eine Zeile, Rest mit „…“ (Menü); sonst bricht der Titel um
	truncate?: boolean;
	onClick?: () => void;
}) {
	return (
		<li>
			<Link
				href={href}
				onClick={onClick}
				aria-current={current ? "page" : undefined}
				className={cn(
					"flex min-h-8 items-center gap-2.5 rounded-md px-2 py-1 text-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11",
					current &&
						"bg-primary/12 font-semibold hover:bg-primary/12 dark:bg-primary/20",
				)}
			>
				{icon && (
					<span
						aria-hidden="true"
						className="flex shrink-0 text-primary [&_svg]:size-[1.125rem]"
					>
						{icon}
					</span>
				)}
				<span
					className={cn("min-w-0 flex-1", truncate ? "truncate" : "break-words")}
				>
					{title}
				</span>
				{trailing !== undefined && trailing !== null && trailing !== false && (
					<span className="ml-auto shrink-0 font-normal text-footnote text-muted-foreground tabular-nums">
						{trailing}
					</span>
				)}
			</Link>
		</li>
	);
}
