import Link from "next/link";
import s from "./landing.module.css";

// Kopf der öffentlichen Seiten (Startseite abgemeldet, Fahrplan): eine
// Hauptaktion „Zugang anfragen“, „Anmelden“ nur als Textlink (Zugang gibt es
// nur per Einladung)
export function PublicHeader({ current }: { current: "home" | "roadmap" }) {
	const link =
		"hit-area rounded-sm px-1 py-1 text-subhead underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2";
	return (
		<header className={`border-b ${s.noPrint}`}>
			<a
				href="#inhalt"
				className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-subhead"
			>
				Zum Inhalt
			</a>
			<div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4">
				<Link
					href="/"
					aria-current={current === "home" ? "page" : undefined}
					className="hit-area font-bold text-title-2 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
					translate="no"
				>
					both.money
				</Link>
				<nav aria-label="Seiten">
					<ul className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 sm:gap-x-5">
						{/* am Handy nur Anmelden und die Hauptaktion; der Fahrplan steht
						    auch in der Fußzeile und auf der Seite */}
						<li className="hidden sm:list-item">
							<Link
								href="/roadmap"
								aria-current={current === "roadmap" ? "page" : undefined}
								className={`${link} ${current === "roadmap" ? "font-medium text-primary" : ""}`}
							>
								Fahrplan
							</Link>
						</li>
						<li>
							<Link href="/login" className={link}>
								Anmelden
							</Link>
						</li>
						<li>
							<Link
								href={current === "home" ? "#zugang" : "/#zugang"}
								className="inline-flex min-h-9 items-center whitespace-nowrap rounded-full bg-primary-fill px-4 font-semibold text-subhead text-white transition-[filter] hover:brightness-110 active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 pointer-coarse:min-h-11"
							>
								<span className="min-[430px]:hidden">Zugang</span>
								<span className="hidden min-[430px]:inline">
									Zugang anfragen
								</span>
							</Link>
						</li>
					</ul>
				</nav>
			</div>
		</header>
	);
}
