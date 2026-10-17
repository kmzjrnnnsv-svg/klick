"use client";

import { FileUp, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	applyDocumentTemplates,
	createDocument,
	importDocumentsFromEvidence,
	newDocumentVersion,
	updateDocument,
} from "@/app/actions/documents";
import { uploadEvidence } from "@/app/actions/evidence";
import { useUploadFeedback } from "@/components/entity/upload-feedback";
import { MarkdownView } from "@/components/markdown-view";
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
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FileDrop } from "@/components/uploads/file-drop";
import { DOCUMENT_TYPES } from "@/db/schema/grc";
import { decodeText } from "@/lib/uploads/text";
import { precheckFile, titleFromFileName } from "@/lib/uploads/types";

export type TemplateOption = {
	code: string;
	title: string;
	type: string;
	isoMandatory: boolean;
	frameworks: string[];
	present: boolean;
};

// „+ Dokument": Titel, Typ, (optional) Vorlage.
export function DocumentCreate({ templates }: { templates: TemplateOption[] }) {
	const t = useTranslations("Documents");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [title, setTitle] = useState("");
	const [type, setType] = useState<(typeof DOCUMENT_TYPES)[number]>("policy");
	const [templateCode, setTemplateCode] = useState("");
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="brown">
					<Plus />
					{t("new")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await createDocument({
								title,
								type,
								templateCode: templateCode || undefined,
							});
							if (!res.ok) return void toast.error(tc("error"));
							toast.success(t("created"));
							setOpen(false);
							router.push(
								`/dokumente/${encodeURIComponent(res.data.docNumber)}`,
							);
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("new")}</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="doc-title">{t("titleField")}</Label>
						<Input
							id="doc-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							required
							maxLength={200}
							autoFocus
						/>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<Label>{t("type")}</Label>
							<Select
								value={type}
								onValueChange={(v) => setType(v as typeof type)}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{DOCUMENT_TYPES.map((x) => (
										<SelectItem key={x} value={x}>
											{t(`type_${x}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("fromTemplate")}</Label>
							<Select
								value={templateCode || "none"}
								onValueChange={(v) => setTemplateCode(v === "none" ? "" : v)}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">—</SelectItem>
									{templates.map((x) => (
										<SelectItem key={x.code} value={x.code}>
											{x.title}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button type="submit" disabled={pending || !title.trim()}>
							{tc("create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// Vorlagen übernehmen: Mehrfachauswahl, ISO-Pflicht markiert, Vorhandene ausgegraut.
export function TemplatesDialog({
	templates,
}: {
	templates: TemplateOption[];
}) {
	const t = useTranslations("Documents");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [picked, setPicked] = useState<string[]>([]);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					{t("templatesTitle")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{t("templatesTitle")}</DialogTitle>
					<DialogDescription>{t("templatesLead")}</DialogDescription>
				</DialogHeader>
				<div className="flex items-center gap-2 text-xs">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						className="normal-case tracking-normal"
						onClick={() =>
							setPicked(
								templates
									.filter((x) => !x.present && x.isoMandatory)
									.map((x) => x.code),
							)
						}
					>
						{t("isoMandatory")}
					</Button>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						className="normal-case tracking-normal"
						onClick={() =>
							setPicked(templates.filter((x) => !x.present).map((x) => x.code))
						}
					>
						{tc("search") === "Suchen" ? "Alle" : "All"}
					</Button>
				</div>
				<ul className="max-h-[50vh] overflow-y-auto divide-y divide-border/60 rounded-md border text-sm">
					{templates.map((x) => (
						<li
							key={x.code}
							className={`flex items-center gap-3 px-3 py-2 ${x.present ? "opacity-50" : ""}`}
						>
							<Checkbox
								checked={picked.includes(x.code)}
								disabled={x.present}
								onCheckedChange={(v) =>
									setPicked(
										v
											? [...picked, x.code]
											: picked.filter((c) => c !== x.code),
									)
								}
							/>
							<span className="min-w-0 flex-1">
								<span className="font-medium">{x.title}</span>
								<span className="ml-2 text-muted-foreground text-xs">
									{t(`type_${x.type as "policy"}`)} · {x.frameworks.join(", ")}
								</span>
							</span>
							{x.isoMandatory && <Badge variant="default">(P)</Badge>}
							{x.present && (
								<Badge variant="muted">{t("alreadyPresent")}</Badge>
							)}
						</li>
					))}
				</ul>
				<DialogFooter>
					<Button variant="ghost" onClick={() => setOpen(false)}>
						{tc("cancel")}
					</Button>
					<Button
						variant="brown"
						disabled={pending || picked.length === 0}
						onClick={() =>
							start(async () => {
								const res = await applyDocumentTemplates({ codes: picked });
								if (!res.ok) return void toast.error(tc("error"));
								toast.success(t("templatesApplied", { n: res.data.created }));
								setOpen(false);
								setPicked([]);
								router.refresh();
							})
						}
					>
						{t("applyTemplates")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// Richtlinien-Import: Mehrfach-Upload → Nachweise (verschlüsselt) → Entwürfe.
const IMPORT_EXTS = [".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".md"];
const IMPORT_BATCH = 50;

export function ImportDialog({
	storageAvailable,
}: {
	storageAvailable: boolean;
}) {
	const t = useTranslations("Documents");
	const te = useTranslations("Evidence");
	const tu = useTranslations("Upload");
	const tc = useTranslations("Common");
	const td = useTranslations("Dlp");
	const feedback = useUploadFeedback();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [files, setFiles] = useState<File[]>([]);
	const [done, setDone] = useState<number | null>(null);

	// Vorab im Browser aussortieren, was der Server ohnehin ablehnt.
	function pick(list: File[]) {
		const ok: File[] = [];
		for (const f of list) {
			const problem = precheckFile(f, IMPORT_EXTS);
			if (problem)
				toast.error(
					`${f.name}: ${feedback.errorText({ ok: false, error: `upload_${problem}` })}`,
				);
			else ok.push(f);
		}
		setFiles(ok);
	}

	function run() {
		start(async () => {
			const items: { evidenceId: string; bodyMarkdown?: string }[] = [];
			setDone(0);
			for (const [i, f] of files.entries()) {
				const fd = new FormData();
				fd.set("file", f);
				fd.set("title", titleFromFileName(f.name));
				fd.set("type", "document");
				fd.set("classification", "internal");
				const up = await uploadEvidence(fd);
				setDone(i + 1);
				if (!up.ok) {
					const warn = feedback.dlpWarning(up);
					toast.error(
						`${f.name}: ${
							warn
								? td("warnLead", { detectors: feedback.detectors(warn) })
								: feedback.errorText(up)
						}`,
					);
					continue;
				}
				// Text/Markdown: Inhalt gleich in den Entwurf (sonst leere Seite).
				let bodyMarkdown: string | undefined;
				if (/\.(md|txt)$/i.test(f.name)) {
					const decoded = decodeText(new Uint8Array(await f.arrayBuffer()));
					bodyMarkdown = decoded?.text.slice(0, 200_000);
				}
				items.push({ evidenceId: up.data.id, bodyMarkdown });
			}
			setDone(null);
			if (items.length === 0) return;
			let created = 0;
			for (let i = 0; i < items.length; i += IMPORT_BATCH) {
				const res = await importDocumentsFromEvidence(
					items.slice(i, i + IMPORT_BATCH),
				);
				if (!res.ok) return void toast.error(tc("error"));
				created += res.data.created;
			}
			toast.success(t("imported", { n: created }));
			setOpen(false);
			setFiles([]);
			router.refresh();
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next && pending) {
					toast.message(tu("busyClose"));
					return;
				}
				setOpen(next);
			}}
		>
			<DialogTrigger asChild>
				<Button
					size="sm"
					variant="outline"
					disabled={!storageAvailable}
					title={storageAvailable ? undefined : te("storageNotConfigured")}
				>
					<FileUp />
					{t("import")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("import")}</DialogTitle>
					<DialogDescription>{t("importLead")}</DialogDescription>
				</DialogHeader>
				<FileDrop
					files={files}
					onFiles={pick}
					multiple
					accept={IMPORT_EXTS.join(",")}
					disabled={pending}
				/>
				<p className="text-muted-foreground text-xs">{t("importHint")}</p>
				{done !== null && (
					<div className="flex flex-col gap-1.5" aria-live="polite">
						<Progress value={(done / Math.max(1, files.length)) * 100} />
						<p className="text-muted-foreground text-xs">
							{tu("progressMany", { done, total: files.length })}
						</p>
					</div>
				)}
				<DialogFooter>
					<Button
						variant="ghost"
						onClick={() => setOpen(false)}
						disabled={pending}
					>
						{tc("cancel")}
					</Button>
					<Button
						variant="brown"
						disabled={pending || files.length === 0}
						onClick={run}
					>
						{t("import")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// Markdown-Editor mit Vorschau (kein WYSIWYG); speichert nur im Entwurf.
export function DocumentEditor({
	documentId,
	body,
	editable,
}: {
	documentId: string;
	body: string;
	editable: boolean;
}) {
	const t = useTranslations("Documents");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [value, setValue] = useState(body);
	const [pending, start] = useTransition();
	if (!editable) return <MarkdownView source={body || `_${t("noContent")}_`} />;
	return (
		<Tabs defaultValue="edit" className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-2">
				<TabsList>
					<TabsTrigger value="edit">{t("edit")}</TabsTrigger>
					<TabsTrigger value="preview">{t("preview")}</TabsTrigger>
				</TabsList>
				<Button
					size="sm"
					disabled={pending || value === body}
					onClick={() =>
						start(async () => {
							const res = await updateDocument({
								documentId,
								bodyMarkdown: value,
							});
							if (!res.ok)
								toast.error(
									res.error === "locked"
										? t("transitionBlockedApproval")
										: tc("error"),
								);
							else {
								toast.success(tc("save"));
								router.refresh();
							}
						})
					}
				>
					{tc("save")}
				</Button>
			</div>
			<TabsContent value="edit">
				<Textarea
					value={value}
					onChange={(e) => setValue(e.target.value)}
					rows={24}
					className="font-mono text-xs"
				/>
			</TabsContent>
			<TabsContent value="preview">
				<div className="rounded-md border p-4">
					<MarkdownView source={value || `_${t("noContent")}_`} />
				</div>
			</TabsContent>
		</Tabs>
	);
}

export function NewVersionDialog({ documentId }: { documentId: string }) {
	const t = useTranslations("Documents");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [summary, setSummary] = useState("");
	const [bump, setBump] = useState<"minor" | "major">("minor");
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					{t("newVersion")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("newVersion")}</DialogTitle>
					<DialogDescription>{t("ackReset")}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="nv-summary">{t("changeSummary")}</Label>
					<Textarea
						id="nv-summary"
						rows={3}
						value={summary}
						onChange={(e) => setSummary(e.target.value)}
						autoFocus
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>{t("version")}</Label>
					<Select value={bump} onValueChange={(v) => setBump(v as typeof bump)}>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="minor">minor (x.1)</SelectItem>
							<SelectItem value="major">major (2.0)</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={() => setOpen(false)}>
						{tc("cancel")}
					</Button>
					<Button
						disabled={pending || summary.trim().length < 3}
						onClick={() =>
							start(async () => {
								const res = await newDocumentVersion({
									documentId,
									changeSummary: summary,
									bump,
								});
								if (!res.ok) return void toast.error(tc("error"));
								toast.success(`v${res.data.version}`);
								setOpen(false);
								setSummary("");
								router.refresh();
							})
						}
					>
						{tc("create")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
