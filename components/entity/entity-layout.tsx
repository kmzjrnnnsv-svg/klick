import type { ReactNode } from "react";
import { BackLink } from "@/components/ui/back-link";

// Seitentyp Detail: Kopf (Code, Titel, Status-Button, Verantwortliche,
// Fälligkeit), Hauptspalte mit Fachsektionen, Seitenleiste mit EINEM
// Aktivitätsstrom (Kommentare + Feld-Historie), darunter Aufgaben und
// Verknüpfungen. Mobil rutscht die Seitenleiste unter die Hauptspalte.
// Gestaltung nach Apple HIG: Titel fett, Eckdaten als gruppierter Abschnitt,
// Abschnittsköpfe in Satzschreibung (Headline), keine Versalien.
export function EntityLayout({
	back,
	eyebrow,
	title,
	subtitle,
	status,
	meta,
	actions,
	children,
	aside,
}: {
	// Zurück zur Elternseite (Chevron links + Titel, docs/design/hig.md)
	back?: { href: string; label: string };
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
			<div className="mb-8 flex flex-col gap-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0">
						{back && <BackLink href={back.href} label={back.label} />}
						<p className="font-medium text-footnote text-muted-foreground">
							{eyebrow}
						</p>
						<h1 className="mt-0.5 hyphens-auto break-words font-bold text-foreground text-title-1 text-balance">
							{title}
						</h1>
						{subtitle && (
							<p className="mt-2 max-w-2xl text-callout text-muted-foreground">
								{subtitle}
							</p>
						)}
					</div>
					<div className="flex min-w-0 flex-wrap items-center gap-2 sm:max-w-[60%] sm:shrink-0 sm:justify-end">
						{status}
						{actions}
					</div>
				</div>
				{meta && (
					<dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-2xl bg-card px-4 py-3.5 text-subhead sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
						{meta}
					</dl>
				)}
			</div>
			<div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
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
			<dt className="text-footnote text-muted-foreground">{label}</dt>
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
			<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
				<h2 className="font-semibold text-foreground text-headline">{title}</h2>
				{actions}
			</div>
			{children}
		</section>
	);
}
