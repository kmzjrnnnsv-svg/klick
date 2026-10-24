import Link from "next/link";

// Anmelden, Aktivieren, Einladung, Entsperren, Org wählen: schmale Spalte
// mit Wortmarke, ohne Navigation.
export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<main
			id="inhalt"
			className="mx-auto flex w-full max-w-md grow flex-col justify-center gap-8 px-4 py-12"
		>
			<Link
				href="/"
				className="font-serif-display text-3xl text-primary focus-visible:outline-2 focus-visible:outline-offset-4"
			>
				both.money
			</Link>
			{children}
		</main>
	);
}
