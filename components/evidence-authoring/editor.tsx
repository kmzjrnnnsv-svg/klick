"use client";

import {
	Check,
	ChevronsUpDown,
	FileCheck2,
	Save,
	Trash2,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
	deleteEvidenceDraft,
	finalizeEvidenceDraft,
	saveEvidenceDraft,
} from "@/app/actions/evidence-authoring";
import type { MemberOption } from "@/components/entity/owner-assignee";
import { FunctionSelect } from "@/components/organisation/governance-forms";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { errorText } from "@/components/ui/error-text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { RoleFunction } from "@/db/schema/enums";
import {
	type AuthoredContent,
	measuresOf,
	missingForFinalize,
	normalizeContent,
	resultOf,
} from "@/lib/evidence-authoring/content";
import {
	RESULT_LABELS,
	TEMPLATE_BY_KEY,
	tableColumns,
} from "@/lib/evidence-authoring/templates";
import { BlockEditor } from "./blocks";

// Editor eines Entwurfs: Kopfangaben (Titel, Controls, Unterschriften,
// Vertraulichkeit), Bausteine der Vorlage, Speichern und Abschließen.
// Abschließen erzeugt den Nachweis (PDF, unveränderlich).

export type DraftState = {
	title: string;
	preset: string | null;
	classification: "internal" | "confidential";
	controlCodes: string[];
	signers: string[];
	content: AuthoredContent;
};

export function AuthoringEditor({
	draftId,
	templateKey,
	initial,
	controls,
	members,
	functionLabels,
	canTest,
	canTasks,
	today,
}: {
	draftId: string;
	templateKey: string;
	initial: DraftState;
	controls: { code: string; title: string }[];
	members: MemberOption[];
	functionLabels: Record<string, string>;
	canTest: boolean;
	canTasks: boolean;
	today: string;
}) {
	const t = useTranslations("Authoring");
	const tc = useTranslations("Common");
	const router = useRouter();
	const template = TEMPLATE_BY_KEY.get(templateKey);
	const [d, setD] = useState<DraftState>(initial);
	const [saved, setSaved] = useState(() => JSON.stringify(initial));
	const [pending, start] = useTransition();
	const [finalizeOpen, setFinalizeOpen] = useState(false);
	const [createTasks, setCreateTasks] = useState(true);
	const [recordTest, setRecordTest] = useState(true);
	const dirty = JSON.stringify(d) !== saved;

	useEffect(() => {
		if (!dirty) return;
		const warn = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [dirty]);

	const missing = useMemo(
		() => (template ? missingForFinalize(template, d.content) : []),
		[template, d.content],
	);
	if (!template) return null;
	const measures = measuresOf(d.content);
	const result = resultOf(d.content);
	const counter = d.signers.find((s) => s !== "-") ?? null;
	const controlTitle = new Map(controls.map((c) => [c.code, c.title]));

	const save = async (): Promise<boolean> => {
		const res = await saveEvidenceDraft({ id: draftId, ...d });
		if (!res.ok) {
			toast.error(errorText(tc, res));
			return false;
		}
		setSaved(JSON.stringify(d));
		return true;
	};

	return (
		<div className="flex flex-col gap-6">
			<section
				aria-label={t("headSection")}
				className="grid grid-cols-1 gap-4 rounded-2xl bg-card p-4 md:grid-cols-2"
			>
				<div className="flex flex-col gap-1.5 md:col-span-2">
					<Label htmlFor="au-title">{t("title")}</Label>
					<Input
						id="au-title"
						value={d.title}
						maxLength={200}
						autoComplete="off"
						onChange={(e) => setD({ ...d, title: e.target.value })}
					/>
				</div>
				{template.presets && (
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="au-preset">{t("preset")}</Label>
						<Select
							value={d.preset ?? "__free"}
							onValueChange={(v) => {
								const preset = v === "__free" ? null : v;
								setD({
									...d,
									preset,
									content: normalizeContent(template, d.content, {
										today,
										me: "",
										preset,
									}),
								});
							}}
						>
							<SelectTrigger id="au-preset" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="__free">{t("presetFree")}</SelectItem>
								{template.presets.map((p) => (
									<SelectItem key={p.key} value={p.key}>
										{p.title}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="au-class">{t("classification")}</Label>
					<Select
						value={d.classification}
						onValueChange={(v) =>
							setD({ ...d, classification: v as DraftState["classification"] })
						}
					>
						<SelectTrigger id="au-class" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="internal">{t("class_internal")}</SelectItem>
							<SelectItem value="confidential">
								{t("class_confidential")}
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0 md:col-span-2">
					<legend className="mb-1.5 font-medium text-subhead">
						{t("controls")}
					</legend>
					<div className="flex flex-wrap items-center gap-2">
						{d.controlCodes.map((code) => (
							<Badge key={code} variant="outline" className="gap-1 pr-1">
								<span className="font-mono">{code}</span>
								<span className="max-w-48 truncate font-normal">
									{controlTitle.get(code)}
								</span>
								<button
									type="button"
									aria-label={t("removeControl", { code })}
									className="rounded p-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									onClick={() =>
										setD({
											...d,
											controlCodes: d.controlCodes.filter((c) => c !== code),
										})
									}
								>
									<X className="size-3" aria-hidden="true" />
								</button>
							</Badge>
						))}
						<ControlPicker
							controls={controls}
							selected={d.controlCodes}
							onPick={(code) =>
								setD({ ...d, controlCodes: [...d.controlCodes, code] })
							}
						/>
					</div>
					<p className="text-muted-foreground text-footnote">
						{t("controlsHint")}
					</p>
				</fieldset>
				<div className="flex flex-col gap-2 md:col-span-2">
					<span className="font-medium text-subhead">{t("signers")}</span>
					<p className="text-muted-foreground text-footnote">
						{t("signersHint")}
					</p>
					<div className="max-w-sm">
						<FunctionSelect
							label={t("counterSign")}
							value={counter as RoleFunction | null}
							allowNone
							noneLabel={t("counterSignNone")}
							labels={functionLabels}
							onChange={(fn) => setD({ ...d, signers: fn ? ["-", fn] : ["-"] })}
						/>
					</div>
				</div>
			</section>

			{template.blocks.map((b) => {
				const value = d.content.blocks[b.id];
				if (!value) return null;
				return (
					<BlockEditor
						key={b.id}
						def={b}
						value={value}
						columns={
							b.kind === "table"
								? tableColumns(template, b, d.preset)
								: undefined
						}
						members={members}
						onChange={(v) =>
							setD({
								...d,
								content: {
									...d.content,
									blocks: { ...d.content.blocks, [b.id]: v },
								},
							})
						}
					/>
				);
			})}

			<div className="sticky bottom-(--bar-offset) z-10 -mx-4 flex flex-wrap items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-md sm:border">
				<Button
					type="button"
					variant="outline"
					disabled={pending || !dirty}
					onClick={() =>
						start(async () => {
							if (await save()) toast.success(t("saved"));
						})
					}
				>
					<Save aria-hidden="true" />
					{pending ? tc("saving") : tc("save")}
				</Button>
				<Button
					type="button"
					disabled={pending}
					onClick={() => setFinalizeOpen(true)}
				>
					<FileCheck2 aria-hidden="true" />
					{t("finalize")}
				</Button>
				<span
					className="text-muted-foreground text-footnote"
					aria-live="polite"
				>
					{dirty ? t("unsaved") : t("allSaved")}
				</span>
				<div className="ml-auto">
					<DeleteDraft id={draftId} />
				</div>
			</div>

			<Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("finalizeTitle")}</DialogTitle>
						<DialogDescription>{t("finalizeLead")}</DialogDescription>
					</DialogHeader>
					{missing.length > 0 ? (
						<div className="flex flex-col gap-2 text-subhead">
							<p className="font-medium">{t("missing")}</p>
							<ul className="list-disc pl-5 text-muted-foreground">
								{missing.map((m) => (
									<li key={m}>{m}</li>
								))}
							</ul>
						</div>
					) : (
						<div className="flex flex-col gap-3 text-subhead">
							{d.controlCodes.length === 0 && (
								<p className="rounded-xl bg-warning/12 p-2">
									{t("noControlsWarning")}
								</p>
							)}
							{measures.length > 0 && canTasks && (
								<div className="flex items-start gap-2">
									<Checkbox
										id="au-tasks"
										checked={createTasks}
										onCheckedChange={(v) => setCreateTasks(v === true)}
									/>
									<Label
										htmlFor="au-tasks"
										className="font-normal normal-case leading-snug tracking-normal"
									>
										{t("createTasks", { count: measures.length })}
									</Label>
								</div>
							)}
							{template.testMethod &&
								result &&
								canTest &&
								d.controlCodes.length > 0 && (
									<div className="flex items-start gap-2">
										<Checkbox
											id="au-test"
											checked={recordTest}
											onCheckedChange={(v) => setRecordTest(v === true)}
										/>
										<Label
											htmlFor="au-test"
											className="font-normal normal-case leading-snug tracking-normal"
										>
											{t("recordTest", {
												control: d.controlCodes[0] ?? "",
												result: RESULT_LABELS[result],
											})}
											{result === "fail" && ` ${t("recordTestFail")}`}
										</Label>
									</div>
								)}
						</div>
					)}
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setFinalizeOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button
							type="button"
							disabled={pending || missing.length > 0 || !d.title.trim()}
							onClick={() =>
								start(async () => {
									if (dirty && !(await save())) return;
									const res = await finalizeEvidenceDraft({
										id: draftId,
										createTasks: createTasks && canTasks,
										recordTest: recordTest && canTest,
									});
									if (!res.ok) {
										toast.error(
											res.error === "incomplete"
												? t("missing")
												: res.error === "no_control"
													? t("noControlsWarning")
													: errorText(tc, res),
										);
										return;
									}
									setSaved(JSON.stringify(d));
									toast.success(t("finalized"));
									router.push(`/nachweise/${res.data.evidenceId}`);
								})
							}
						>
							<Check aria-hidden="true" />
							{pending ? t("finalizing") : t("finalizeConfirm")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function ControlPicker({
	controls,
	selected,
	onPick,
}: {
	controls: { code: string; title: string }[];
	selected: string[];
	onPick: (code: string) => void;
}) {
	const t = useTranslations("Authoring");
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button type="button" variant="outline" size="sm" aria-expanded={open}>
					{t("addControl")}
					<ChevronsUpDown aria-hidden="true" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-80 p-0" align="start">
				<Command>
					<CommandInput placeholder={t("searchControl")} />
					<CommandList>
						<CommandEmpty>{t("noControl")}</CommandEmpty>
						<CommandGroup>
							{controls
								.filter((c) => !selected.includes(c.code))
								.map((c) => (
									<CommandItem
										key={c.code}
										value={`${c.code} ${c.title}`}
										onSelect={() => {
											onPick(c.code);
											setOpen(false);
										}}
									>
										<span className="font-mono text-footnote">{c.code}</span>
										<span className="truncate">{c.title}</span>
									</CommandItem>
								))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function DeleteDraft({ id }: { id: string }) {
	const t = useTranslations("Authoring");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="text-destructive"
					disabled={pending}
				>
					<Trash2 aria-hidden="true" />
					{t("deleteDraft")}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("deleteDraftTitle")}</AlertDialogTitle>
					<AlertDialogDescription>
						{t("deleteDraftLead")}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
					<AlertDialogAction
						onClick={() =>
							start(async () => {
								const res = await deleteEvidenceDraft({ id });
								if (!res.ok) return void toast.error(errorText(tc, res));
								toast.success(t("draftDeleted"));
								router.push("/nachweise/verfassen");
							})
						}
					>
						{t("deleteDraft")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
