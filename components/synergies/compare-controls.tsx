"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

// Steuerung des Quervergleichs: zwei Rahmenwerke und ein Stichtag — alles
// in der URL (?tab=vergleich&a=…&b=…&stichtag=…), damit der Vergleich teilbar ist.
export function CompareControls({
	options,
	a,
	b,
	asOf,
}: {
	options: { slug: string; name: string }[];
	a: string;
	b: string;
	asOf: string | null;
}) {
	const t = useTranslations("Synergies");
	const router = useRouter();
	const push = (next: { a?: string; b?: string; asOf?: string | null }) => {
		const params = new URLSearchParams({
			tab: "vergleich",
			a: next.a ?? a,
			b: next.b ?? b,
		});
		const d = next.asOf === undefined ? asOf : next.asOf;
		if (d) params.set("stichtag", d);
		router.push(`/synergien?${params.toString()}`);
	};
	const Picker = ({
		label,
		value,
		onChange,
	}: {
		label: string;
		value: string;
		onChange: (v: string) => void;
	}) => (
		<div className="flex flex-col gap-1.5">
			<Label>{label}</Label>
			<Select value={value} onValueChange={onChange}>
				<SelectTrigger className="w-full sm:w-64">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map((o) => (
						<SelectItem key={o.slug} value={o.slug}>
							{o.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
	return (
		<div className="mb-4 flex flex-wrap items-end gap-3">
			<Picker
				label={t("compareA")}
				value={a}
				onChange={(v) => push({ a: v })}
			/>
			<Picker
				label={t("compareB")}
				value={b}
				onChange={(v) => push({ b: v })}
			/>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="cmp-date">{t("asOf")}</Label>
				<Input
					id="cmp-date"
					type="date"
					className="w-44"
					value={asOf ?? ""}
					onChange={(e) => push({ asOf: e.target.value || null })}
				/>
			</div>
			<div className="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={() => push({ asOf: null })}
				>
					{t("today")}
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => push({ asOf: "2027-07-10" })}
				>
					AMLR 10.07.2027
				</Button>
			</div>
		</div>
	);
}
