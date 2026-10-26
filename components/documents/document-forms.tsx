"use client";

import { FileUp, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	applyDocumentTemplates,
	createDocument,
	importDocumentsFromEvidence,
	newDocumentVersion,
	updateDocument,
} from "@/app/actions/documents";
import { uploadEvidence } from "@/app/actions/evidence";
import { ApproverFunctionOptions } from "@/components/documents/approver-select";
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
import { errorText } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { RoleFunction } from "@/db/schema/enums";
import { DOCUMENT_TYPES } from "@/db/schema/grc";
import { bumpVersion } from "@/lib/documents/numbering";

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
	// leer = aus Vorlage bzw. Art (Richtlinie: Geschäftsleitung)
	const [approver, setApprover] = useState("auto");
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm">
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
								approverFunction:
									approver === "auto"
										? undefined
										: (approver as RoleFunction | "none"),
							});
							if (!res.ok) return void toast.error(errorText(tc, res));
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
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
					<div className="flex flex-col gap-1.5">
						<Label>{t("approver")}</Label>
						<Select value={approver} onValueChange={setApprover}>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="auto">{t("approverAuto")}</SelectItem>
								<ApproverFunctionOptions />
							</SelectContent>
						</Select>
						<p className="text-muted-foreground text-footnote">
							{t("approverHint")}
						</p>
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
				<div className="flex items-center gap-2 text-footnote">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						className=""
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
						className=""
						onClick={() =>
							setPicked(templates.filter((x) => !x.present).map((x) => x.code))
						}
					>
						{tc("search") === "Suchen" ? "Alle" : "All"}
					</Button>
				</div>
				<ul className="max-h-[50vh] overflow-y-auto list-inset overflow-hidden rounded-2xl bg-card text-subhead">
					{templates.map((x) => (
						<li key={x.code} className="flex items-center gap-3 px-3 py-2">
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
								<span
									className={
										x.present ? "text-muted-foreground" : "font-medium"
									}
								>
									{x.title}
								</span>
								<span className="ml-2 text-muted-foreground text-footnote">
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
						disabled={pending || picked.length === 0}
						onClick={() =>
							start(async () => {
								const res = await applyDocumentTemplates({ codes: picked });
								if (!res.ok) return void toast.error(errorText(tc, res));
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
export function ImportDialog() {
	const t = useTranslations("Documents");
	const te = useTranslations("Evidence");
	const tc = useTranslations("Common");
	const td = useTranslations("Dlp");
	const feedback = useUploadFeedback();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [files, setFiles] = useState<File[]>([]);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					<FileUp />
					{t("import")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("import")}</DialogTitle>
					<DialogDescription>{t("importLead")}</DialogDescription>
				</DialogHeader>
				<Input
					type="file"
					multiple
					accept=".pdf,.docx,.xlsx,.pptx,.txt"
					onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
				/>
				<p className="text-muted-foreground text-footnote">{te("fileHint")}</p>
				<DialogFooter>
					<Button variant="ghost" onClick={() => setOpen(false)}>
						{tc("cancel")}
					</Button>
					<Button
						disabled={pending || files.length === 0}
						onClick={() =>
							start(async () => {
								const ids: string[] = [];
								for (const f of files.slice(0, 50)) {
									const big = feedback.tooLarge(f);
									if (big) {
										toast.error(`${f.name}: ${big}`);
										continue;
									}
									const fd = new FormData();
									fd.set("file", f);
									fd.set("title", f.name);
									fd.set("type", "document");
									fd.set("classification", "internal");
									const up = await uploadEvidence(fd);
									if (up.ok) ids.push(up.data.id);
									else {
										const warn = feedback.dlpWarning(up);
										toast.error(
											`${f.name}: ${
												warn
													? td("warnLead", {
															detectors: feedback.detectors(warn),
														})
													: feedback.errorText(up)
											}`,
										);
									}
								}
								if (ids.length === 0) return;
								const res = await importDocumentsFromEvidence(ids);
								if (!res.ok) return void toast.error(errorText(tc, res));
								toast.success(t("imported", { n: res.data.created }));
								setOpen(false);
								setFiles([]);
								router.refresh();
							})
						}
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
										: errorText(tc, res),
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
					className="font-mono text-footnote"
				/>
			</TabsContent>
			<TabsContent value="preview">
				<div className="rounded-2xl bg-card p-4">
					<MarkdownView source={value || `_${t("noContent")}_`} />
				</div>
			</TabsContent>
		</Tabs>
	);
}

// Neue Fassung anlegen: nur aus freigegebenem, veröffentlichtem oder
// zurückgezogenem Stand. Grundlage ist der aktuelle Stand oder eine ältere
// Fassung (statt „Wiederherstellen“).
export function NewVersionDialog({
	documentId,
	version,
	basisVersions,
	defaultBasis,
}: {
	documentId: string;
	version: string;
	basisVersions: string[];
	defaultBasis?: string;
}) {
	const t = useTranslations("Documents");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [summary, setSummary] = useState("");
	const [bump, setBump] = useState<"minor" | "major">("minor");
	const [basis, setBasis] = useState(defaultBasis ?? "");
	const [error, setError] = useState<string | null>(null);
	const others = basisVersions.filter((v) => v !== version);
	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				setOpen(v);
				if (v) setBasis(defaultBasis ?? "");
				setError(null);
			}}
		>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					{t("newVersion")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("newVersion")}</DialogTitle>
					<DialogDescription>{t("newVersionLead")}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="nv-summary">{t("changeSummary")}</Label>
					<Textarea
						id="nv-summary"
						rows={3}
						value={summary}
						onChange={(e) => setSummary(e.target.value)}
					/>
				</div>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="nv-bump">{t("version")}</Label>
						<Select
							value={bump}
							onValueChange={(v) => setBump(v as typeof bump)}
						>
							<SelectTrigger id="nv-bump" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="minor">
									{t("bumpMinor", { version: bumpVersion(version, "minor") })}
								</SelectItem>
								<SelectItem value="major">
									{t("bumpMajor", { version: bumpVersion(version, "major") })}
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{others.length > 0 && (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="nv-basis">{t("basis")}</Label>
							<Select
								value={basis || "_current"}
								onValueChange={(v) => setBasis(v === "_current" ? "" : v)}
							>
								<SelectTrigger id="nv-basis" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="_current">
										{t("basisCurrent", { version })}
									</SelectItem>
									{others.map((v) => (
										<SelectItem key={v} value={v}>
											{t("basisVersion", { version: v })}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
				</div>
				<p className="text-muted-foreground text-footnote">{t("ackReset")}</p>
				<FormAlert message={error} />
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
									fromVersion: basis || undefined,
								});
								if (!res.ok)
									return void setError(
										res.error === "document_draft" ||
											res.error === "document_in_review"
											? t(res.error)
											: errorText(tc, res),
									);
								toast.success(
									t("newVersionCreated", { version: res.data.version }),
								);
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
