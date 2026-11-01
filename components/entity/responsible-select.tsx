"use client";

import { useTranslations } from "next-intl";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { ResponsibleOption } from "@/lib/compliance/function-holders";
import { isOwnRoleKey } from "@/lib/compliance/function-key";
import { FUNCTION_REF } from "@/lib/validation/responsible-ref";
import { useFunctionLabel, useResponsibleOptions } from "./responsible-context";

export type { ResponsibleOption };

type Member = { userId: string; name: string };

const NONE = "none";

// „Verantwortlich“ als Funktion oder Person in einer Auswahl (Teil A):
// oben die besetzten Funktionen mit der Person, die sie gerade hält, dann
// die eigenen Rollen (ADR-024), darunter die Personen. Wert: `function:<key>`, Konto-ID oder null (niemand). Wer
// eine Funktion wählt, bleibt richtig zugeordnet, wenn sie neu besetzt wird.
export function ResponsibleSelect({
	id,
	value,
	onChange,
	members,
	functions,
	disabled,
	size = "default",
	allowNone = true,
	className = "w-full",
	"aria-label": ariaLabel,
}: {
	id?: string;
	value: string | null | undefined;
	onChange: (value: string | null) => void;
	members: readonly Member[];
	// ohne Angabe die besetzten Funktionen aus dem App-Rahmen
	functions?: readonly ResponsibleOption[];
	disabled?: boolean;
	size?: "sm" | "default";
	allowNone?: boolean;
	className?: string;
	"aria-label"?: string;
}) {
	const t = useTranslations("Entity");
	const label = useFunctionLabel();
	const fromShell = useResponsibleOptions();
	const options = functions ?? fromShell;
	const groups = [
		{
			key: "functions",
			label: t("responsibleFunctions"),
			list: options.filter((o) => !isOwnRoleKey(o.function)),
		},
		{
			key: "own",
			label: t("responsibleOwnRoles"),
			list: options.filter((o) => isOwnRoleKey(o.function)),
		},
	].filter((g) => g.list.length > 0);
	return (
		<Select
			value={value ?? NONE}
			onValueChange={(v) => onChange(v === NONE ? null : v)}
			disabled={disabled}
		>
			<SelectTrigger
				id={id}
				size={size}
				className={className}
				aria-label={ariaLabel}
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{allowNone && <SelectItem value={NONE}>—</SelectItem>}
				{groups.map((g) => (
					<SelectGroup key={g.key}>
						<SelectLabel>{g.label}</SelectLabel>
						{g.list.map((f) => (
							<SelectItem
								key={f.function}
								value={`${FUNCTION_REF}${f.function}`}
							>
								{label(f.function)}
								{f.holder && (
									<span className="text-muted-foreground"> · {f.holder}</span>
								)}
							</SelectItem>
						))}
					</SelectGroup>
				))}
				{groups.length > 0 && <SelectSeparator />}
				<SelectGroup>
					<SelectLabel>{t("responsiblePeople")}</SelectLabel>
					{members.map((m) => (
						<SelectItem key={m.userId} value={m.userId}>
							{m.name}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}

// Anzeige: „Funktion · Person“, bei Person nur der Name
export function ResponsibleLabel({
	ownerFunction,
	ownerName,
}: {
	ownerFunction?: ResponsibleOption["function"] | null;
	ownerName: string | null | undefined;
}) {
	const label = useFunctionLabel();
	if (!ownerFunction) return <>{ownerName ?? "—"}</>;
	return (
		<>
			{label(ownerFunction)}
			<span className="text-muted-foreground">
				{" · "}
				{ownerName ?? "—"}
			</span>
		</>
	);
}
