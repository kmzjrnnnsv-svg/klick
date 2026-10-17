"use client";

import { CheckCircle2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FileDrop } from "@/components/uploads/file-drop";
import { decodeText } from "@/lib/uploads/text";
import type { ActionResult } from "@/lib/validation/common";

export type CsvImportResult = {
	dryRun: boolean;
	rows: number;
	valid: number;
	imported: number;
	duplicates: string[];
	errors: string[];
};

const MAX_BYTES = 2_000_000;

// CSV-Import in zwei Schritten: Datei wählen (Kodierung wird erkannt — auch
// Excel/Windows-1252) → Vorschau mit gültigen Zeilen, Dubletten und Fehlern
// → „N importieren“. Wiederholen legt nichts doppelt an.
export function CsvImport({
	title,
	columns,
	action,
}: {
	title: string;
	columns: string;
	action: (input: {
		csv: string;
		dryRun?: boolean;
	}) => Promise<ActionResult<CsvImportResult>>;
}) {
	const t = useTranslations("Import");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [csv, setCsv] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [preview, setPreview] = useState<CsvImportResult | null>(null);

	function reset() {
		setCsv("");
		setFiles([]);
		setPreview(null);
	}

	function check(text: string) {
		start(async () => {
			const res = await action({ csv: text, dryRun: true });
			if (!res.ok) {
				toast.error(
					res.error === "tooManyRows"
						? t("tooManyRows", { max: res.detail?.max ?? "2000" })
						: tc("error"),
				);
				return;
			}
			setPreview(res.data);
		});
	}

	async function pick(list: File[]) {
		setFiles(list);
		setPreview(null);
		const f = list[0];
		if (!f) return;
		if (f.size > MAX_BYTES) {
			toast.error(t("tooLarge"));
			setFiles([]);
			return;
		}
		const decoded = decodeText(new Uint8Array(await f.arrayBuffer()));
		if (!decoded) {
			toast.error(t("unreadable"));
			setFiles([]);
			return;
		}
		setCsv(decoded.text);
		check(decoded.text);
	}

	function runImport() {
		start(async () => {
			const res = await action({ csv, dryRun: false });
			if (!res.ok) return void toast.error(tc("error"));
			toast.success(
				t("done", {
					n: res.data.imported,
					d: res.data.duplicates.length,
					e: res.data.errors.length,
				}),
			);
			setOpen(false);
			reset();
			router.refresh();
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) reset();
			}}
		>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					<Upload />
					{t("button")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{t("lead", { columns })}</DialogDescription>
				</DialogHeader>
				<FileDrop
					files={files}
					onFiles={pick}
					accept=".csv,.txt,.tsv,text/csv,text/plain"
					disabled={pending}
				/>
				<details className="text-sm">
					<summary className="cursor-pointer text-muted-foreground">
						{t("pasteInstead")}
					</summary>
					<div className="mt-2 flex flex-col gap-2">
						<Textarea
							rows={8}
							className="font-mono text-xs"
							placeholder={columns}
							value={csv}
							onChange={(e) => {
								setCsv(e.target.value);
								setPreview(null);
							}}
						/>
						<div>
							<Button
								type="button"
								size="sm"
								variant="outline"
								disabled={pending || csv.trim().length < 5}
								onClick={() => check(csv)}
							>
								{t("check")}
							</Button>
						</div>
					</div>
				</details>
				{preview && (
					<div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
						<p className="flex items-center gap-2 font-medium">
							<CheckCircle2 className="size-4 text-success" aria-hidden />
							{t("previewSummary", {
								rows: preview.rows,
								valid: preview.valid,
								d: preview.duplicates.length,
								e: preview.errors.length,
							})}
						</p>
						{preview.duplicates.length > 0 && (
							<p className="text-muted-foreground text-xs">
								{t("duplicatesSkipped", {
									names: preview.duplicates.slice(0, 8).join(", "),
								})}
							</p>
						)}
						{preview.errors.length > 0 && (
							<ul className="max-h-40 list-disc overflow-auto pl-5 text-destructive text-xs">
								{preview.errors.map((e) => (
									<li key={e}>{e}</li>
								))}
							</ul>
						)}
					</div>
				)}
				<DialogFooter>
					<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
						{tc("cancel")}
					</Button>
					<Button
						type="button"
						variant="brown"
						disabled={pending || !preview || preview.valid === 0}
						onClick={runImport}
					>
						{preview ? t("importN", { n: preview.valid }) : t("button")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
