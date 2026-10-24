"use client";

import { ArrowRight, Pencil, Plus, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setWorkflowEnabled } from "@/app/actions/approvals";
import { applyWorkflowPreset } from "@/app/actions/workflows";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { usePermissionLabel } from "@/components/settings/roles-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { ApprovalCondition, ApprovalStep } from "@/db/schema/grc";
import type { RuleNames } from "@/lib/approvals/designer";
import type { FactInfo, TriggerText } from "@/lib/approvals/designer-labels";
import type { TriggerDef } from "@/lib/approvals/triggers";
import { useRouteText } from "./workflows/route-text";

export type WorkflowItem = {
	id: string;
	kind: string;
	name: string;
	description: string | null;
	trigger: string;
	custom: boolean;
	enabled: boolean;
	priority: number;
	conditions: ApprovalCondition[];
	steps: ApprovalStep[];
};

export type PresetInfo = {
	key: string;
	trigger: string;
	name: string;
	description: string;
	variant: boolean;
	roles: string[];
};

const AREAS = [
	"register",
	"documents",
	"operations",
	"governance",
	"special",
] as const;

// Freigabe-Designer, Übersicht (Einstellungen → Freigaben): Auslöser nach
// Bereich, je Auslöser Standard-Ablauf und Varianten mit Bedingung.
export function WorkflowsPanel({
	triggers,
	texts,
	facts,
	workflows,
	names,
	presets,
	canEdit,
}: {
	triggers: Pick<TriggerDef, "key" | "area" | "mode">[];
	texts: Record<string, TriggerText>;
	facts: Record<string, FactInfo[]>;
	workflows: WorkflowItem[];
	names: RuleNames;
	presets: PresetInfo[];
	canEdit: boolean;
}) {
	const t = useTranslations("Workflows");
	const l = usePermissionLabel();
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<p className="max-w-prose text-muted-foreground text-sm">{t("lead")}</p>
				{canEdit && <PresetsDialog presets={presets} texts={texts} />}
			</div>
			{AREAS.map((area) => {
				const inArea = triggers.filter((x) => x.area === area);
				if (inArea.length === 0) return null;
				return (
					<section key={area} className="flex flex-col gap-3">
						<h3 className="font-medium text-sm">{l.area(area)}</h3>
						{inArea.map((tr) => (
							<TriggerCard
								key={tr.key}
								trigger={tr}
								text={texts[tr.key]}
								facts={facts[tr.key] ?? []}
								items={workflows
									.filter((w) => w.trigger === tr.key)
									.sort(
										(a, b) =>
											Number(a.custom) - Number(b.custom) ||
											b.priority - a.priority,
									)}
								names={names}
								canEdit={canEdit}
							/>
						))}
					</section>
				);
			})}
		</div>
	);
}

function TriggerCard({
	trigger,
	text,
	facts,
	items,
	names,
	canEdit,
}: {
	trigger: Pick<TriggerDef, "key" | "mode">;
	text: TriggerText | undefined;
	facts: FactInfo[];
	items: WorkflowItem[];
	names: RuleNames;
	canEdit: boolean;
}) {
	const t = useTranslations("Workflows");
	return (
		<div className="rounded-md border">
			<div className="flex flex-col gap-2 border-b px-3 py-2 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<p className="flex flex-wrap items-center gap-2 font-medium text-sm">
						{text?.label ?? trigger.key}
						<Badge
							variant="outline"
							title={
								trigger.mode === "before"
									? t("modeBeforeHint")
									: t("modePendingHint")
							}
						>
							{trigger.mode === "before" ? t("modeBefore") : t("modePending")}
							<span className="sr-only">
								:{" "}
								{trigger.mode === "before"
									? t("modeBeforeHint")
									: t("modePendingHint")}
							</span>
						</Badge>
					</p>
					<p className="text-muted-foreground text-xs">{text?.hint}</p>
				</div>
				{canEdit && (
					<Button asChild size="sm" variant="ghost" className="self-start">
						<Link
							href={`/einstellungen/freigaben/neu?ausloeser=${encodeURIComponent(trigger.key)}`}
						>
							<Plus />
							{t("addVariant")}
						</Link>
					</Button>
				)}
			</div>
			<ul className="flex flex-col divide-y divide-border/60">
				{items.map((w) => (
					<WorkflowRow
						key={w.id}
						item={w}
						facts={facts}
						names={names}
						canEdit={canEdit}
					/>
				))}
			</ul>
		</div>
	);
}

function WorkflowRow({
	item,
	facts,
	names,
	canEdit,
}: {
	item: WorkflowItem;
	facts: FactInfo[];
	names: RuleNames;
	canEdit: boolean;
}) {
	const t = useTranslations("Workflows");
	const tc = useTranslations("Common");
	const text = useRouteText(names, facts);
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<li className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-4">
			<div className="min-w-0 flex-1">
				<p className="text-sm">
					<span className="text-muted-foreground">
						{item.custom ? t("variant") : t("standard")}:
					</span>{" "}
					<span className="font-medium">{item.name}</span>
				</p>
				<p className="text-muted-foreground text-xs">
					{item.conditions.length > 0
						? t("appliesWhen", {
								conditions: text.conditions(item.conditions),
							})
						: t("appliesAlways")}
					{item.custom ? ` · ${t("priorityShort", { n: item.priority })}` : ""}
				</p>
				<ol className="mt-1.5 flex flex-wrap items-center gap-1 text-xs">
					{item.steps.map((s, i) => (
						<li key={s.order} className="flex items-center gap-1">
							{i > 0 && (
								<ArrowRight
									aria-hidden
									className="size-3 text-muted-foreground"
								/>
							)}
							<Badge
								variant="outline"
								className="h-auto max-w-full whitespace-normal text-left normal-case tracking-normal"
								title={text.extras(s).join(" · ") || undefined}
							>
								{s.order}. {s.label || text.approvers(s)}
								{s.mode === "all" && (s.approvers?.length ?? 0) > 1
									? ` (${t("previewAll")})`
									: ""}
								{text.extras(s).length > 0 && (
									<span className="sr-only">
										{" "}
										({text.extras(s).join(" · ")})
									</span>
								)}
							</Badge>
						</li>
					))}
				</ol>
			</div>
			<div className="flex items-center gap-2">
				<Switch
					checked={item.enabled}
					disabled={!canEdit || pending}
					aria-label={t("enabledNamed", { name: item.name })}
					onCheckedChange={(v) =>
						start(async () => {
							const res = await withStepUp(() =>
								setWorkflowEnabled({ kind: item.kind, enabled: v }),
							);
							if (!res.ok)
								toast.error(
									res.error === "step_up_required" ? t("stepUp") : tc("error"),
								);
							else {
								toast.success(t("toggled"));
								router.refresh();
							}
						})
					}
				/>
				{canEdit && (
					<Button asChild size="sm" variant="outline">
						<Link
							href={`/einstellungen/freigaben/${item.id}`}
							aria-label={t("editNamed", { name: item.name })}
						>
							<Pencil />
							{t("edit")}
						</Link>
					</Button>
				)}
			</div>
		</li>
	);
}

function PresetsDialog({
	presets,
	texts,
}: {
	presets: PresetInfo[];
	texts: Record<string, TriggerText>;
}) {
	const t = useTranslations("Workflows");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline" className="self-start">
					<Wand2 />
					{t("presets")}
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{t("presetsTitle")}</DialogTitle>
					<DialogDescription>{t("presetsLead")}</DialogDescription>
				</DialogHeader>
				<ul className="flex flex-col divide-y divide-border/60 rounded-md border">
					{presets.map((p) => (
						<li
							key={p.key}
							className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:gap-4"
						>
							<div className="min-w-0 flex-1">
								<p className="font-medium text-sm">
									{p.name}{" "}
									{p.variant && (
										<Badge variant="muted">{t("presetVariant")}</Badge>
									)}
								</p>
								<p className="text-muted-foreground text-xs">
									{texts[p.trigger]?.label} · {p.description}
								</p>
								{p.roles.length > 0 && (
									<p className="mt-1 text-muted-foreground text-xs">
										{t("presetRoles", { names: p.roles.join(", ") })}
									</p>
								)}
							</div>
							<Button
								size="sm"
								disabled={pending}
								className="self-start"
								onClick={() =>
									start(async () => {
										const res = await withStepUp(() =>
											applyWorkflowPreset({ key: p.key }),
										);
										if (!res.ok) {
											toast.error(
												res.error === "step_up_required"
													? t("stepUp")
													: tc("error"),
											);
											return;
										}
										toast.success(t("presetApplied"), {
											description:
												res.data.createdRoles.length > 0
													? t("presetRolesCreated", {
															names: res.data.createdRoles.join(", "),
														})
													: undefined,
											duration: 8000,
										});
										setOpen(false);
										router.refresh();
									})
								}
							>
								{t("presetApply")}
							</Button>
						</li>
					))}
				</ul>
			</DialogContent>
		</Dialog>
	);
}
