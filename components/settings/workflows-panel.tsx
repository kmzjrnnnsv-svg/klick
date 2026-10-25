"use client";

import { ChevronRight, Pencil, Plus, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setWorkflowEnabled } from "@/app/actions/approvals";
import {
	applyWorkflowPreset,
	setGovernanceMode,
} from "@/app/actions/workflows";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { usePermissionLabel } from "@/components/settings/roles-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-alert";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { errorText } from "@/components/ui/error-text";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
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
	// Fundstellen der gewählten Rahmenwerke, die den Ablauf verlangen
	requiredBy: string[];
};

export type FindingItem = {
	kind: string;
	name: string;
	id: string | null;
	problem: "off" | "missing_approver" | "not_everyone";
	basis: string[];
	missing: string[];
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
	mode,
	findings,
	isOwner,
}: {
	triggers: Pick<TriggerDef, "key" | "area" | "mode">[];
	texts: Record<string, TriggerText>;
	facts: Record<string, FactInfo[]>;
	workflows: WorkflowItem[];
	names: RuleNames;
	presets: PresetInfo[];
	canEdit: boolean;
	mode: "standard" | "individual";
	findings: FindingItem[];
	isOwner: boolean;
}) {
	const t = useTranslations("Workflows");
	const l = usePermissionLabel();
	const individual = mode === "individual";
	const design = canEdit && individual;
	return (
		<div className="flex flex-col gap-6">
			<ModeControl mode={mode} canSwitch={isOwner} />
			<Findings findings={findings} names={names} canEdit={design} />
			<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<p className="max-w-prose text-muted-foreground text-subhead">
					{individual ? t("lead") : t("leadStandard")}
				</p>
				{design && <PresetsDialog presets={presets} texts={texts} />}
			</div>
			{AREAS.map((area) => {
				const inArea = triggers.filter((x) => x.area === area);
				if (inArea.length === 0) return null;
				return (
					<section key={area} className="flex flex-col gap-3">
						<h3 className="font-medium text-subhead">{l.area(area)}</h3>
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
								design={design}
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
	design,
}: {
	trigger: Pick<TriggerDef, "key" | "mode">;
	text: TriggerText | undefined;
	facts: FactInfo[];
	items: WorkflowItem[];
	names: RuleNames;
	canEdit: boolean;
	// Abläufe gestalten (individueller Modus)
	design: boolean;
}) {
	const t = useTranslations("Workflows");
	return (
		<div className="overflow-hidden rounded-2xl bg-card">
			<div className="flex flex-col gap-2 border-b px-3 py-2 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<p className="flex flex-wrap items-center gap-2 font-medium text-subhead">
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
					<p className="text-muted-foreground text-footnote">{text?.hint}</p>
				</div>
				{design && (
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
						design={design}
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
	design,
}: {
	item: WorkflowItem;
	facts: FactInfo[];
	names: RuleNames;
	canEdit: boolean;
	design: boolean;
}) {
	const t = useTranslations("Workflows");
	const tc = useTranslations("Common");
	const text = useRouteText(names, facts);
	const router = useRouter();
	const [pending, start] = useTransition();
	const required = item.requiredBy.join(", ");
	// höchstens drei Fundstellen im Label, alle in der Rückfrage
	const shown =
		item.requiredBy.length > 3
			? t("requiredByMore", {
					basis: item.requiredBy.slice(0, 3).join(", "),
					n: item.requiredBy.length - 3,
				})
			: t("requiredBy", { basis: required });
	const confirmOff = useConfirm({
		title: t("disableRequiredTitle", { name: item.name }),
		description: t("disableRequiredLead", { basis: required }),
		confirmLabel: t("disableRequired"),
	});
	const toggle = (v: boolean) =>
		start(async () => {
			const res = await withStepUp(() =>
				setWorkflowEnabled({ kind: item.kind, enabled: v }),
			);
			if (!res.ok)
				toast.error(
					res.error === "step_up_required" ? t("stepUp") : errorText(tc, res),
				);
			else {
				toast.success(t("toggled"));
				router.refresh();
			}
		});
	const variant = item.custom || item.conditions.length > 0;
	return (
		<li className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-4">
			{confirmOff.node}
			<div className="min-w-0 flex-1">
				<p className="text-subhead">
					<span className="text-muted-foreground">
						{variant ? t("variant") : t("standard")}:
					</span>{" "}
					<span className="font-medium">{item.name}</span>
				</p>
				{required && (
					<p className="text-footnote">
						<Badge
							className="h-auto whitespace-normal text-left"
							title={required}
						>
							{shown}
						</Badge>
					</p>
				)}
				<p className="text-muted-foreground text-footnote">
					{item.conditions.length > 0
						? t("appliesWhen", {
								conditions: text.conditions(item.conditions),
							})
						: t("appliesAlways")}
					{variant ? ` · ${t("priorityShort", { n: item.priority })}` : ""}
				</p>
				<ol className="mt-1.5 flex flex-wrap items-center gap-1 text-footnote">
					{item.steps.map((s, i) => (
						<li key={s.order} className="flex items-center gap-1">
							{i > 0 && (
								<ChevronRight
									aria-hidden
									className="size-3 text-muted-foreground"
								/>
							)}
							<Badge
								variant="outline"
								className="h-auto max-w-full whitespace-normal text-left"
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
						!v && required ? confirmOff.ask(() => toggle(v)) : toggle(v)
					}
				/>
				{canEdit && (
					<Button asChild size="sm" variant="outline">
						<Link
							href={`/einstellungen/freigaben/${item.id}`}
							aria-label={
								design
									? t("editNamed", { name: item.name })
									: t("viewNamed", { name: item.name })
							}
						>
							{design && <Pencil />}
							{design ? t("edit") : t("view")}
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
				<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card">
					{presets.map((p) => (
						<li
							key={p.key}
							className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:gap-4"
						>
							<div className="min-w-0 flex-1">
								<p className="font-medium text-subhead">
									{p.name}{" "}
									{p.variant && (
										<Badge variant="muted">{t("presetVariant")}</Badge>
									)}
								</p>
								<p className="text-muted-foreground text-footnote">
									{texts[p.trigger]?.label} · {p.description}
								</p>
								{p.roles.length > 0 && (
									<p className="mt-1 text-muted-foreground text-footnote">
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
													: errorText(tc, res),
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

// Standard oder individuell (ADR-024): Wechsel nur Inhaber:in, mit Rückfrage
// und frischer Bestätigung
function ModeControl({
	mode,
	canSwitch,
}: {
	mode: "standard" | "individual";
	canSwitch: boolean;
}) {
	const t = useTranslations("Workflows");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [target, setTarget] = useState<"standard" | "individual">(mode);
	const confirm = useConfirm({
		title:
			target === "individual" ? t("toIndividualTitle") : t("toStandardTitle"),
		description:
			target === "individual" ? t("toIndividualLead") : t("toStandardLead"),
		confirmLabel: target === "individual" ? t("toIndividual") : t("toStandard"),
		destructive: target === "standard",
	});
	const pick = (next: "standard" | "individual") => {
		if (next === mode || !canSwitch) return;
		setTarget(next);
		confirm.ask(() =>
			start(async () => {
				const res = await withStepUp(() => setGovernanceMode({ mode: next }));
				if (!res.ok)
					return void toast.error(
						res.error === "step_up_required" ? t("stepUp") : errorText(tc, res),
					);
				toast.success(
					next === "individual" ? t("nowIndividual") : t("nowStandard"),
				);
				router.refresh();
			}),
		);
	};
	return (
		<section className="flex flex-col gap-3 rounded-2xl bg-card p-4">
			{confirm.node}
			<div>
				<h3 className="font-medium text-headline">{t("modeTitle")}</h3>
				<p className="text-muted-foreground text-subhead">
					{mode === "standard"
						? t("modeStandardLead")
						: t("modeIndividualLead")}
				</p>
			</div>
			<fieldset
				aria-label={t("modeTitle")}
				className="grid grid-cols-2 gap-1 rounded-xl border-0 bg-muted p-1 sm:max-w-md"
			>
				{(["standard", "individual"] as const).map((m) => (
					<button
						key={m}
						type="button"
						aria-pressed={mode === m}
						disabled={pending || (!canSwitch && mode !== m)}
						onClick={() => pick(m)}
						className={`min-h-(--control-h) rounded-lg px-3 text-subhead transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
							mode === m
								? "bg-background font-medium shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{m === "standard" ? t("modeStandard") : t("modeIndividual")}
					</button>
				))}
			</fieldset>
			{!canSwitch && (
				<p className="text-muted-foreground text-footnote">
					{t("modeOwnerOnly")}
				</p>
			)}
		</section>
	);
}

// Pflichten der Rahmenwerke, die die Abläufe gerade nicht tragen
function Findings({
	findings,
	names,
	canEdit,
}: {
	findings: FindingItem[];
	names: RuleNames;
	canEdit: boolean;
}) {
	const t = useTranslations("Workflows");
	const text = useRouteText(names, []);
	if (findings.length === 0) return null;
	return (
		<section
			className="flex flex-col gap-2 rounded-2xl bg-warning/12 p-4"
			aria-labelledby="governance-findings"
		>
			<h3 id="governance-findings" className="font-medium text-headline">
				{t("findingsTitle", { n: findings.length })}
			</h3>
			<ul className="flex flex-col gap-2 text-subhead">
				{findings.map((f) => (
					<li key={`${f.kind}-${f.problem}`} className="flex flex-col gap-0.5">
						<span>
							<span className="font-medium">{f.name}</span>
							{": "}
							{t(`finding_${f.problem}`, {
								missing: f.missing
									.map((r) => text.approvers({ order: 1, approverRule: r }))
									.join(", "),
							})}
						</span>
						<span className="text-footnote">
							{t("requiredBy", { basis: f.basis.join(", ") })}
							{canEdit && f.id && (
								<>
									{" · "}
									<Link
										href={`/einstellungen/freigaben/${f.id}`}
										className="text-primary hover:underline"
									>
										{t("findingFix")}
									</Link>
								</>
							)}
						</span>
					</li>
				))}
			</ul>
		</section>
	);
}
