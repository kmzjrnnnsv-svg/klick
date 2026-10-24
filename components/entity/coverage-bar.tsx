import type { CoverageBucket } from "@/lib/compliance/coverage";

// Abdeckungsbalken: erfüllt (grün) · teilweise (gelb) · offen (grau).
// Segmente mit 2 px Abstand und runden Enden; die Zeile darunter nennt die
// Zahlen mit Farbpunkt, damit Farbe nie allein trägt.
export function CoverageBar({
	bucket,
	labels,
	compact,
}: {
	bucket: CoverageBucket;
	labels: {
		covered: string;
		partial: string;
		open: string;
		applicable: string;
	};
	compact?: boolean;
}) {
	const a = bucket.applicable || 1;
	const covered = (bucket.covered / a) * 100;
	const partial = (bucket.partial / a) * 100;
	return (
		<div className="flex flex-col gap-1">
			<div
				className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
				role="img"
				aria-label={`${labels.covered} ${bucket.covered}, ${labels.partial} ${bucket.partial}, ${labels.open} ${bucket.open}`}
			>
				{covered > 0 && (
					<div
						className="rounded-full bg-success"
						style={{ width: `${covered}%` }}
					/>
				)}
				{partial > 0 && (
					<div
						className="rounded-full bg-warning"
						style={{ width: `${partial}%` }}
					/>
				)}
			</div>
			{!compact && (
				<p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-footnote text-muted-foreground">
					<span className="inline-flex items-center gap-1.5">
						<span
							aria-hidden="true"
							className="size-2 rounded-full bg-success"
						/>
						{bucket.covered} {labels.covered}
					</span>
					<span className="inline-flex items-center gap-1.5">
						<span
							aria-hidden="true"
							className="size-2 rounded-full bg-warning"
						/>
						{bucket.partial} {labels.partial}
					</span>
					<span className="inline-flex items-center gap-1.5">
						<span
							aria-hidden="true"
							className="size-2 rounded-full bg-muted ring-1 ring-muted-foreground/40"
						/>
						{bucket.open} {labels.open}
					</span>
					<span>
						{bucket.applicable} {labels.applicable}
					</span>
				</p>
			)}
		</div>
	);
}
