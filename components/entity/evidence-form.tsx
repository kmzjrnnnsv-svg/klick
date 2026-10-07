"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createEvidenceLink, uploadEvidence } from "@/app/actions/evidence";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const TYPES = [
	"document",
	"screenshot",
	"link",
	"config_export",
	"attestation",
	"log_extract",
] as const;
const CLASSES = ["public", "internal", "confidential", "secret"] as const;

// Nachweis hinzufügen: Datei (verschlüsselt) oder Link/Attestierung.
export function EvidenceForm({
	implementationId,
	storageAvailable,
	label,
}: {
	implementationId?: string;
	storageAvailable: boolean;
	label?: string;
}) {
	const t = useTranslations("Evidence");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [type, setType] = useState<(typeof TYPES)[number]>("document");
	const [classification, setClassification] =
		useState<(typeof CLASSES)[number]>("internal");
	const [url, setUrl] = useState("");
	const [validUntil, setValidUntil] = useState("");
	const [file, setFile] = useState<File | null>(null);

	function reset() {
		setTitle("");
		setDescription("");
		setUrl("");
		setValidUntil("");
		setFile(null);
	}

	function submit(mode: "upload" | "link") {
		start(async () => {
			let res: Awaited<ReturnType<typeof createEvidenceLink>>;
			if (mode === "upload") {
				if (!file) return;
				const fd = new FormData();
				fd.set("file", file);
				fd.set("title", title || file.name);
				fd.set("description", description);
				fd.set("type", type);
				fd.set("classification", classification);
				if (validUntil) fd.set("validUntil", validUntil);
				if (implementationId) fd.set("implementationId", implementationId);
				res = await uploadEvidence(fd);
			} else {
				res = await createEvidenceLink({
					implementationId,
					title,
					description: description || undefined,
					type: type === "document" ? "link" : type,
					classification,
					url: url || undefined,
					validUntil: validUntil || null,
				});
			}
			if (!res.ok) {
				toast.error(
					res.error === "storageNotConfigured"
						? t("storageNotConfigured")
						: res.error.startsWith("upload_")
							? `${tc("error")} (${res.error.slice(7)})`
							: tc("error"),
				);
				return;
			}
			toast.success(t("created"));
			setOpen(false);
			reset();
			router.refresh();
		});
	}

	const common = (
		<>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="ev-title">{t("titleField")}</Label>
				<Input
					id="ev-title"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					maxLength={200}
				/>
			</div>
			<div className="grid gap-4 sm:grid-cols-3">
				<div className="flex flex-col gap-1.5">
					<Label>{t("typeField")}</Label>
					<Select value={type} onValueChange={(v) => setType(v as typeof type)}>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{TYPES.map((x) => (
								<SelectItem key={x} value={x}>
									{t(`type_${x}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>{t("classification")}</Label>
					<Select
						value={classification}
						onValueChange={(v) => setClassification(v as typeof classification)}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CLASSES.map((x) => (
								<SelectItem key={x} value={x}>
									{t(`class_${x}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="ev-valid">{t("validUntil")}</Label>
					<Input
						id="ev-valid"
						type="date"
						value={validUntil}
						onChange={(e) => setValidUntil(e.target.value)}
					/>
				</div>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="ev-desc">{t("description")}</Label>
				<Textarea
					id="ev-desc"
					rows={2}
					value={description}
					onChange={(e) => setDescription(e.target.value)}
				/>
			</div>
		</>
	);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					<Plus />
					{label ?? t("new")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("new")}</DialogTitle>
					<DialogDescription>{t("lead")}</DialogDescription>
				</DialogHeader>
				<Tabs defaultValue={storageAvailable ? "upload" : "link"}>
					<TabsList>
						<TabsTrigger value="upload" disabled={!storageAvailable}>
							{t("upload")}
						</TabsTrigger>
						<TabsTrigger value="link">{t("link")}</TabsTrigger>
					</TabsList>
					<TabsContent value="upload">
						<form
							className="flex flex-col gap-4"
							onSubmit={(e) => {
								e.preventDefault();
								submit("upload");
							}}
						>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="ev-file">{t("file")}</Label>
								<Input
									id="ev-file"
									type="file"
									required
									onChange={(e) => setFile(e.target.files?.[0] ?? null)}
									accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.txt,.csv,.json"
								/>
								<p className="text-muted-foreground text-xs">{t("fileHint")}</p>
							</div>
							{common}
							<div className="flex justify-end">
								<Button type="submit" disabled={pending || !file}>
									{t("upload")}
								</Button>
							</div>
						</form>
					</TabsContent>
					<TabsContent value="link">
						<form
							className="flex flex-col gap-4"
							onSubmit={(e) => {
								e.preventDefault();
								submit("link");
							}}
						>
							{common}
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="ev-url">{t("url")}</Label>
								<Input
									id="ev-url"
									type="url"
									value={url}
									onChange={(e) => setUrl(e.target.value)}
									placeholder="https://"
								/>
							</div>
							<div className="flex justify-end">
								<Button
									type="submit"
									disabled={pending || title.trim().length === 0}
								>
									{tc("save")}
								</Button>
							</div>
						</form>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
