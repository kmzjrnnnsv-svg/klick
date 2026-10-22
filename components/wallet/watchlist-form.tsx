"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveWatchlist } from "@/app/actions/wallet";
import {
	EditTrigger,
	FormDialog,
} from "@/components/organisation/governance-forms";
import { Checkbox } from "@/components/ui/checkbox";
import type { Pair } from "@/lib/wallet/core/feeds";

// Watchlist auswählen: Häkchen je Paar, Reihenfolge wie im Katalog
export function WatchlistForm({
	all,
	selected,
	names,
}: {
	all: readonly Pair[];
	selected: readonly Pair[];
	names: Record<string, string>;
}) {
	const t = useTranslations("Wallet");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [pick, setPick] = useState<Pair[]>([...selected]);
	return (
		<FormDialog
			title={t("watchlistTitle")}
			lead={t("watchlistLead")}
			trigger={<EditTrigger label={t("watchlistEdit")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={pick.length === 0}
			onSubmit={() =>
				start(async () => {
					const res = await saveWatchlist({
						pairs: all.filter((p) => pick.includes(p)),
					});
					if (!res.ok) {
						toast.error(tc("error"));
						return;
					}
					setOpen(false);
					router.refresh();
				})
			}
		>
			<ul className="flex flex-col gap-1">
				{all.map((p) => {
					const id = `wl-${p.replace("/", "-")}`;
					return (
						<li key={p}>
							<label
								htmlFor={id}
								className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
							>
								<Checkbox
									id={id}
									checked={pick.includes(p)}
									onCheckedChange={(v) =>
										setPick(v ? [...pick, p] : pick.filter((x) => x !== p))
									}
								/>
								<span className="font-medium text-sm" translate="no">
									{p}
								</span>
								<span className="text-muted-foreground text-xs">
									{names[p]}
								</span>
							</label>
						</li>
					);
				})}
			</ul>
		</FormDialog>
	);
}
