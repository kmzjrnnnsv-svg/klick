"use client";

import { Plus, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	applyProcessSeed,
	setProcessLinks,
	setProcessRaci,
	upsertProcess,
} from "@/app/actions/processes";
import type { MemberOption } from "@/components/entity/owner-assignee";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ROLE_FUNCTIONS, type RoleFunction } from "@/db/schema/enums";

const CATEGORIES = ["core", "support", "management", "control"] as const;
const CRIT = ["critical", "important", "standard"] as const;
const RACI = ["R", "A", "C", "I"] as const;

export type ProcessDraft = {
	processId?: string;
	name: string;
	description?: string | null;
	category: (typeof CATEGORIES)[number];
	criticality: (typeof CRIT)[number];
	ownerUserId?: string | null;
	deputyUserId?: string | null;
	rtoHours?: number | null;
	rpoHours?: number | null;
	mtpdHours?: number | null;
	impactNotes?: string | null;
	inputs?: string | null;
	outputs?: string | null;
	reviewAt?: string | null;
};

function NumberField({
	id,
	label,
	value,
	onChange,
}: {
	id: string;
	label: string;
	value: number | null | undefined;
	onChange: (v: number | null) => void;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				type="number"
				min={0}
				value={value ?? ""}
				onChange={(e) =>
					onChange(e.target.value === "" ? null : Number(e.target.value))
				}
			/>
		</div>
	);
}

export function ProcessForm({
	initial,
	members,
	trigger,
}: {
	initial?: ProcessDraft;
	members: MemberOption[];
	trigger?: "button" | "link";
}) {
	const t = useTranslations("Processes");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<ProcessDraft>(
		initial ?? { name: "", category: "core", criticality: "standard" },
	);
	const set = <K extends keyof ProcessDraft>(k: K, v: ProcessDraft[K]) =>
		setD({ ...d, [k]: v });
	const userSelect = (label: string, key: "ownerUserId" | "deputyUserId") => (
		<div className="flex flex-col gap-1.5">
			<Label>{label}</Label>
			<Select
				value={d[key] ?? "none"}
				onValueChange={(v) => set(key, v === "none" ? null : v)}
			>
				<SelectTrigger className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="none">—</SelectItem>
					{members.map((m) => (
						<SelectItem key={m.userId} value={m.userId}>
							{m.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{trigger === "link" ? (
					<Button
						size="sm"
						variant="ghost"
						className="normal-case tracking-normal"
					>
						{tc("edit")}
					</Button>
				) : (
					<Button size="sm" variant="brown">
						<Plus />
						{t("new")}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await upsertProcess({
								...d,
								description: d.description ?? undefined,
								impactNotes: d.impactNotes ?? undefined,
								inputs: d.inputs ?? undefined,
								outputs: d.outputs ?? undefined,
								reviewAt: d.reviewAt || null,
							});
							if (!res.ok)
								return void toast.error(
									res.error === "codeTaken" ? t("codeTaken") : tc("error"),
								);
							toast.success(initial ? t("saved") : t("created"));
							setOpen(false);
							if (!initial) router.push(`/prozesse/${res.data.code}`);
							else router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{initial ? tc("edit") : t("new")}</DialogTitle>
						<DialogDescription>{t("formLead")}</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5 sm:col-span-2">
							<Label htmlFor="pr-name">{t("name")}</Label>
							<Input
								id="pr-name"
								value={d.name}
								onChange={(e) => set("name", e.target.value)}
								required
								maxLength={200}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("category")}</Label>
							<Select
								value={d.category}
								onValueChange={(v) =>
									set("category", v as ProcessDraft["category"])
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CATEGORIES.map((x) => (
										<SelectItem key={x} value={x}>
											{t(`category_${x}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("criticality")}</Label>
							<Select
								value={d.criticality}
								onValueChange={(v) =>
									set("criticality", v as ProcessDraft["criticality"])
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CRIT.map((x) => (
										<SelectItem key={x} value={x}>
											{t(`crit_${x}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{userSelect(t("owner"), "ownerUserId")}
						{userSelect(t("deputy"), "deputyUserId")}
						<NumberField
							id="pr-rto"
							label={t("rto")}
							value={d.rtoHours}
							onChange={(v) => set("rtoHours", v)}
						/>
						<NumberField
							id="pr-rpo"
							label={t("rpo")}
							value={d.rpoHours}
							onChange={(v) => set("rpoHours", v)}
						/>
						<NumberField
							id="pr-mtpd"
							label={t("mtpd")}
							value={d.mtpdHours}
							onChange={(v) => set("mtpdHours", v)}
						/>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pr-review">{t("reviewAt")}</Label>
							<Input
								id="pr-review"
								type="date"
								value={d.reviewAt ?? ""}
								onChange={(e) => set("reviewAt", e.target.value)}
							/>
						</div>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="pr-desc">{t("description")}</Label>
						<Textarea
							id="pr-desc"
							rows={2}
							value={d.description ?? ""}
							onChange={(e) => set("description", e.target.value)}
						/>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pr-in">{t("inputs")}</Label>
							<Textarea
								id="pr-in"
								rows={2}
								value={d.inputs ?? ""}
								onChange={(e) => set("inputs", e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pr-out">{t("outputs")}</Label>
							<Textarea
								id="pr-out"
								rows={2}
								value={d.outputs ?? ""}
								onChange={(e) => set("outputs", e.target.value)}
							/>
						</div>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="pr-impact">{t("impactNotes")}</Label>
						<Textarea
							id="pr-impact"
							rows={2}
							value={d.impactNotes ?? ""}
							onChange={(e) => set("impactNotes", e.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button type="submit" disabled={pending || !d.name.trim()}>
							{tc("save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// „Prozesslandkarte übernehmen": fehlende Katalog-Prozesse als Entwürfe anlegen.
export function ApplyProcessSeedButton({ variant }: { variant?: "brown" }) {
	const t = useTranslations("Processes");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			size="sm"
			variant={variant ?? "outline"}
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await applyProcessSeed({});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("seedApplied", { n: res.data.created.length }));
					router.refresh();
				})
			}
		>
			<Sparkles />
			{t("applySeed")}
		</Button>
	);
}

export type RaciRow = {
	userId: string | null;
	function: RoleFunction | null;
	raci: (typeof RACI)[number];
};

export function RaciEditor({
	processId,
	entries,
	members,
	functionLabels,
	canEdit,
}: {
	processId: string;
	entries: RaciRow[];
	members: MemberOption[];
	functionLabels: Record<string, string>;
	canEdit: boolean;
}) {
	const t = useTranslations("Processes");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [rows, setRows] = useState<RaciRow[]>(entries);
	const [mode, setMode] = useState<"person" | "function">("function");
	const [who, setWho] = useState<string>("");
	const [raci, setRaci] = useState<(typeof RACI)[number]>("R");
	const [pending, start] = useTransition();
	const accountable = rows.filter((r) => r.raci === "A").length;
	const dirty = JSON.stringify(rows) !== JSON.stringify(entries);
	const label = (r: RaciRow) =>
		r.userId
			? (members.find((m) => m.userId === r.userId)?.name ?? "—")
			: r.function
				? (functionLabels[r.function] ?? r.function)
				: "—";

	return (
		<div className="flex flex-col gap-3">
			<div
				className={`rounded-md border px-3 py-2 text-xs ${
					accountable === 1
						? "text-muted-foreground"
						: "border-destructive/40 bg-destructive/5 text-destructive"
				}`}
			>
				{accountable === 1
					? t("raciOk")
					: accountable === 0
						? t("raciNoA")
						: t("raciManyA")}
			</div>
			{rows.length === 0 ? (
				<p className="text-muted-foreground text-sm">{t("raciEmpty")}</p>
			) : (
				<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
					{rows.map((r, idx) => (
						<li
							key={`${r.userId ?? r.function}-${r.raci}`}
							className="flex items-center gap-3 px-3 py-1.5"
						>
							<Badge
								variant={r.raci === "A" ? "default" : "outline"}
								className="w-7 justify-center"
							>
								{r.raci}
							</Badge>
							<span className="min-w-0 flex-1 truncate">{label(r)}</span>
							<span className="text-muted-foreground text-xs">
								{r.userId ? t("person") : t("function")}
							</span>
							{canEdit && (
								<Button
									size="icon"
									variant="ghost"
									aria-label={tc("delete")}
									onClick={() => setRows(rows.filter((_, i) => i !== idx))}
								>
									<Trash2 />
								</Button>
							)}
						</li>
					))}
				</ul>
			)}
			{canEdit && (
				<div className="flex flex-wrap items-end gap-2">
					<div className="flex flex-col gap-1">
						<Label className="text-xs">{t("raciWho")}</Label>
						<div className="flex gap-2">
							<Select
								value={mode}
								onValueChange={(v) => {
									setMode(v as "person" | "function");
									setWho("");
								}}
							>
								<SelectTrigger className="w-32">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="function">{t("function")}</SelectItem>
									<SelectItem value="person">{t("person")}</SelectItem>
								</SelectContent>
							</Select>
							<Select value={who} onValueChange={setWho}>
								<SelectTrigger className="w-56">
									<SelectValue placeholder="—" />
								</SelectTrigger>
								<SelectContent>
									{mode === "person"
										? members.map((m) => (
												<SelectItem key={m.userId} value={m.userId}>
													{m.name}
												</SelectItem>
											))
										: ROLE_FUNCTIONS.map((f) => (
												<SelectItem key={f} value={f}>
													{functionLabels[f] ?? f}
												</SelectItem>
											))}
								</SelectContent>
							</Select>
						</div>
					</div>
					<div className="flex flex-col gap-1">
						<Label className="text-xs">RACI</Label>
						<Select
							value={raci}
							onValueChange={(v) => setRaci(v as (typeof RACI)[number])}
						>
							<SelectTrigger className="w-24">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{RACI.map((x) => (
									<SelectItem key={x} value={x}>
										{x} · {t(`raci${x}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<Button
						size="sm"
						variant="outline"
						disabled={!who}
						onClick={() => {
							setRows([
								...rows,
								mode === "person"
									? { userId: who, function: null, raci }
									: { userId: null, function: who as RoleFunction, raci },
							]);
							setWho("");
						}}
					>
						<Plus />
						{t("addRaci")}
					</Button>
					<Button
						size="sm"
						disabled={pending || !dirty || accountable !== 1}
						onClick={() =>
							start(async () => {
								const res = await setProcessRaci({
									processId,
									entries: rows,
								});
								if (!res.ok)
									return void toast.error(
										res.error.startsWith("raci_")
											? t(
													res.error === "raci_no_accountable"
														? "raciNoA"
														: "raciManyA",
												)
											: tc("error"),
									);
								toast.success(t("saved"));
								router.refresh();
							})
						}
					>
						{tc("save")}
					</Button>
				</div>
			)}
		</div>
	);
}

export type LinkOption = { id: string; label: string; hint?: string };

function CheckList({
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
				placeholder="Filter …"
				className="h-8"
			/>
			<div className="max-h-44 overflow-y-auto rounded-md border p-2 text-sm">
				{visible.length === 0 ? (
					<p className="text-muted-foreground text-xs">—</p>
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

export function ProcessLinksEditor({
	processId,
	controls,
	assets,
	providers,
	risks,
	documents,
	linked,
}: {
	processId: string;
	controls: LinkOption[];
	assets: LinkOption[];
	providers: LinkOption[];
	risks: LinkOption[];
	documents: LinkOption[];
	linked: {
		controls: string[];
		assets: string[];
		providers: string[];
		risks: string[];
		documents: string[];
	};
}) {
	const t = useTranslations("Processes");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [c, setC] = useState(new Set(linked.controls));
	const [a, setA] = useState(new Set(linked.assets));
	const [p, setP] = useState(new Set(linked.providers));
	const [r, setR] = useState(new Set(linked.risks));
	const [dcs, setDcs] = useState(new Set(linked.documents));
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					{t("editLinks")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>{t("links")}</DialogTitle>
					<DialogDescription>{t("linksLead")}</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 sm:grid-cols-2">
					<CheckList
						title={t("controls")}
						options={controls}
						selected={c}
						onChange={setC}
					/>
					<CheckList
						title={t("assets")}
						options={assets}
						selected={a}
						onChange={setA}
					/>
					<CheckList
						title={t("providers")}
						options={providers}
						selected={p}
						onChange={setP}
					/>
					<CheckList
						title={t("risks")}
						options={risks}
						selected={r}
						onChange={setR}
					/>
					<CheckList
						title={t("documents")}
						options={documents}
						selected={dcs}
						onChange={setDcs}
					/>
				</div>
				<DialogFooter>
					<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
						{tc("cancel")}
					</Button>
					<Button
						disabled={pending}
						onClick={() =>
							start(async () => {
								const res = await setProcessLinks({
									processId,
									controlCodes: [...c],
									assetIds: [...a],
									providerIds: [...p],
									riskIds: [...r],
									documentIds: [...dcs],
								});
								if (!res.ok) return void toast.error(tc("error"));
								toast.success(t("saved"));
								setOpen(false);
								router.refresh();
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
