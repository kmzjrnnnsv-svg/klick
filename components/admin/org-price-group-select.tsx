"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { assignPriceGroup } from "@/app/actions/pricing";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const DEFAULT = "default";

export function OrgPriceGroupSelect({
	orgId,
	orgName,
	value,
	groups,
	defaultName,
}: {
	orgId: string;
	orgName: string;
	value: string | null;
	groups: readonly { id: string; name: string }[];
	defaultName: string | null;
}) {
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Select
			value={value ?? DEFAULT}
			disabled={pending}
			onValueChange={(v) =>
				start(async () => {
					const res = await assignPriceGroup({
						orgId,
						groupId: v === DEFAULT ? null : v,
					});
					if (!res.ok) {
						toast.error(res.error);
						return;
					}
					toast.success("Preisgruppe zugeordnet");
					router.refresh();
				})
			}
		>
			<SelectTrigger
				className="h-8 w-full min-w-44"
				aria-label={`Preisgruppe: ${orgName}`}
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={DEFAULT}>
					Automatisch{defaultName ? ` (${defaultName})` : ""}
				</SelectItem>
				{groups.map((g) => (
					<SelectItem key={g.id} value={g.id}>
						{g.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
