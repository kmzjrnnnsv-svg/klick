import { Paperclip } from "lucide-react";

// Unterlagen einer Managementanfrage als Download-Links (auditiert über
// /api/nachweise/[id])
export function DecisionAttachments({
	items,
	label,
}: {
	items: readonly { id: string; title: string }[];
	label: string;
}) {
	if (items.length === 0) return null;
	return (
		<ul aria-label={label} className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
			{items.map((a) => (
				<li key={a.id} className="min-w-0">
					<a
						href={`/api/nachweise/${a.id}`}
						className="inline-flex max-w-full items-center gap-1 text-primary text-xs underline-offset-4 hover:underline"
					>
						<Paperclip aria-hidden className="size-3 shrink-0" />
						<span className="truncate">{a.title}</span>
					</a>
				</li>
			))}
		</ul>
	);
}
