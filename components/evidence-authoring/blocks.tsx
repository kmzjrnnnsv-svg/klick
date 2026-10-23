"use client";

import { ClipboardPaste, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { MemberOption } from "@/components/entity/owner-assignee";
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
import { Textarea } from "@/components/ui/textarea";
import type {
	BlockValue,
	ChecklistRow,
	MeasureRow,
	SectionRow,
} from "@/lib/evidence-authoring/content";
import {
	type BlockDef,
	CHECK_LABELS,
	CHECK_VALUES,
	type ColumnDef,
	type FieldDef,
	RESULT_LABELS,
	RESULT_VALUES,
} from "@/lib/evidence-authoring/templates";
import { cn } from "@/lib/utils";

// Editoren je Baustein eines Rohlings. Jeder Editor bekommt Definition und
// Wert und meldet den neuen Wert — Speichern übernimmt der Editor oben.

const NONE = "__none";

function ChoiceSelect({
	id,
	label,
	value,
	options,
	onChange,
	hideLabel,
}: {
	id: string;
	label: string;
	value: string;
	options: readonly { value: string; label: string }[];
	onChange: (v: string) => void;
	hideLabel?: boolean;
}) {
	const t = useTranslations("Authoring");
	return (
		<Select
			value={value || NONE}
			onValueChange={(v) => onChange(v === NONE ? "" : v)}
		>
			<SelectTrigger
				id={id}
				className="w-full"
				aria-label={hideLabel ? label : undefined}
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={NONE}>{hideLabel ? "—" : t("choose")}</SelectItem>
				{options.map((o) => (
					<SelectItem key={o.value} value={o.value}>
						{o.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function FieldInput({
	id,
	field,
	value,
	onChange,
}: {
	id: string;
	field: FieldDef;
	value: string;
	onChange: (v: string) => void;
}) {
	if (field.type === "select")
		return (
			<ChoiceSelect
				id={id}
				label={field.label}
				value={value}
				options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
				onChange={onChange}
			/>
		);
	return (
		<Input
			id={id}
			type={field.type}
			value={value}
			placeholder={field.placeholder ? `${field.placeholder}…` : undefined}
			required={field.required}
			autoComplete="off"
			maxLength={500}
			onChange={(e) => onChange(e.target.value)}
		/>
	);
}

function Required({ show }: { show?: boolean }) {
	const t = useTranslations("Authoring");
	if (!show) return null;
	return (
		<span className="text-destructive" title={t("required")}>
			{" "}
			*<span className="sr-only">{t("required")}</span>
		</span>
	);
}

function BlockShell({
	title,
	hint,
	required,
	children,
	headingId,
}: {
	title?: string;
	hint?: string;
	required?: boolean;
	children: React.ReactNode;
	headingId: string;
}) {
	return (
		<section
			aria-labelledby={title ? headingId : undefined}
			className="flex min-w-0 flex-col gap-3 rounded-md border p-4"
		>
			{title && (
				<div className="flex flex-col gap-1">
					<h2 id={headingId} className="font-medium text-base">
						{title}
						<Required show={required} />
					</h2>
					{hint && <p className="text-muted-foreground text-sm">{hint}</p>}
				</div>
			)}
			{children}
		</section>
	);
}

function RemoveButton({
	label,
	onClick,
}: {
	label: string;
	onClick: () => void;
}) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			aria-label={label}
			title={label}
			onClick={onClick}
		>
			<Trash2 aria-hidden="true" />
		</Button>
	);
}

// Zeilen aus Excel/CSV einfügen: Tabulator, Semikolon oder Komma trennt
export function parsePastedRows(text: string, columns: number): string[][] {
	return text
		.split(/\r?\n/)
		.filter((l) => l.trim())
		.map((line) => {
			const sep = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
			const cells = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
			return Array.from({ length: columns }, (_, i) => cells[i] ?? "");
		});
}

function PasteRows({
	columns,
	onPaste,
}: {
	columns: readonly ColumnDef[];
	onPaste: (rows: string[][]) => void;
}) {
	const t = useTranslations("Authoring");
	const id = useId();
	const [open, setOpen] = useState(false);
	const [text, setText] = useState("");
	if (!open)
		return (
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => setOpen(true)}
			>
				<ClipboardPaste aria-hidden="true" />
				{t("pasteRows")}
			</Button>
		);
	return (
		<div className="flex w-full flex-col gap-2 rounded-md border border-dashed p-3">
			<Label htmlFor={id}>
				{t("pasteLabel", { columns: columns.map((c) => c.label).join(" · ") })}
			</Label>
			<Textarea
				id={id}
				rows={5}
				value={text}
				onChange={(e) => setText(e.target.value)}
				placeholder={t("pastePlaceholder")}
				spellCheck={false}
			/>
			<div className="flex gap-2">
				<Button
					type="button"
					size="sm"
					disabled={!text.trim()}
					onClick={() => {
						onPaste(parsePastedRows(text, columns.length));
						setText("");
						setOpen(false);
					}}
				>
					{t("pasteApply")}
				</Button>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onClick={() => setOpen(false)}
				>
					{t("cancel")}
				</Button>
			</div>
		</div>
	);
}

export function BlockEditor({
	def,
	value,
	columns,
	members,
	onChange,
}: {
	def: BlockDef;
	value: BlockValue;
	// Spalten der Tabelle (bei Listen aus der Vorlage)
	columns?: readonly ColumnDef[];
	members: MemberOption[];
	onChange: (v: BlockValue) => void;
}) {
	const t = useTranslations("Authoring");
	const base = useId();
	const headingId = `${base}-h`;

	switch (def.kind) {
		case "fields": {
			if (value.kind !== "fields") return null;
			return (
				<BlockShell title={def.title} headingId={headingId}>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						{def.fields.map((f) => {
							const id = `${base}-${f.key}`;
							return (
								<div key={f.key} className="flex min-w-0 flex-col gap-1.5">
									<Label htmlFor={id}>
										{f.label}
										<Required show={f.required} />
									</Label>
									<FieldInput
										id={id}
										field={f}
										value={value.values[f.key] ?? ""}
										onChange={(v) =>
											onChange({
												kind: "fields",
												values: { ...value.values, [f.key]: v },
											})
										}
									/>
								</div>
							);
						})}
					</div>
				</BlockShell>
			);
		}
		case "text": {
			if (value.kind !== "text") return null;
			return (
				<BlockShell
					title={def.title}
					hint={def.hint}
					required={def.required}
					headingId={headingId}
				>
					<Textarea
						aria-labelledby={headingId}
						rows={5}
						value={value.text}
						maxLength={20_000}
						onChange={(e) => onChange({ kind: "text", text: e.target.value })}
					/>
				</BlockShell>
			);
		}
		case "list": {
			if (value.kind !== "list") return null;
			return (
				<BlockShell
					title={def.title}
					hint={def.hint}
					required={def.required}
					headingId={headingId}
				>
					<Textarea
						aria-labelledby={headingId}
						rows={Math.max(3, value.items.length + 1)}
						value={value.items.join("\n")}
						onChange={(e) =>
							onChange({ kind: "list", items: e.target.value.split("\n") })
						}
					/>
				</BlockShell>
			);
		}
		case "table": {
			if (value.kind !== "table") return null;
			const cols = columns ?? def.columns;
			const set = (rows: string[][]) => onChange({ kind: "table", rows });
			// Spaltenraster ab sm über eine CSS-Variable (mobil gestapelt)
			const grid = {
				"--cols": `${cols.map((c) => `minmax(0,${c.width ?? 2}fr)`).join(" ")} 2.5rem`,
			} as React.CSSProperties;
			return (
				<BlockShell
					title={def.title}
					hint={def.hint}
					required={def.required}
					headingId={headingId}
				>
					<div
						className="hidden gap-2 text-muted-foreground text-xs sm:grid sm:[grid-template-columns:var(--cols)]"
						style={grid}
						aria-hidden="true"
					>
						{cols.map((c) => (
							<span key={c.key}>{c.label}</span>
						))}
					</div>
					<ul className="flex flex-col gap-3 sm:gap-2">
						{value.rows.map((row, ri) => (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: Zeilen haben keine ID
								key={ri}
								className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:rounded-none sm:border-0 sm:p-0 sm:[grid-template-columns:var(--cols)]"
								style={grid}
							>
								{cols.map((c, ci) => {
									const label = t("cellLabel", {
										column: c.label,
										row: ri + 1,
									});
									const v = row[ci] ?? "";
									const update = (nv: string) =>
										set(
											value.rows.map((r, i) =>
												i === ri ? r.map((x, j) => (j === ci ? nv : x)) : r,
											),
										);
									return (
										<div key={c.key} className="flex min-w-0 flex-col gap-1">
											<span className="text-muted-foreground text-xs sm:hidden">
												{c.label}
											</span>
											{c.type === "select" ? (
												<ChoiceSelect
													id={`${base}-${ri}-${c.key}`}
													label={label}
													value={v}
													hideLabel
													options={(c.options ?? []).map((o) => ({
														value: o,
														label: o,
													}))}
													onChange={update}
												/>
											) : (
												<Input
													aria-label={label}
													type={c.type === "date" ? "date" : "text"}
													value={v}
													maxLength={2_000}
													autoComplete="off"
													onChange={(e) => update(e.target.value)}
												/>
											)}
										</div>
									);
								})}
								<div className="flex justify-end sm:items-start">
									<RemoveButton
										label={t("removeRow", { row: ri + 1 })}
										onClick={() => set(value.rows.filter((_, i) => i !== ri))}
									/>
								</div>
							</li>
						))}
					</ul>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => set([...value.rows, cols.map(() => "")])}
						>
							<Plus aria-hidden="true" />
							{t("addRow")}
						</Button>
						<PasteRows
							columns={cols}
							onPaste={(rows) =>
								set([
									...value.rows.filter((r) => r.some((x) => x.trim())),
									...rows,
								])
							}
						/>
					</div>
				</BlockShell>
			);
		}
		case "checklist": {
			if (value.kind !== "checklist") return null;
			const set = (rows: ChecklistRow[]) =>
				onChange({ kind: "checklist", rows });
			return (
				<BlockShell
					title={def.title}
					hint={def.hint}
					required={def.required}
					headingId={headingId}
				>
					<ul className="flex flex-col gap-3">
						{value.rows.map((r, ri) => (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: Zeilen haben keine ID
								key={ri}
								className="grid grid-cols-1 gap-2 rounded-md border p-2 md:grid-cols-[minmax(0,5fr)_minmax(0,2fr)_minmax(0,3fr)_2.5rem] md:items-start"
							>
								<Textarea
									aria-label={t("checkText", { row: ri + 1 })}
									rows={1}
									className="min-h-9"
									value={r.text}
									maxLength={2_000}
									onChange={(e) =>
										set(
											value.rows.map((x, i) =>
												i === ri ? { ...x, text: e.target.value } : x,
											),
										)
									}
								/>
								<ChoiceSelect
									id={`${base}-c-${ri}`}
									label={t("checkResult", { row: ri + 1 })}
									hideLabel
									value={r.result}
									options={CHECK_VALUES.map((c) => ({
										value: c,
										label: CHECK_LABELS[c],
									}))}
									onChange={(v) =>
										set(
											value.rows.map((x, i) =>
												i === ri
													? { ...x, result: v as ChecklistRow["result"] }
													: x,
											),
										)
									}
								/>
								<Input
									aria-label={t("checkNote", { row: ri + 1 })}
									placeholder={t("notePlaceholder")}
									value={r.note}
									maxLength={2_000}
									autoComplete="off"
									onChange={(e) =>
										set(
											value.rows.map((x, i) =>
												i === ri ? { ...x, note: e.target.value } : x,
											),
										)
									}
								/>
								<div className="flex justify-end">
									<RemoveButton
										label={t("removeRow", { row: ri + 1 })}
										onClick={() => set(value.rows.filter((_, i) => i !== ri))}
									/>
								</div>
							</li>
						))}
					</ul>
					<div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() =>
								set([...value.rows, { text: "", result: "", note: "" }])
							}
						>
							<Plus aria-hidden="true" />
							{t("addCheck")}
						</Button>
					</div>
				</BlockShell>
			);
		}
		case "result": {
			if (value.kind !== "result") return null;
			return (
				<BlockShell
					title={def.title}
					required={def.required}
					headingId={headingId}
				>
					<fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
						<legend className="sr-only">{def.title}</legend>
						{RESULT_VALUES.map((r) => (
							<label
								key={r}
								className={cn(
									"cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
									value.value === r
										? r === "pass"
											? "border-success bg-success/10"
											: r === "partial"
												? "border-warning bg-warning/10"
												: "border-destructive bg-destructive/10"
										: "hover:bg-accent",
								)}
							>
								<input
									type="radio"
									name={`${base}-result`}
									value={r}
									checked={value.value === r}
									onChange={() => onChange({ ...value, value: r })}
									className="sr-only"
								/>
								{RESULT_LABELS[r]}
							</label>
						))}
					</fieldset>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={`${base}-note`}>{t("resultNote")}</Label>
						<Textarea
							id={`${base}-note`}
							rows={2}
							value={value.note}
							maxLength={20_000}
							onChange={(e) => onChange({ ...value, note: e.target.value })}
						/>
					</div>
				</BlockShell>
			);
		}
		case "measures": {
			if (value.kind !== "measures") return null;
			const set = (rows: MeasureRow[]) => onChange({ kind: "measures", rows });
			return (
				<BlockShell title={def.title} hint={def.hint} headingId={headingId}>
					<ul className="flex flex-col gap-3">
						{value.rows.map((m, ri) => (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: Zeilen haben keine ID
								key={ri}
								className="grid grid-cols-1 gap-2 rounded-md border p-2 md:grid-cols-[minmax(0,5fr)_minmax(0,3fr)_minmax(0,2fr)_2.5rem] md:items-start"
							>
								<Input
									aria-label={t("measureText", { row: ri + 1 })}
									placeholder={t("measurePlaceholder")}
									value={m.text}
									maxLength={2_000}
									autoComplete="off"
									onChange={(e) =>
										set(
											value.rows.map((x, i) =>
												i === ri ? { ...x, text: e.target.value } : x,
											),
										)
									}
								/>
								<ChoiceSelect
									id={`${base}-o-${ri}`}
									label={t("measureOwner", { row: ri + 1 })}
									hideLabel
									value={m.ownerUserId ?? ""}
									options={members.map((p) => ({
										value: p.userId,
										label: p.name,
									}))}
									onChange={(v) =>
										set(
											value.rows.map((x, i) =>
												i === ri
													? {
															...x,
															ownerUserId: v || null,
															owner:
																members.find((p) => p.userId === v)?.name ?? "",
														}
													: x,
											),
										)
									}
								/>
								<Input
									aria-label={t("measureDue", { row: ri + 1 })}
									type="date"
									value={m.due}
									onChange={(e) =>
										set(
											value.rows.map((x, i) =>
												i === ri ? { ...x, due: e.target.value } : x,
											),
										)
									}
								/>
								<div className="flex justify-end">
									<RemoveButton
										label={t("removeRow", { row: ri + 1 })}
										onClick={() => set(value.rows.filter((_, i) => i !== ri))}
									/>
								</div>
							</li>
						))}
					</ul>
					<div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() =>
								set([
									...value.rows,
									{ text: "", owner: "", ownerUserId: null, due: "" },
								])
							}
						>
							<Plus aria-hidden="true" />
							{t("addMeasure")}
						</Button>
					</div>
				</BlockShell>
			);
		}
		case "sections": {
			if (value.kind !== "sections") return null;
			const set = (rows: SectionRow[]) => onChange({ kind: "sections", rows });
			return (
				<BlockShell
					title={def.title ?? t("sections")}
					hint={def.hint}
					required={def.required}
					headingId={headingId}
				>
					<ul className="flex flex-col gap-4">
						{value.rows.map((s, ri) => (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: Abschnitte haben keine ID
								key={ri}
								className="flex flex-col gap-2 rounded-md border p-3"
							>
								<div className="flex items-center gap-2">
									<Input
										aria-label={t("sectionHeading", { row: ri + 1 })}
										placeholder={t("sectionHeadingPlaceholder")}
										value={s.heading}
										maxLength={500}
										autoComplete="off"
										onChange={(e) =>
											set(
												value.rows.map((x, i) =>
													i === ri ? { ...x, heading: e.target.value } : x,
												),
											)
										}
									/>
									<RemoveButton
										label={t("removeSection", { row: ri + 1 })}
										onClick={() => set(value.rows.filter((_, i) => i !== ri))}
									/>
								</div>
								<Textarea
									aria-label={t("sectionBody", { row: ri + 1 })}
									rows={5}
									value={s.body}
									maxLength={20_000}
									onChange={(e) =>
										set(
											value.rows.map((x, i) =>
												i === ri ? { ...x, body: e.target.value } : x,
											),
										)
									}
								/>
							</li>
						))}
					</ul>
					<div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => set([...value.rows, { heading: "", body: "" }])}
						>
							<Plus aria-hidden="true" />
							{t("addSection")}
						</Button>
					</div>
				</BlockShell>
			);
		}
	}
}
