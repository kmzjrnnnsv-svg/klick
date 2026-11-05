import Link from "next/link";

// Titel einer bündigen geteilten Seite (Hilfe, Einstellungen) ab 1024 px in
// der Kopfleiste der App, über der Liste — wie der Fenstertitel in macOS.
// Liegt absolut in der rechten Spalte der App (data-scroll-root, relative);
// geteilte Seiten scrollen dort nicht, der Titel bleibt also in der Leiste.
// Darunter zeigt die Seite ihren Titel selbst.
export function NavTitle({ title, href }: { title: string; href: string }) {
	return (
		<div className="pointer-events-none absolute top-0 left-0 z-40 hidden h-14 items-center px-5 lg:flex">
			<Link
				href={href}
				className="hit-area pointer-events-auto font-semibold text-headline hover:opacity-70"
			>
				{title}
			</Link>
		</div>
	);
}
