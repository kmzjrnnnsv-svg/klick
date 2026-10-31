"use client";

import { Download, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	type CsvPreview,
	importCustomCsvAction,
} from "@/app/actions/custom-frameworks";
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
import { FormAlert } from "@/components/ui/form-alert";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { CSV_COLUMNS, CSV_TEMPLATE, useCfError } from "./use-cf-error";

const MAX_BYTES = 2_000_000;

// CSV-Import in zwei Schritten: prüfen (Vorschau mit Zählern und Fehlern je
// Zeile), dann übernehmen. Gleiche Nummer aktualisiert, nichts wird gelöscht.
export function CsvImportDialog({
	frameworkId,
	initialOpen = false,
}: {
	frameworkId: string;
	initialOpen?: boolean;
}) {
	const t = useTranslations("CustomFrameworks");
	const tc = useTranslations("Common");
	const router = useRouter();
	const fail = useCfError();
	const [open, setOpen] = useState(initialOpen);
	const [pending, start] = useTransition();
	const [csv, setCsv] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [preview, setPreview] = useState<CsvPreview | null>(null);

	const errorLine = (e: { row: number; error: string }) => {
		const [code = "", detail = ""] = e.error.split(":");
		return t("csvRow", {
			row: e.row,
			error: t(`csvErr_${code}` as "csvErr_code_missing", { code: detail }),
		});
	};

	function download() {
		const url = URL.createObjectURL(
			new Blob([`﻿${CSV_TEMPLATE}`], { type: "text/csv;charset=utf-8" }),
		);
		const a = document.createElement("a");
		a.href = url;
		a.download = "eigenes-rahmenwerk-vorlage.csv";
		a.click();
		URL.revokeObjectURL(url);
	}

	function run(dryRun: boolean) {
		start(async () => {
			setError(null);
			const res = await importCustomCsvAction({ frameworkId, csv, dryRun });
			if (!res.ok) return setError(fail(res));
			if (dryRun) return setPreview(res.data);
			toast.success(
				t("csvDone", { created: res.data.created, updated: res.data.updated }),
			);
			setOpen(false);
			setCsv("");
			setPreview(null);
			router.replace(`/rahmenwerke/eigene/${frameworkId}`, { scroll: false });
			router.refresh();
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				setError(null);
				// ?import=1 nur einmal: nach dem Schließen nicht erneut öffnen
				if (!o && initialOpen)
					router.replace(`/rahmenwerke/eigene/${frameworkId}`, {
						scroll: false,
					});
			}}
		>
			<DialogTrigger asChild>
				<Button size="sm" variant="secondary">
					<Upload aria-hidden="true" />
					{t("csv")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{t("csv")}</DialogTitle>
					<DialogDescription>
						{t("csvLead", { columns: CSV_COLUMNS })}
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-wrap gap-2">
					<Button type="button" size="sm" variant="ghost" onClick={download}>
						<Download aria-hidden="true" />
						{t("csvTemplate")}
					</Button>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="cf-csv-file">{t("csvFile")}</Label>
					<input
						id="cf-csv-file"
						type="file"
						accept=".csv,text/csv,text/plain"
						className="text-subhead file:mr-3 file:min-h-(--control-h-sm) file:rounded-full file:border-0 file:bg-muted file:px-3 file:font-medium file:text-foreground"
						onChange={async (e) => {
							const f = e.target.files?.[0];
							if (!f) return;
							if (f.size > MAX_BYTES) return setError(t("error_too_many_rows"));
							setCsv(await f.text());
							setPreview(null);
						}}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="cf-csv-text">{t("csvPaste")}</Label>
					<Textarea
						id="cf-csv-text"
						rows={6}
						spellCheck={false}
						className="font-mono"
						value={csv}
						placeholder={CSV_COLUMNS}
						onChange={(e) => {
							setCsv(e.target.value);
							setPreview(null);
						}}
					/>
				</div>
				{preview && (
					<div className="flex flex-col gap-2" aria-live="polite">
						<p className="font-medium text-subhead">
							{t("csvPreview", {
								created: preview.created,
								updated: preview.updated,
								errors: preview.errors.length,
							})}
						</p>
						{preview.errors.length > 0 && (
							<ul className="max-h-40 overflow-y-auto rounded-xl bg-muted/50 p-2.5 text-footnote">
								{preview.errors.slice(0, 50).map((e) => (
									<li key={`${e.row}-${e.error}`}>{errorLine(e)}</li>
								))}
							</ul>
						)}
					</div>
				)}
				<FormAlert message={error} />
				<DialogFooter>
					<Button type="button" variant="ghost" onClick={() => setOpen(false)}>
						{tc("cancel")}
					</Button>
					{preview && preview.created + preview.updated > 0 ? (
						<Button type="button" disabled={pending} onClick={() => run(false)}>
							{pending ? tc("working") : t("csvApply")}
						</Button>
					) : (
						<Button
							type="button"
							disabled={pending || csv.trim().length < 5}
							onClick={() => run(true)}
						>
							{pending ? tc("working") : t("csvCheck")}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
