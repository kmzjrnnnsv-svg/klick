import type { ReactNode } from "react";

// Seitentyp Detail: Kopf (Code, Titel, Status-Button, Verantwortliche,
// Fälligkeit), Hauptspalte mit Fachsektionen, Seitenleiste mit EINEM
// Aktivitätsstrom (Kommentare + Feld-Historie), darunter Aufgaben und
// Verknüpfungen. Mobil rutscht die Seitenleiste unter die Hauptspalte.
export function EntityLayout({
	eyebrow,
	title,
	subtitle,
	status,
	meta,
	actions,
	children,
	aside,
}: {
	eyebrow: string;
	title: string;
	subtitle?: string;
	status?: ReactNode;
	meta?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
	aside: ReactNode;
}) {
	return (
		<>
			<div className="mb-6 flex flex-col gap-4 border-border/60 border-b pb-6">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0">
						<p className="lv-eyebrow text-[0.6rem] text-brown">{eyebrow}</p>
						<h1 className="mt-2 font-serif-display text-2xl text-primary sm:text-3xl">
							{title}
						</h1>
						{subtitle && (
							<p className="mt-2 max-w-2xl text-muted-foreground text-sm">
								{subtitle}
							</p>
						)}
					</div>
					<div className="flex shrink-0 flex-wrap items-center gap-2">
						{status}
						{actions}
					</div>
				</div>
				{meta && (
					<dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
						{meta}
					</dl>
				)}
			</div>
			<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="flex min-w-0 flex-col gap-8">{children}</div>
				<aside className="flex min-w-0 flex-col gap-6">{aside}</aside>
			</div>
		</>
	);
}

export function MetaItem({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="lv-eyebrow text-[0.52rem] text-muted-foreground">
				{label}
			</dt>
			<dd className="min-w-0 truncate">{children}</dd>
		</div>
	);
}

export function Section({
	title,
	children,
	actions,
	id,
}: {
	title: string;
	children: ReactNode;
	actions?: ReactNode;
	id?: string;
}) {
	return (
		<section id={id} className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-3">
				<h2 className="lv-eyebrow text-[0.6rem] text-muted-foreground">
					{title}
				</h2>
				{actions}
			</div>
			{children}
		</section>
	);
}
