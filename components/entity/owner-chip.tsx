"use client";

import type { FunctionKey } from "@/lib/compliance/function-key";
import { useFunctionLabel } from "./responsible-context";
import { UserChip } from "./user-chip";

// Verantwortlich in Registern und Detailseiten: bei einer Funktion (auch
// eigener Rolle) „Funktion · Person“, sonst nur die Person (Teil A)
export function OwnerChip({
	ownerFunction,
	name,
}: {
	ownerFunction?: FunctionKey | null;
	name: string | null | undefined;
}) {
	const label = useFunctionLabel();
	if (!ownerFunction) return <UserChip name={name} />;
	return (
		<span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5">
			<span>{label(ownerFunction)}</span>
			<UserChip name={name} fallback="nicht besetzt" />
		</span>
	);
}
