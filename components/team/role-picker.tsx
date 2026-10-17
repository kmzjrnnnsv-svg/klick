"use client";

import { Check, Eye, PenLine, ShieldCheck, Stamp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import type { OrgRole } from "@/lib/auth/permissions";
import {
	type CapabilityKey,
	capabilitiesFor,
	ROLE_ORDER,
} from "@/lib/auth/role-guide";

const ICON: Record<OrgRole, typeof Eye> = {
	viewer: Eye,
	editor: PenLine,
	owner: ShieldCheck,
	auditor: Stamp,
};

export const roleLabelKey = (r: OrgRole) =>
	`role${r[0]?.toUpperCase()}${r.slice(1)}` as "roleOwner";

// Liste „darf / darf nicht“ für eine Rolle (aus lib/auth/role-guide.ts).
export function CapabilityList({
	role,
	only,
}: {
	role: OrgRole;
	only?: readonly CapabilityKey[];
}) {
	const t = useTranslations("Team");
	const caps = capabilitiesFor(role).filter(
		(c) => !only || only.includes(c.key),
	);
	return (
		<ul className="flex flex-col gap-0.5 text-xs">
			{caps.map((c) => (
				<li
					key={c.key}
					className={
						c.allowed ? "flex gap-1.5" : "flex gap-1.5 text-muted-foreground"
					}
				>
					{c.allowed ? (
						<Check className="mt-px size-3.5 shrink-0 text-success" />
					) : (
						<X className="mt-px size-3.5 shrink-0" />
					)}
					<span>{t(`cap_${c.key}`)}</span>
				</li>
			))}
		</ul>
	);
}

// Rollen als Karten statt Dropdown: Icon, ein Satz, was die Rolle darf.
export function RolePicker({
	value,
	onChange,
	exclude = [],
}: {
	value: OrgRole;
	onChange: (role: OrgRole) => void;
	exclude?: readonly OrgRole[];
}) {
	const t = useTranslations("Team");
	return (
		<RadioGroup
			value={value}
			onValueChange={(v) => onChange(v as OrgRole)}
			className="sm:grid-cols-2"
			aria-label={t("inviteRole")}
		>
			{ROLE_ORDER.filter((r) => !exclude.includes(r)).map((r) => {
				const Icon = ICON[r];
				return (
					<RadioCard key={r} value={r}>
						<span className="flex items-center gap-2 font-medium text-sm">
							<Icon className="size-4 text-primary" />
							{t(roleLabelKey(r))}
						</span>
						<span className="text-muted-foreground text-xs">
							{t(`${roleLabelKey(r)}Hint` as "roleOwnerHint")}
						</span>
						{value === r && (
							<div className="mt-1">
								<CapabilityList role={r} />
							</div>
						)}
					</RadioCard>
				);
			})}
		</RadioGroup>
	);
}
