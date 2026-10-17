"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type LinkOption = { id: string; label: string; hint?: string };
export type LinkGroup = {
	key: string;
	title: string;
	options: LinkOption[];
	linked: string[];
};

// Durchsuchbare Mehrfachauswahl für eine Art von Verknüpfung.
export function LinkCheckList({
	title,
	options,
	selected,
	onChange,
}: {
	title: string;
	options: LinkOption[];
	selected: Set<string>;
	onChange: (next: Set<string>) => void;
}) {
	const t = useTranslations("Entity");
	const [q, setQ] = useState("");
	const visible = useMemo(() => {
		const needle = q.trim().toLowerCase();
		return needle
			? options.filter((o) =>
					`${o.label} ${o.hint ?? ""}`.toLowerCase().includes(needle),
				)
			: options;
	}, [options, q]);
	return (
		<fieldset className="flex min-w-0 flex-col gap-2">
			<legend className="lv-eyebrow mb-1 text-[0.52rem] text-muted-foreground">
				{title} · {selected.size}
			</legend>
			<Input
				value={q}
				onChange={(e) => setQ(e.target.value)}
				placeholder={t("linksFilter")}
				aria-label={`${title}: ${t("linksFilter")}`}
				className="h-8"
			/>
			<div className="max-h-44 overflow-y-auto rounded-md border p-2 text-sm">
				{options.length === 0 ? (
					<p className="text-muted-foreground text-xs">{t("linksNone")}</p>
				) : visible.length === 0 ? (
					<p className="text-muted-foreground text-xs">{t("linksNoMatch")}</p>
				) : (
					visible.map((o) => (
						<label key={o.id} className="flex items-start gap-2 py-0.5">
							<Checkbox
								checked={selected.has(o.id)}
								onCheckedChange={(v) => {
									const next = new Set(selected);
									if (v) next.add(o.id);
									else next.delete(o.id);
									onChange(next);
								}}
							/>
							<span className="min-w-0">
								<span className="block truncate">{o.label}</span>
								{o.hint && (
									<span className="block truncate text-muted-foreground text-xs">
										{o.hint}
									</span>
								)}
							</span>
						</label>
					))
				)}
			</div>
		</fieldset>
	);
}

// Dialog „Verknüpfungen bearbeiten“: eine Liste je Gruppe; beim Öffnen gilt
// der gespeicherte Stand (Abbrechen verwirft), während des Speicherns gesperrt.
export function LinksDialog({
	triggerLabel,
	title,
	lead,
	groups,
	onSave,
}: {
	triggerLabel: string;
	title: string;
	lead?: string;
	groups: LinkGroup[];
	onSave: (selection: Record<string, string[]>) => Promise<boolean>;
}) {
	const tc = useTranslations("Common");
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const initial = () =>
		Object.fromEntries(groups.map((g) => [g.key, new Set(g.linked)]));
	const [sel, setSel] = useState<Record<string, Set<string>>>(initial);
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (pending) return;
				if (next) setSel(initial());
				setOpen(next);
			}}
		>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					{triggerLabel}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{lead && <DialogDescription>{lead}</DialogDescription>}
				</DialogHeader>
				<div className="grid gap-4 sm:grid-cols-2">
					{groups.map((g) => (
						<LinkCheckList
							key={g.key}
							title={g.title}
							options={g.options}
							selected={sel[g.key] ?? new Set()}
							onChange={(next) => setSel((s) => ({ ...s, [g.key]: next }))}
						/>
					))}
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						disabled={pending}
						onClick={() => setOpen(false)}
					>
						{tc("cancel")}
					</Button>
					<Button
						disabled={pending}
						onClick={() =>
							start(async () => {
								const ok = await onSave(
									Object.fromEntries(
										Object.entries(sel).map(([k, v]) => [k, [...v]]),
									),
								);
								if (ok) setOpen(false);
							})
						}
					>
						{tc("save")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
