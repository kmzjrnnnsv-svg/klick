"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormDialog } from "@/components/organisation/governance-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/validation/common";

export type CsvImportResult = { imported: number; errors: string[] };

// Generischer CSV-Import: Datei wählen oder Text einfügen; die Server-Action
// validiert jede Zeile mit dem Register-Schema und ignoriert organization_id.
export function CsvImport({
	title,
	columns,
	action,
}: {
	title: string;
	columns: string;
	action: (input: { csv: string }) => Promise<ActionResult<CsvImportResult>>;
}) {
	const t = useTranslations("Import");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [csv, setCsv] = useState("");
	const [errors, setErrors] = useState<string[]>([]);
	return (
		<FormDialog
			title={title}
			lead={t("lead", { columns })}
			trigger={
				<Button variant="outline" size="sm">
					<Upload />
					{t("button")}
				</Button>
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={csv.trim().length < 5}
			wide
			onSubmit={() =>
				start(async () => {
					const res = await action({ csv });
					if (!res.ok) return void toast.error(res.error || tc("error"));
					setErrors(res.data.errors);
					toast.success(
						t("done", { n: res.data.imported, e: res.data.errors.length }),
					);
					if (res.data.errors.length === 0) {
						setOpen(false);
						setCsv("");
					}
					router.refresh();
				})
			}
		>
			<Input
				type="file"
				accept=".csv,text/csv,text/plain"
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (!f) return;
					if (f.size > 2_000_000) return void toast.error(t("tooLarge"));
					f.text().then(setCsv);
				}}
			/>
			<Textarea
				rows={10}
				className="font-mono text-xs"
				placeholder={columns}
				value={csv}
				onChange={(e) => setCsv(e.target.value)}
			/>
			{errors.length > 0 && (
				<ul className="max-h-40 list-disc overflow-auto pl-5 text-destructive text-xs">
					{errors.map((e) => (
						<li key={e}>{e}</li>
					))}
				</ul>
			)}
		</FormDialog>
	);
}
