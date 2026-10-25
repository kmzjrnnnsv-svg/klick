"use client";

import { switchOrg } from "@wallet/app/actions/auth";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function OrgChoice({
	orgs,
	next,
}: {
	orgs: { orgId: string; name: string; role: string }[];
	next: string;
}) {
	const t = useTranslations("Orgs");
	const router = useRouter();
	const [busy, setBusy] = useState<string | null>(null);

	async function open(orgId: string) {
		setBusy(orgId);
		const res = await switchOrg(orgId);
		setBusy(null);
		if (res.ok) {
			router.push(next);
			router.refresh();
		}
	}

	return (
		<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card">
			{orgs.map((o) => (
				<li
					key={o.orgId}
					className="flex items-center justify-between gap-4 p-4"
				>
					<div className="min-w-0">
						<p className="truncate font-medium">{o.name}</p>
						<p className="text-muted-foreground text-footnote">{o.role}</p>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => open(o.orgId)}
						disabled={busy !== null}
					>
						{t("choose")}
					</Button>
				</li>
			))}
		</ul>
	);
}
