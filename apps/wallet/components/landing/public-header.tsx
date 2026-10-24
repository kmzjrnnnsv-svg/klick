import Link from "next/link";
import s from "./landing.module.css";

// Kopf der öffentlichen Seiten (Startseite abgemeldet, Fahrplan)
export function PublicHeader({ current }: { current: "home" | "roadmap" }) {
	const link =
		"rounded-sm px-1 py-1 text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2";
	return (
		<header className={`border-b ${s.noPrint}`}>
			<a
				href="#inhalt"
				className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm"
			>
				Zum Inhalt
			</a>
			<div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
				<Link
					href="/"
					aria-current={current === "home" ? "page" : undefined}
					className="font-serif-display text-2xl text-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
					translate="no"
				>
					both.money
				</Link>
				<nav aria-label="Seiten">
					<ul className="flex items-center gap-3 sm:gap-5">
						<li>
							<Link
								href="/roadmap"
								aria-current={current === "roadmap" ? "page" : undefined}
								className={`${link} ${current === "roadmap" ? "font-medium text-primary" : ""}`}
							>
								Fahrplan
							</Link>
						</li>
						<li>
							<Link
								href="/login"
								className="inline-flex min-h-9 items-center rounded-md bg-primary px-3.5 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
							>
								Anmelden
							</Link>
						</li>
					</ul>
				</nav>
			</div>
		</header>
	);
}
