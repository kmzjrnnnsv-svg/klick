// Geteilte dekorative Elemente der Marketing-Seiten (Kandidat:innen-
// Startseite + Arbeitgeber-Startseite). Bewusst klein gehalten — nur
// was wirklich auf beiden Seiten identisch auftaucht.

export function MonogramPattern({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 200 200"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
		>
			<defs>
				<pattern id="lvk" width="50" height="50" patternUnits="userSpaceOnUse">
					<g fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.45">
						<circle cx="25" cy="25" r="9" />
						<path d="M16 25 L34 25 M25 16 L25 34" />
						<path d="M19 19 L31 31 M31 19 L19 31" />
					</g>
				</pattern>
			</defs>
			<rect width="200" height="200" fill="url(#lvk)" />
		</svg>
	);
}

export function SectionDivider() {
	return <div className="mx-auto my-20 h-px w-24 bg-border sm:my-28" />;
}
