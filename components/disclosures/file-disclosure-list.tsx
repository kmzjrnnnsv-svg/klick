"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { grantDisclosure, revokeDisclosure } from "@/app/actions/disclosures";

type Item = {
	id: string;
	filename: string;
	kind: "cv" | "certificate" | "badge" | "id_doc" | "other";
};

export function FileDisclosureList({
	interestId,
	items,
	grantedIds,
	disabled,
}: {
	interestId: string;
	items: Item[];
	grantedIds: Set<string>;
	disabled?: boolean;
}) {
	const t = useTranslations("Requests.disclosures");
	const [isPending, startTransition] = useTransition();

	if (items.length === 0) {
		return (
			<p className="rounded-lg border border-border border-dashed bg-muted/20 p-3 text-muted-foreground text-xs">
				{t("emptyVault")}
			</p>
		);
	}

	function toggle(itemId: string, granted: boolean) {
		startTransition(async () => {
			if (granted) {
				await revokeDisclosure(interestId, itemId);
			} else {
				await grantDisclosure(interestId, itemId);
			}
		});
	}

	return (
		<ul className="space-y-1.5">
			{items.map((it) => {
				const granted = grantedIds.has(it.id);
				return (
					<li
						key={it.id}
						className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2"
					>
						<label className="flex flex-1 cursor-pointer items-center gap-2.5">
							<input
								type="checkbox"
								checked={granted}
								onChange={() => toggle(it.id, granted)}
								disabled={isPending || disabled}
								className="h-4 w-4 accent-primary"
							/>
							<span className="min-w-0 flex-1 truncate text-sm">
								{it.filename}
							</span>
							<span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
								{t(`kind.${it.kind}`)}
							</span>
						</label>
						{isPending && (
							<Loader2
								className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
								strokeWidth={1.5}
							/>
						)}
					</li>
				);
			})}
		</ul>
	);
}
