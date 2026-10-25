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
import { FUNCTION_REF } from "@/lib/validation/responsible";
import { useResponsibleOptions } from "./responsible-context";

export type { ResponsibleOption };

type Member = { userId: string; name: string };

const NONE = "none";

// „Verantwortlich“ als Funktion oder Person in einer Auswahl (Teil A):
// oben die besetzten Funktionen mit der Person, die sie gerade hält, darunter
// die Personen. Wert: `function:<key>`, Konto-ID oder null (niemand). Wer
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
	const tf = useTranslations("Functions");
	const fromShell = useResponsibleOptions();
	const options = functions ?? fromShell;
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
				{options.length > 0 && (
					<SelectGroup>
						<SelectLabel>{t("responsibleFunctions")}</SelectLabel>
						{options.map((f) => (
							<SelectItem
								key={f.function}
								value={`${FUNCTION_REF}${f.function}`}
							>
								{tf(f.function)}
								{f.holder && (
									<span className="text-muted-foreground"> · {f.holder}</span>
								)}
							</SelectItem>
						))}
					</SelectGroup>
				)}
				{options.length > 0 && <SelectSeparator />}
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
	const tf = useTranslations("Functions");
	if (!ownerFunction) return <>{ownerName ?? "—"}</>;
	return (
		<>
			{tf(ownerFunction)}
			<span className="text-muted-foreground">
				{" · "}
				{ownerName ?? "—"}
			</span>
		</>
	);
}
