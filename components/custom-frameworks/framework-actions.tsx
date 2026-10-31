"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	deleteCustomFrameworkAction,
	deleteCustomSectionAction,
	saveCustomSectionAction,
	setCustomFrameworkStatusAction,
	updateCustomFrameworkAction,
} from "@/app/actions/custom-frameworks";
import { withStepUp } from "@/components/auth/step-up-dialog";
import {
	EditTrigger,
	FormDialog,
	NewTrigger,
} from "@/components/organisation/governance-forms";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { CustomFrameworkStatus } from "@/db/schema/custom-frameworks";
import { useCfError } from "./use-cf-error";

// Einschalten, zurückziehen, löschen: nur Inhaber:innen, mit Step-up und
// Rückfrage (useConfirm). Nach dem Löschen zurück zu den Einstellungen.
export function FrameworkStatusActions({
	id,
	status,
}: {
	id: string;
	status: CustomFrameworkStatus;
}) {
	const t = useTranslations("CustomFrameworks");
	const router = useRouter();
	const fail = useCfError();
	const [pending, start] = useTransition();
	const activate = useConfirm({
		title: t("activateTitle"),
		description: t("activateDescription"),
		confirmLabel: status === "retired" ? t("reactivate") : t("activate"),
		destructive: false,
	});
	const retire = useConfirm({
		title: t("retireTitle"),
		description: t("retireDescription"),
		confirmLabel: t("retire"),
	});
	const remove = useConfirm({
		title: t("deleteTitle"),
		description: t("deleteDescription"),
		confirmLabel: t("delete"),
	});

	const setStatus = (next: "active" | "retired") =>
		start(async () => {
			const res = await withStepUp(() =>
				setCustomFrameworkStatusAction({ id, status: next }),
			);
			if (!res.ok) return void toast.error(fail(res));
			toast.success(
				next === "active"
					? t("activated", { n: res.data.controlsCreated })
					: t("retiredDone"),
			);
			router.refresh();
		});

	return (
		<span className="flex flex-wrap gap-2">
			{status === "active" ? (
				<Button
					size="sm"
					variant="secondary"
					disabled={pending}
					onClick={() => retire.ask(() => setStatus("retired"))}
				>
					{t("retire")}
				</Button>
			) : (
				<Button
					size="sm"
					disabled={pending}
					onClick={() => activate.ask(() => setStatus("active"))}
				>
					{status === "retired" ? t("reactivate") : t("activate")}
				</Button>
			)}
			{status !== "active" && (
				<Button
					size="sm"
					variant="ghost"
					className="text-destructive"
					disabled={pending}
					onClick={() =>
						remove.ask(() =>
							start(async () => {
								const res = await withStepUp(() =>
									deleteCustomFrameworkAction({ id }),
								);
								if (!res.ok) return void toast.error(fail(res));
								toast.success(t("deleted"));
								router.push("/einstellungen?tab=frameworks");
							}),
						)
					}
				>
					{t("delete")}
				</Button>
			)}
			{activate.node}
			{retire.node}
			{remove.node}
		</span>
	);
}

export type FrameworkDetails = {
	id: string;
	name: string;
	version: string | null;
	issuer: string | null;
	description: string | null;
	sourceUrl: string | null;
	exclusionAllowed: boolean;
	exclusionLabel: string | null;
};

// Angaben des Rahmenwerks bearbeiten
export function FrameworkDetailsDialog({
	initial,
}: {
	initial: FrameworkDetails;
}) {
	const t = useTranslations("CustomFrameworks");
	const router = useRouter();
	const fail = useCfError();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [v, setV] = useState(initial);
	const set = (patch: Partial<FrameworkDetails>) =>
		setV((x) => ({ ...x, ...patch }));
	return (
		<FormDialog
			title={t("editDetails")}
			trigger={<EditTrigger label={t("editDetails")} />}
			open={open}
			setOpen={(o) => {
				setOpen(o);
				if (o) setV(initial);
				setError(null);
			}}
			pending={pending}
			disabled={v.name.trim().length < 2}
			error={error}
			wide
			onSubmit={() =>
				start(async () => {
					const res = await updateCustomFrameworkAction({
						id: v.id,
						name: v.name.trim(),
						version: v.version?.trim() || undefined,
						issuer: v.issuer?.trim() || undefined,
						description: v.description?.trim() || undefined,
						sourceUrl: v.sourceUrl?.trim() || "",
						exclusionAllowed: v.exclusionAllowed,
						exclusionLabel: v.exclusionLabel?.trim() || undefined,
					});
					if (!res.ok) return setError(fail(res));
					setOpen(false);
					toast.success(t("saved"));
					router.refresh();
				})
			}
		>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="cfd-name">{t("name")}</Label>
				<Input
					id="cfd-name"
					autoComplete="off"
					required
					maxLength={120}
					value={v.name}
					placeholder={t("namePlaceholder")}
					onChange={(e) => set({ name: e.target.value })}
				/>
			</div>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="cfd-issuer">{t("issuer")}</Label>
					<Input
						id="cfd-issuer"
						autoComplete="organization"
						maxLength={120}
						value={v.issuer ?? ""}
						placeholder={t("issuerPlaceholder")}
						onChange={(e) => set({ issuer: e.target.value })}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="cfd-version">{t("version")}</Label>
					<Input
						id="cfd-version"
						autoComplete="off"
						maxLength={40}
						value={v.version ?? ""}
						placeholder={t("versionPlaceholder")}
						onChange={(e) => set({ version: e.target.value })}
					/>
				</div>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="cfd-description">{t("description")}</Label>
				<Textarea
					id="cfd-description"
					rows={3}
					maxLength={4000}
					value={v.description ?? ""}
					placeholder={t("descriptionPlaceholder")}
					onChange={(e) => set({ description: e.target.value })}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="cfd-source">{t("sourceUrl")}</Label>
				<Input
					id="cfd-source"
					type="url"
					inputMode="url"
					autoComplete="url"
					spellCheck={false}
					value={v.sourceUrl ?? ""}
					placeholder={t("sourceUrlPlaceholder")}
					onChange={(e) => set({ sourceUrl: e.target.value })}
				/>
			</div>
			<div className="flex min-h-11 items-center justify-between gap-3">
				<span className="flex flex-col gap-0.5">
					<Label htmlFor="cfd-exclusion">{t("exclusionAllowed")}</Label>
					<span className="text-footnote text-muted-foreground">
						{t("exclusionAllowedHint")}
					</span>
				</span>
				<Switch
					id="cfd-exclusion"
					checked={v.exclusionAllowed}
					onCheckedChange={(c) => set({ exclusionAllowed: c })}
				/>
			</div>
			{v.exclusionAllowed && (
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="cfd-exclusion-label">{t("exclusionLabel")}</Label>
					<Input
						id="cfd-exclusion-label"
						autoComplete="off"
						maxLength={120}
						value={v.exclusionLabel ?? ""}
						placeholder={t("exclusionLabelPlaceholder")}
						onChange={(e) => set({ exclusionLabel: e.target.value })}
					/>
				</div>
			)}
		</FormDialog>
	);
}

// Abschnitt anlegen oder umbenennen; leere Abschnitte lassen sich löschen
export function SectionDialog({
	frameworkId,
	section,
	empty,
}: {
	frameworkId: string;
	// fehlt = neuer Abschnitt
	section?: { code: string; title: string; sortOrder: number };
	empty?: boolean;
}) {
	const t = useTranslations("CustomFrameworks");
	const router = useRouter();
	const fail = useCfError();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [code, setCode] = useState(section?.code ?? "");
	const [title, setTitle] = useState(section?.title ?? "");
	const remove = useConfirm({
		title: t("deleteSectionTitle"),
		description: t("deleteSectionDescription"),
		confirmLabel: t("deleteSection"),
	});
	return (
		<FormDialog
			title={section ? t("editSection") : t("addSection")}
			trigger={
				section ? (
					<EditTrigger label={t("editSection")} />
				) : (
					<NewTrigger variant="secondary" label={t("addSection")} />
				)
			}
			open={open}
			setOpen={(o) => {
				setOpen(o);
				setError(null);
			}}
			pending={pending}
			disabled={code.trim().length === 0 || title.trim().length === 0}
			error={error}
			onSubmit={() =>
				start(async () => {
					const res = await saveCustomSectionAction({
						frameworkId,
						code: section?.code ?? code.trim(),
						title: title.trim(),
						sortOrder: section?.sortOrder,
					});
					if (!res.ok) return setError(fail(res));
					setOpen(false);
					if (!section) {
						setCode("");
						setTitle("");
					}
					router.refresh();
				})
			}
		>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={`sec-code-${section?.code ?? "neu"}`}>
					{t("sectionCode")}
				</Label>
				<Input
					id={`sec-code-${section?.code ?? "neu"}`}
					autoComplete="off"
					spellCheck={false}
					maxLength={40}
					disabled={Boolean(section)}
					value={code}
					placeholder={t("sectionCodePlaceholder")}
					onChange={(e) => setCode(e.target.value)}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor={`sec-title-${section?.code ?? "neu"}`}>
					{t("sectionTitleLabel")}
				</Label>
				<Input
					id={`sec-title-${section?.code ?? "neu"}`}
					autoComplete="off"
					maxLength={200}
					value={title}
					placeholder={t("sectionTitlePlaceholder")}
					onChange={(e) => setTitle(e.target.value)}
				/>
			</div>
			{section && empty && (
				<Button
					type="button"
					variant="ghost"
					className="w-fit text-destructive"
					disabled={pending}
					onClick={() =>
						remove.ask(() =>
							start(async () => {
								const res = await deleteCustomSectionAction({
									frameworkId,
									code: section.code,
								});
								if (!res.ok) return setError(fail(res));
								setOpen(false);
								router.refresh();
							}),
						)
					}
				>
					{t("deleteSection")}
				</Button>
			)}
			{remove.node}
		</FormDialog>
	);
}
