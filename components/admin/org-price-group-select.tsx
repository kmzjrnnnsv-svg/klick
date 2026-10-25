"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { assignPriceGroup } from "@/app/actions/pricing";
import { errorText } from "@/components/ui/error-text";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

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
	const tc = useTranslations("Common");
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
						toast.error(errorText(tc, res));
						return;
					}
					toast.success("Preisgruppe zugeordnet");
					router.refresh();
				})
			}
		>
			<SelectTrigger
				size="sm"
				className="w-full min-w-44"
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
