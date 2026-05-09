"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setUserRoleAsAdmin } from "@/app/actions/admin";

export function UserRoleSelect({
	userId,
	currentRole,
}: {
	userId: string;
	currentRole: "candidate" | "employer" | "admin";
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	function onChange(role: string) {
		if (role === currentRole) return;
		if (
			!confirm(
				`Rolle wirklich auf "${role}" ändern? Wirkt sofort, Audit-Log dokumentiert.`,
			)
		)
			return;
		startTransition(async () => {
			const res = await setUserRoleAsAdmin({
				userId,
				role: role as "candidate" | "employer" | "admin",
			});
			if (!res.ok) alert(res.error ?? "fehlgeschlagen");
			else router.refresh();
		});
	}

	return (
		<select
			defaultValue={currentRole}
			disabled={isPending}
			onChange={(e) => onChange(e.target.value)}
			className="rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]"
			aria-label="Rolle ändern"
		>
			<option value="candidate">candidate</option>
			<option value="employer">employer</option>
			<option value="admin">admin</option>
		</select>
	);
}
