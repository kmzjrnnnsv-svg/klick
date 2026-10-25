"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	saveManagementReport,
	submitManagementReport,
} from "@/app/actions/management-reports";
import {
	EditTrigger,
	Field,
	FormDialog,
	NewTrigger,
} from "@/components/organisation/governance-forms";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { ManagementReportKind } from "@/db/schema/enums";

// Bericht an die Geschäftsleitung anlegen/bearbeiten (nur Entwürfe) und
// vorlegen. Kennzahlen kommen beim Vorlegen aus Klick.

export type ReportDraft = {
	id?: string;
	kind: ManagementReportKind;
	title: string;
	periodFrom: string;
	periodTo: string;
	summary?: string | null;
	measures?: string | null;
};

export function ReportForm({
	initial,
	kinds,
	triggerLabel,
}: {
	initial: ReportDraft;
	// wählbare Arten mit Titel und Vorschlag für den Zeitraum
	kinds: { kind: ManagementReportKind; title: string; from: string }[];
	triggerLabel?: string;
}) {
	const t = useTranslations("Reports");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<ReportDraft>(initial);
	const editing = Boolean(initial.id);
	return (
		<FormDialog
			title={editing ? t("edit") : t("new")}
			lead={t("formLead")}
			trigger={
				editing ? (
					<EditTrigger label={triggerLabel} />
				) : (
					<NewTrigger label={triggerLabel ?? t("new")} />
				)
			}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!d.title.trim() || !d.periodFrom || !d.periodTo}
			wide
			onSubmit={() =>
				start(async () => {
					const res = await saveManagementReport(d);
					if (!res.ok)
						return void toast.error(
							res.error === "locked" ? t("locked") : errorText(tc, res),
						);
					toast.success(t("saved"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5 sm:col-span-2">
					<Label>{t("kind")}</Label>
					<Select
						value={d.kind}
						disabled={editing}
						onValueChange={(v) => {
							const k = kinds.find((x) => x.kind === v);
							if (!k) return;
							setD({
								...d,
								kind: k.kind,
								title: editing ? d.title : k.title,
								periodFrom: editing ? d.periodFrom : k.from,
							});
						}}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{kinds.map((k) => (
								<SelectItem key={k.kind} value={k.kind}>
									{k.title}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="sm:col-span-2">
					<Field
						id="rp-title"
						label={t("title")}
						value={d.title}
						onChange={(v) => setD({ ...d, title: v })}
						maxLength={200}
						required
					/>
				</div>
				<Field
					id="rp-from"
					label={t("periodFrom")}
					type="date"
					value={d.periodFrom}
					onChange={(v) => setD({ ...d, periodFrom: v })}
					required
				/>
				<Field
					id="rp-to"
					label={t("periodTo")}
					type="date"
					value={d.periodTo}
					onChange={(v) => setD({ ...d, periodTo: v })}
					required
				/>
				<div className="sm:col-span-2">
					<Field
						id="rp-summary"
						label={t("summary")}
						rows={5}
						value={d.summary ?? ""}
						onChange={(v) => setD({ ...d, summary: v })}
						maxLength={10_000}
						placeholder={t("summaryPlaceholder")}
					/>
				</div>
				<div className="sm:col-span-2">
					<Field
						id="rp-measures"
						label={t("measures")}
						rows={4}
						value={d.measures ?? ""}
						onChange={(v) => setD({ ...d, measures: v })}
						maxLength={10_000}
						placeholder={t("measuresPlaceholder")}
					/>
				</div>
			</div>
		</FormDialog>
	);
}

export function SubmitReportButton({ id }: { id: string }) {
	const t = useTranslations("Reports");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			type="button"
			size="sm"
			disabled={pending}
			onClick={() => {
				if (!window.confirm(t("submitConfirm"))) return;
				start(async () => {
					const res = await submitManagementReport({ id });
					if (!res.ok)
						return void toast.error(
							res.error === "locked" ? t("locked") : errorText(tc, res),
						);
					toast.success(t("submitted"));
					router.refresh();
				});
			}}
		>
			<Send aria-hidden="true" />
			{pending ? t("submitting") : t("submit")}
		</Button>
	);
}
