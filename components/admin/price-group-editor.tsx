"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	deletePriceGroup,
	savePriceGroup,
	setDefaultPriceGroup,
} from "@/app/actions/pricing";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
	PRICE_LEVELS,
	type PriceLevel,
	type PriceMode,
} from "@/db/schema/enums";
import type { PriceGroup, PriceOverride } from "@/db/schema/pricing";
import { PRICE_ITEMS, type PriceItemKey } from "@/lib/pricing/items";
import { LEVEL_LABEL, presetAmount } from "@/lib/pricing/presets";
import { euro, formatPrice, resolvePrices } from "@/lib/pricing/resolve";

type RowMode = "level" | PriceMode;
type Row = { mode: RowMode; amount: string; unit: string };

const MODE_LABEL: Record<RowMode, string> = {
	level: "Stufe",
	from: "ab",
	fixed: "fest",
	on_request: "auf Anfrage",
};

const parseAmount = (v: string): number | null | "invalid" => {
	const s = v.replaceAll(/[.\s€]/g, "");
	if (!s) return null;
	const n = Number(s);
	return Number.isInteger(n) && n >= 0 ? n : "invalid";
};

export function PriceGroupEditor({
	group,
	overrides,
}: {
	group: PriceGroup | null;
	overrides: readonly Pick<
		PriceOverride,
		"itemKey" | "mode" | "amount" | "unit"
	>[];
}) {
	const router = useRouter();
	const [pending, start] = useTransition();
	const [name, setName] = useState(group?.name ?? "");
	const [slug, setSlug] = useState(group?.slug ?? "");
	const [description, setDescription] = useState(group?.description ?? "");
	const [sortOrder, setSortOrder] = useState(String(group?.sortOrder ?? 0));
	const [level, setLevel] = useState<PriceLevel>(group?.level ?? "market");
	const [rows, setRows] = useState<Record<PriceItemKey, Row>>(() => {
		const byKey = new Map(overrides.map((o) => [o.itemKey, o]));
		return Object.fromEntries(
			PRICE_ITEMS.map((i) => {
				const o = byKey.get(i.key);
				return [
					i.key,
					o
						? {
								mode: o.mode,
								amount: o.amount === null ? "" : String(o.amount),
								unit: o.unit ?? "",
							}
						: { mode: "level", amount: "", unit: "" },
				];
			}),
		) as Record<PriceItemKey, Row>;
	});

	const draft = useMemo(
		() =>
			PRICE_ITEMS.flatMap((i) => {
				const r = rows[i.key];
				if (r.mode === "level") return [];
				const amount = parseAmount(r.amount);
				return [
					{
						itemKey: i.key,
						mode: r.mode,
						amount: amount === "invalid" ? null : amount,
						unit: r.unit.trim() || null,
						invalid: amount === "invalid",
					},
				];
			}),
		[rows],
	);
	const preview = useMemo(() => resolvePrices(level, draft), [level, draft]);

	const setRow = (key: PriceItemKey, patch: Partial<Row>) =>
		setRows((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

	const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
		start(async () => {
			const res = await fn();
			if (!res.ok) {
				toast.error(res.error ?? "Fehler");
				return;
			}
			toast.success("Gespeichert");
			router.refresh();
		});

	return (
		<form
			className="flex flex-col gap-6"
			onSubmit={(e) => {
				e.preventDefault();
				if (draft.some((d) => d.invalid)) {
					toast.error("Beträge nur als ganze Euro eingeben.");
					return;
				}
				start(async () => {
					const res = await savePriceGroup({
						id: group?.id,
						slug: slug.trim(),
						name,
						description,
						level,
						sortOrder: Number(sortOrder) || 0,
						overrides: draft.map(({ invalid: _, ...o }) => o),
					});
					if (!res.ok) {
						toast.error(
							res.fieldErrors
								? `${res.error}: ${Object.keys(res.fieldErrors).join(", ")}`
								: res.error,
						);
						return;
					}
					toast.success("Gespeichert");
					router.push(`/admin/preise?gruppe=${res.data.id}`);
					router.refresh();
				});
			}}
		>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div className="grid gap-2">
					<Label htmlFor="pg-name">Name</Label>
					<Input
						id="pg-name"
						name="name"
						autoComplete="off"
						value={name}
						onChange={(e) => {
							setName(e.target.value);
							if (!group)
								setSlug(
									e.target.value
										.toLowerCase()
										.replaceAll("ä", "ae")
										.replaceAll("ö", "oe")
										.replaceAll("ü", "ue")
										.replaceAll("ß", "ss")
										.replaceAll(/[^a-z0-9]+/g, "-")
										.replaceAll(/^-+|-+$/g, "")
										.slice(0, 48),
								);
						}}
						required
					/>
				</div>
				<div className="grid gap-2">
					<Label htmlFor="pg-slug">Kürzel</Label>
					<Input
						id="pg-slug"
						name="slug"
						autoComplete="off"
						spellCheck={false}
						value={slug}
						onChange={(e) => setSlug(e.target.value)}
						className="font-mono"
						required
					/>
				</div>
				<div className="grid gap-2 sm:col-span-2">
					<Label htmlFor="pg-description">Für wen (intern)</Label>
					<Textarea
						id="pg-description"
						name="description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="z. B. bis 50 Beschäftigte…"
						className="min-h-16"
					/>
				</div>
				<div className="grid gap-2">
					<Label htmlFor="pg-level">Stufe</Label>
					<Select
						value={level}
						onValueChange={(v) => setLevel(v as PriceLevel)}
					>
						<SelectTrigger id="pg-level" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PRICE_LEVELS.map((l) => (
								<SelectItem key={l} value={l}>
									{LEVEL_LABEL[l]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<p className="text-muted-foreground text-xs">
						{level === "custom"
							? "Nur eigene Werte gelten; Positionen ohne Wert stehen „auf Anfrage“."
							: "Die Stufe liefert alle Werte; eigene Werte je Position gehen vor."}
					</p>
				</div>
				<div className="grid gap-2">
					<Label htmlFor="pg-sort">Reihenfolge</Label>
					<Input
						id="pg-sort"
						name="sortOrder"
						type="number"
						inputMode="numeric"
						min={0}
						max={999}
						value={sortOrder}
						onChange={(e) => setSortOrder(e.target.value)}
					/>
				</div>
			</div>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Position</TableHead>
						<TableHead>Art</TableHead>
						<TableHead>Betrag (€ netto)</TableHead>
						<TableHead>Einheit</TableHead>
						<TableHead>Anzeige</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{PRICE_ITEMS.map((item) => {
						const r = rows[item.key];
						const base = presetAmount(level, item.key);
						const own = r.mode === "from" || r.mode === "fixed";
						return (
							<TableRow key={item.key}>
								<TableCell className="min-w-48">
									<span className="font-medium">{item.label}</span>
									<span className="block font-mono text-[0.68rem] text-muted-foreground">
										{item.key}
									</span>
								</TableCell>
								<TableCell className="min-w-32">
									<Select
										value={r.mode}
										onValueChange={(v) =>
											setRow(item.key, { mode: v as RowMode })
										}
									>
										<SelectTrigger
											className="w-full"
											aria-label={`Art: ${item.label}`}
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{(Object.keys(MODE_LABEL) as RowMode[]).map((m) => (
												<SelectItem key={m} value={m}>
													{MODE_LABEL[m]}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</TableCell>
								<TableCell className="min-w-28">
									<Input
										aria-label={`Betrag: ${item.label}`}
										name={`amount-${item.key}`}
										inputMode="numeric"
										autoComplete="off"
										className="tabular-nums"
										value={own ? r.amount : ""}
										placeholder={base === null ? "—" : euro(base)}
										disabled={!own}
										onChange={(e) =>
											setRow(item.key, { amount: e.target.value })
										}
									/>
								</TableCell>
								<TableCell className="min-w-32">
									<Input
										aria-label={`Einheit: ${item.label}`}
										name={`unit-${item.key}`}
										autoComplete="off"
										value={own ? r.unit : ""}
										placeholder={item.unit ?? "—"}
										disabled={!own}
										onChange={(e) => setRow(item.key, { unit: e.target.value })}
									/>
								</TableCell>
								<TableCell className="min-w-32 tabular-nums">
									{formatPrice(preview[item.key])}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>

			<div className="flex flex-wrap gap-2">
				<Button type="submit" variant="brown" disabled={pending}>
					Speichern
				</Button>
				{group && !group.isDefault && (
					<>
						<Button
							type="button"
							variant="outline"
							disabled={pending}
							onClick={() => run(() => setDefaultPriceGroup(group.id))}
						>
							Als Standard setzen
						</Button>
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button type="button" variant="destructive" disabled={pending}>
									Löschen
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>„{group.name}“ löschen?</AlertDialogTitle>
									<AlertDialogDescription>
										Die Gruppe und ihre eigenen Werte sind danach weg. Das geht
										nur, wenn ihr keine Organisation mehr zugeordnet ist.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Abbrechen</AlertDialogCancel>
									<AlertDialogAction
										className={buttonVariants({ variant: "destructive" })}
										onClick={() =>
											start(async () => {
												const res = await deletePriceGroup(group.id);
												if (!res.ok) {
													toast.error(res.error);
													return;
												}
												toast.success("Gruppe gelöscht");
												router.push("/admin/preise");
												router.refresh();
											})
										}
									>
										Gruppe löschen
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</>
				)}
			</div>
		</form>
	);
}
