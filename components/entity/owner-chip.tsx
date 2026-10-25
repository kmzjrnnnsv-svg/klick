"use client";

import { useTranslations } from "next-intl";
import type { RoleFunction } from "@/db/schema/enums";
import { UserChip } from "./user-chip";

// Verantwortlich in Registern und Detailseiten: bei einer Funktion
// „Funktion · Person“, sonst nur die Person (Teil A)
export function OwnerChip({
	ownerFunction,
	name,
}: {
	ownerFunction?: RoleFunction | null;
	name: string | null | undefined;
}) {
	const tf = useTranslations("Functions");
	if (!ownerFunction) return <UserChip name={name} />;
	return (
		<span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5">
			<span>{tf(ownerFunction)}</span>
			<UserChip name={name} fallback="nicht besetzt" />
		</span>
	);
}
