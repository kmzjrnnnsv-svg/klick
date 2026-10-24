import Link from "next/link";
import type {
	DigestTone,
	ReviewDigest,
} from "@/lib/compliance/management-review-digest";
import { fmtDate } from "@/lib/compliance/page-data";

const TONE: Record<DigestTone, string> = {
	ok: "text-success",
	info: "text-foreground",
	warn: "text-warning",
	alert: "text-destructive",
};

// Zusammenfassung aus Klick (B6): je Pflicht-Input Kennzahlen und die
// wichtigsten Einträge, live oder als Schnappschuss einer Bewertung.
export function ReviewDigestView({
	digest,
	labels,
}: {
	digest: ReviewDigest;
	labels: { period: string; open: string; nothing: string };
}) {
	return (
		<div className="flex flex-col gap-3">
			<p className="text-muted-foreground text-footnote">
				{labels.period} {fmtDate.format(new Date(digest.from))} –{" "}
				{fmtDate.format(new Date(digest.to))}
			</p>
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
				{digest.sections.map((s) => (
					<section
						key={s.key}
						className="flex flex-col gap-2 rounded-2xl bg-card p-3 text-subhead"
					>
						<div className="flex items-start justify-between gap-2">
							<h3 className="font-medium leading-snug">{s.title}</h3>
							{s.href && (
								<Link
									href={s.href}
									className="shrink-0 text-primary text-footnote hover:underline"
								>
									{labels.open}
								</Link>
							)}
						</div>
						{s.facts.length > 0 ? (
							<dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 text-footnote">
								{s.facts.map((f) => (
									<div key={f.label} className="contents">
										<dt className="text-muted-foreground">{f.label}</dt>
										<dd
											className={`text-right font-medium tabular-nums ${TONE[f.tone]}`}
										>
											{f.value}
										</dd>
									</div>
								))}
							</dl>
						) : (
							<p className="text-muted-foreground text-footnote">
								{labels.nothing}
							</p>
						)}
						{s.items.length > 0 && (
							<ul className="flex flex-col gap-0.5 border-t pt-2 text-footnote">
								{s.items.map((i) => (
									<li key={`${i.title}-${i.note ?? ""}`} className="min-w-0">
										{i.href ? (
											<Link href={i.href} className="hover:underline">
												{i.title}
											</Link>
										) : (
											i.title
										)}
										{i.note && (
											<span className="text-muted-foreground"> — {i.note}</span>
										)}
									</li>
								))}
							</ul>
						)}
					</section>
				))}
			</div>
		</div>
	);
}
