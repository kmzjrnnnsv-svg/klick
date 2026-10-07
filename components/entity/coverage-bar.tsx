import type { CoverageBucket } from "@/lib/compliance/coverage";

// Abdeckungsbalken: erfüllt (grün) · teilweise (gelb) · offen (grau).
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
				className="flex h-2 w-full overflow-hidden rounded-sm bg-muted"
				role="img"
				aria-label={`${labels.covered} ${bucket.covered}, ${labels.partial} ${bucket.partial}, ${labels.open} ${bucket.open}`}
			>
				<div className="bg-success" style={{ width: `${covered}%` }} />
				<div className="bg-warning" style={{ width: `${partial}%` }} />
			</div>
			{!compact && (
				<p className="text-muted-foreground text-xs">
					{bucket.covered} {labels.covered} · {bucket.partial} {labels.partial}{" "}
					· {bucket.open} {labels.open} · {bucket.applicable}{" "}
					{labels.applicable}
				</p>
			)}
		</div>
	);
}
