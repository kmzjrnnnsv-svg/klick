import Link from "next/link";

export default function LegalLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<main
			id="inhalt"
			className="mx-auto flex w-full max-w-2xl grow flex-col gap-8 px-4 py-12"
		>
			<Link
				href="/"
				className="font-bold text-title-1 focus-visible:outline-2 focus-visible:outline-offset-4"
			>
				both.money
			</Link>
			{children}
		</main>
	);
}
