"use client";

import { ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { switchOrganization } from "@/app/actions/memberships";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";

export type SwitcherOrg = {
	organizationId: string;
	orgName: string;
	roleLabel: string;
	expired: boolean;
};

// Org-Umschalter im Sidebar-Kopf (ADR-018): nur bei mehr als einer
// Mitgliedschaft. Der Wechsel läuft über switchOrganization (Step-up
// verfällt, Audit), abgelaufene Zugänge sind nicht wählbar.
export function OrgSwitcher({
	currentOrgId,
	currentName,
	orgs,
}: {
	currentOrgId: string;
	currentName: string;
	orgs: readonly SwitcherOrg[];
}) {
	const tc = useTranslations("Common");
	const t = useTranslations("Organisations");
	const [pending, start] = useTransition();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className="flex min-h-(--control-h-sm) w-full min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
				aria-label={`${t("switch")}: ${currentName}`}
				disabled={pending}
			>
				<span className="min-w-0 flex-1 truncate font-medium text-footnote text-muted-foreground">
					{currentName}
				</span>
				<ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-64">
				<DropdownMenuLabel>{t("switch")}</DropdownMenuLabel>
				{orgs.map((o) => (
					<DropdownMenuItem
						key={o.organizationId}
						disabled={o.expired || o.organizationId === currentOrgId}
						onSelect={() =>
							start(async () => {
								const res = await switchOrganization(o.organizationId);
								if (res && !res.ok) toast.error(errorText(tc, res));
							})
						}
						className="flex flex-col items-start gap-0"
					>
						<span className="w-full truncate">{o.orgName}</span>
						<span className="text-muted-foreground text-footnote">
							{o.roleLabel}
							{o.expired && ` · ${t("expired")}`}
						</span>
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link href="/organisationen">{t("all")}</Link>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
