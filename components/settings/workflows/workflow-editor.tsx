"use client";

import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	type DryRunStep,
	deleteWorkflow,
	dryRunWorkflow,
	saveWorkflow,
} from "@/app/actions/workflows";
import { withStepUp } from "@/components/auth/step-up-dialog";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ApprovalCondition, ApprovalStep } from "@/db/schema/grc";
import {
	OPS_BY_TYPE,
	type RuleNames,
	ruleLabel,
} from "@/lib/approvals/designer";
import type { FactInfo } from "@/lib/approvals/designer-labels";
import type { RouteWarning } from "@/lib/approvals/route";
import { useRouteText } from "./route-text";

type Opt = { value: string; label: string };
type Group = { label: string; options: Opt[] };

type DraftStep = {
	key: string;
	label: string;
	approvers: string[];
	mode: "any" | "all";
	minApprovers: string;
	slaDays: string;
	skipIf: string[];
	onlyIf: ApprovalCondition[];
};

type Initial = {
	id?: string;
	custom: boolean;
	name: string;
	description: string;
	enabled: boolean;
	priority: number;
	conditions: ApprovalCondition[];
	steps: ApprovalStep[];
};

let seq = 0;
const nextKey = () => `s${++seq}`;

function toDraft(s: ApprovalStep): DraftStep {
	return {
		key: nextKey(),
		label: s.label ?? "",
		approvers: (s.approvers?.length ? s.approvers : [s.approverRule]).filter(
			Boolean,
		),
		mode: s.mode === "all" ? "all" : "any",
		minApprovers: s.minApprovers ? String(s.minApprovers) : "",
		slaDays: s.slaDays ? String(s.slaDays) : "",
		skipIf: s.skipIf ?? [],
		onlyIf: s.onlyIf ?? [],
	};
}

function toStep(s: DraftStep, i: number): ApprovalStep {
	const min = Number(s.minApprovers);
	const sla = Number(s.slaDays);
	return {
		order: i + 1,
		approverRule: s.approvers[0] ?? "",
		approvers: s.approvers,
		mode: s.approvers.length > 1 ? s.mode : undefined,
		minApprovers: s.mode === "any" && min > 1 ? min : undefined,
		slaDays: sla > 0 ? sla : undefined,
		label: s.label.trim() || undefined,
		skipIf: s.skipIf.length ? s.skipIf : undefined,
		onlyIf: s.onlyIf.length ? s.onlyIf : undefined,
	};
}

function payloadStep(s: ApprovalStep) {
	return {
		label: s.label,
		approvers: s.approvers ?? [s.approverRule],
		mode: s.mode ?? "any",
		minApprovers: s.minApprovers,
		slaDays: s.slaDays,
		skipIf: s.skipIf,
		onlyIf: s.onlyIf,
	};
}

export function WorkflowEditor({
	trigger,
	facts,
	names,
	initial,
	options,
	people,
	requesterDefault,
}: {
	trigger: { key: string; mode: "pending" | "before" };
	facts: FactInfo[];
	names: RuleNames;
	initial: Initial;
	options: {
		roles: Opt[];
		base: Opt[];
		skipBase: Opt[];
		functions: Opt[];
		users: Opt[];
		allUsers: Opt[];
	};
	people: { userId: string; name: string }[];
	requesterDefault: string;
}) {
	const t = useTranslations("Workflows");
	const tc = useTranslations("Common");
	const router = useRouter();
	const uid = useId();
	const [pending, start] = useTransition();
	const [name, setName] = useState(initial.name);
	const [description, setDescription] = useState(initial.description);
	const [enabled, setEnabled] = useState(initial.enabled);
	const [priority, setPriority] = useState(String(initial.priority));
	const [conditions, setConditions] = useState(initial.conditions);
	const [steps, setSteps] = useState<DraftStep[]>(() =>
		initial.steps.length > 0
			? initial.steps.map(toDraft)
			: [toDraft({ order: 1, approverRule: "" })],
	);
	const [issues, setIssues] = useState<Record<string, string[]>>({});

	const approverGroups: Group[] = [
		{
			label: t("group_general"),
			options: [
				{ value: "owner_of_entity", label: names.ownerOfEntity },
				{ value: "not_requester", label: names.notRequester },
			],
		},
		{ label: t("group_roles"), options: options.roles },
		{ label: t("group_base"), options: options.base },
		{ label: t("group_functions"), options: options.functions },
		{ label: t("group_users"), options: options.users },
	];
	const skipGroups: Group[] = [
		{
			label: t("group_general"),
			options: [{ value: "owner_of_entity", label: names.ownerOfEntity }],
		},
		{ label: t("group_roles"), options: options.roles },
		{
			label: t("group_base"),
			options: [...options.base, ...options.skipBase],
		},
		{ label: t("group_functions"), options: options.functions },
		{ label: t("group_users"), options: options.allUsers },
	];

	const planned = useMemo(() => steps.map(toStep), [steps]);
	const text = useRouteText(names, facts);

	const update = (i: number, patch: Partial<DraftStep>) =>
		setSteps((xs) => xs.map((s, j) => (j === i ? { ...s, ...patch } : s)));
	const move = (i: number, d: -1 | 1) =>
		setSteps((xs) => {
			const out = [...xs];
			const [s] = out.splice(i, 1);
			if (s) out.splice(i + d, 0, s);
			return out;
		});
	const issuesAt = (prefix: string) =>
		Object.entries(issues)
			.filter(([k]) => k === prefix || k.startsWith(`${prefix}.`))
			.flatMap(([, codes]) => codes)
			.map((c) => t(`issue_${c}` as "issue_bad_op"));

	function save() {
		start(async () => {
			const res = await withStepUp(() =>
				saveWorkflow({
					id: initial.id,
					trigger: trigger.key,
					name,
					description: description || undefined,
					enabled,
					conditions,
					priority: Number(priority) || 0,
					steps: planned.map(payloadStep),
				}),
			);
			if (!res.ok) {
				setIssues(res.fieldErrors ?? {});
				toast.error(
					res.error === "step_up_required"
						? t("stepUp")
						: res.error === "invalid"
							? t("error_invalid")
							: tc("error"),
				);
				return;
			}
			setIssues({});
			toast.success(t("saved"));
			if (!initial.id)
				router.replace(`/einstellungen/freigaben/${res.data.id}`);
			else router.refresh();
		});
	}

	return (
		<div className="flex flex-col gap-8">
			<section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={`${uid}-name`}>{t("name")}</Label>
					<Input
						id={`${uid}-name`}
						value={name}
						onChange={(e) => setName(e.target.value)}
						autoComplete="off"
						required
					/>
				</div>
				<div className="flex items-end gap-6">
					<div className="flex items-center gap-2">
						<Switch
							id={`${uid}-enabled`}
							checked={enabled}
							onCheckedChange={setEnabled}
						/>
						<Label htmlFor={`${uid}-enabled`}>{t("enabled")}</Label>
					</div>
					{initial.custom && (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor={`${uid}-prio`}>{t("priority")}</Label>
							<Input
								id={`${uid}-prio`}
								type="number"
								inputMode="numeric"
								min={0}
								max={100}
								className="w-24"
								value={priority}
								onChange={(e) => setPriority(e.target.value)}
							/>
						</div>
					)}
				</div>
				<div className="flex flex-col gap-1.5 sm:col-span-2">
					<Label htmlFor={`${uid}-desc`}>{t("description")}</Label>
					<Textarea
						id={`${uid}-desc`}
						rows={2}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
					{initial.custom && (
						<p className="text-muted-foreground text-xs">{t("priorityHint")}</p>
					)}
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<div>
					<h2 className="font-medium">{t("whenTitle")}</h2>
					<p className="text-muted-foreground text-sm">
						{facts.length > 0 ? t("whenLead") : t("noFacts")}
					</p>
				</div>
				{facts.length > 0 && (
					<ConditionsEditor
						value={conditions}
						onChange={setConditions}
						facts={facts}
						issuesAt={(i) => issuesAt(`conditions.${i}`)}
					/>
				)}
			</section>

			<section className="flex flex-col gap-3">
				<div>
					<h2 className="font-medium">{t("stepsTitle")}</h2>
					<p className="text-muted-foreground text-sm">{t("stepsLead")}</p>
				</div>
				<ol className="flex flex-col gap-3">
					{steps.map((s, i) => (
						<li
							key={s.key}
							className="flex flex-col gap-4 rounded-md border p-3"
						>
							<div className="flex flex-wrap items-center gap-2">
								<Badge variant="outline">{t("step", { n: i + 1 })}</Badge>
								<Input
									aria-label={t("stepLabel")}
									placeholder={t("stepLabel")}
									value={s.label}
									onChange={(e) => update(i, { label: e.target.value })}
									className="h-8 min-w-0 flex-1 basis-48"
									autoComplete="off"
								/>
								<div className="flex gap-1">
									<Button
										type="button"
										size="icon"
										variant="ghost"
										disabled={i === 0}
										aria-label={t("moveUp", { n: i + 1 })}
										onClick={() => move(i, -1)}
									>
										<ArrowUp />
									</Button>
									<Button
										type="button"
										size="icon"
										variant="ghost"
										disabled={i === steps.length - 1}
										aria-label={t("moveDown", { n: i + 1 })}
										onClick={() => move(i, 1)}
									>
										<ArrowDown />
									</Button>
									<Button
										type="button"
										size="icon"
										variant="ghost"
										disabled={steps.length === 1}
										aria-label={t("removeStep", { n: i + 1 })}
										onClick={() =>
											setSteps((xs) => xs.filter((_, j) => j !== i))
										}
									>
										<Trash2 />
									</Button>
								</div>
							</div>
							<div className="flex flex-col gap-1.5">
								<span className="font-medium text-sm">{t("approvers")}</span>
								<RulePicker
									value={s.approvers}
									onChange={(approvers) => update(i, { approvers })}
									groups={approverGroups}
									placeholder={t("addApprover")}
									names={names}
								/>
							</div>
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
								{s.approvers.length > 1 && (
									<div className="flex flex-col gap-1.5">
										<Label htmlFor={`${uid}-${s.key}-mode`}>{t("mode")}</Label>
										<Select
											value={s.mode}
											onValueChange={(v) =>
												update(i, { mode: v === "all" ? "all" : "any" })
											}
										>
											<SelectTrigger id={`${uid}-${s.key}-mode`}>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="any">{t("modeAny")}</SelectItem>
												<SelectItem value="all">{t("modeAll")}</SelectItem>
											</SelectContent>
										</Select>
									</div>
								)}
								{s.mode === "any" && (
									<div className="flex flex-col gap-1.5">
										<Label htmlFor={`${uid}-${s.key}-min`}>
											{t("minApprovers")}
										</Label>
										<Input
											id={`${uid}-${s.key}-min`}
											type="number"
											inputMode="numeric"
											min={1}
											max={5}
											placeholder="1"
											value={s.minApprovers}
											onChange={(e) =>
												update(i, { minApprovers: e.target.value })
											}
										/>
									</div>
								)}
								<div className="flex flex-col gap-1.5">
									<Label htmlFor={`${uid}-${s.key}-sla`}>{t("slaDays")}</Label>
									<Input
										id={`${uid}-${s.key}-sla`}
										type="number"
										inputMode="numeric"
										min={0}
										max={90}
										value={s.slaDays}
										onChange={(e) => update(i, { slaDays: e.target.value })}
									/>
								</div>
							</div>
							<div className="flex flex-col gap-1.5">
								<span className="font-medium text-sm">{t("skipIf")}</span>
								<span className="text-muted-foreground text-xs">
									{t("skipIfLead")}
								</span>
								<RulePicker
									value={s.skipIf}
									onChange={(skipIf) => update(i, { skipIf })}
									groups={skipGroups}
									placeholder={t("addApprover")}
									names={names}
								/>
							</div>
							{facts.length > 0 && (
								<div className="flex flex-col gap-1.5">
									<span className="font-medium text-sm">{t("onlyIf")}</span>
									<span className="text-muted-foreground text-xs">
										{t("onlyIfLead")}
									</span>
									<ConditionsEditor
										value={s.onlyIf}
										onChange={(onlyIf) => update(i, { onlyIf })}
										facts={facts}
										issuesAt={(j) => issuesAt(`steps.${i}.onlyIf.${j}`)}
									/>
								</div>
							)}
							{issuesAt(`steps.${i}`).length > 0 && (
								<p className="text-destructive text-sm" role="alert">
									{[...new Set(issuesAt(`steps.${i}`))].join(" ")}
								</p>
							)}
						</li>
					))}
				</ol>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="self-start"
					disabled={steps.length >= 8}
					onClick={() =>
						setSteps((xs) => [
							...xs,
							toDraft({ order: xs.length + 1, approverRule: "" }),
						])
					}
				>
					<Plus />
					{t("addStep")}
				</Button>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="font-medium">{t("previewTitle")}</h2>
				{conditions.length > 0 && (
					<p className="text-muted-foreground text-sm">
						{t("appliesWhen", { conditions: text.conditions(conditions) })}
					</p>
				)}
				{planned.length === 0 ? (
					<p className="text-muted-foreground text-sm">{t("previewEmpty")}</p>
				) : (
					<ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
						{planned.map((s) => (
							<li key={s.order}>
								<span className="font-medium">
									{s.label && s.label !== text.approvers(s)
										? `${s.label}: `
										: ""}
									{text.approvers(s)}
								</span>
								{text.extras(s).length > 0 && (
									<span className="text-muted-foreground">
										{" "}
										({text.extras(s).join(" · ")})
									</span>
								)}
							</li>
						))}
					</ol>
				)}
			</section>

			<DryRun
				trigger={trigger.key}
				facts={facts}
				conditions={conditions}
				steps={planned}
				names={names}
				people={people}
				requesterDefault={requesterDefault}
			/>

			<div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
				<div className="flex gap-2">
					<Button
						variant="brown"
						disabled={pending || name.trim().length < 3}
						onClick={save}
					>
						{pending ? `${t("save")}…` : t("save")}
					</Button>
					<Button
						variant="outline"
						type="button"
						onClick={() => router.push("/einstellungen?tab=workflows")}
					>
						{t("cancel")}
					</Button>
				</div>
				{initial.id && initial.custom && (
					<DeleteVariant id={initial.id} name={initial.name} />
				)}
			</div>
		</div>
	);
}

function RulePicker({
	value,
	onChange,
	groups,
	placeholder,
	names,
}: {
	value: string[];
	onChange: (v: string[]) => void;
	groups: Group[];
	placeholder: string;
	names: RuleNames;
}) {
	const t = useTranslations("Workflows");
	const visible = groups
		.map((g) => ({
			...g,
			options: g.options.filter((o) => !value.includes(o.value)),
		}))
		.filter((g) => g.options.length > 0);
	return (
		<div className="flex flex-col gap-2">
			{value.length > 0 && (
				<ul className="flex flex-wrap gap-1">
					{value.map((r) => (
						<li key={r}>
							<Badge
								variant="outline"
								className="h-auto max-w-full gap-1 whitespace-normal py-0.5 pr-0.5 text-left normal-case tracking-normal"
							>
								{ruleLabel(r, names)}
								<button
									type="button"
									className="rounded p-0.5 hover:bg-muted focus-visible:outline-2"
									aria-label={t("removeRule", { name: ruleLabel(r, names) })}
									onClick={() => onChange(value.filter((x) => x !== r))}
								>
									<X className="size-3" aria-hidden />
								</button>
							</Badge>
						</li>
					))}
				</ul>
			)}
			{visible.length > 0 && (
				<Select
					key={value.join("|")}
					onValueChange={(v) => onChange([...value, v])}
				>
					<SelectTrigger className="w-full sm:w-80" aria-label={placeholder}>
						<SelectValue placeholder={placeholder} />
					</SelectTrigger>
					<SelectContent>
						{visible.map((g) => (
							<SelectGroup key={g.label}>
								<SelectLabel>{g.label}</SelectLabel>
								{g.options.map((o) => (
									<SelectItem key={o.value} value={o.value}>
										{o.label}
									</SelectItem>
								))}
							</SelectGroup>
						))}
					</SelectContent>
				</Select>
			)}
		</div>
	);
}

function defaultCondition(f: FactInfo): ApprovalCondition {
	if (f.type === "boolean") return { field: f.key, op: "is_true" };
	if (f.type === "number") return { field: f.key, op: "gte", value: 0 };
	return { field: f.key, op: "eq", value: f.options[0]?.value ?? "" };
}

function ConditionsEditor({
	value,
	onChange,
	facts,
	issuesAt,
}: {
	value: ApprovalCondition[];
	onChange: (v: ApprovalCondition[]) => void;
	facts: FactInfo[];
	issuesAt: (i: number) => string[];
}) {
	const t = useTranslations("Workflows");
	const uid = useId();
	const set = (i: number, c: ApprovalCondition) =>
		onChange(value.map((x, j) => (j === i ? c : x)));
	return (
		<div className="flex flex-col gap-2">
			{value.map((c, i) => {
				const f = facts.find((x) => x.key === c.field);
				const errs = issuesAt(i);
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: Reihenfolge ist die Identität
					<div key={i} className="flex flex-col gap-1">
						<div className="flex flex-wrap items-center gap-2">
							<Select
								value={c.field}
								onValueChange={(k) => {
									const nf = facts.find((x) => x.key === k);
									if (nf) set(i, defaultCondition(nf));
								}}
							>
								<SelectTrigger
									className="w-full sm:w-52"
									aria-label={t("field")}
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{facts.map((x) => (
										<SelectItem key={x.key} value={x.key}>
											{x.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{f && (
								<Select
									value={c.op}
									onValueChange={(op) => {
										const next = { ...c, op: op as ApprovalCondition["op"] };
										if (op === "in")
											next.value =
												typeof c.value === "string" && c.value ? [c.value] : [];
										else if (f.type === "enum" && Array.isArray(c.value))
											next.value = c.value[0] ?? f.options[0]?.value ?? "";
										set(i, next);
									}}
								>
									<SelectTrigger
										className="w-full sm:w-40"
										aria-label={t("op")}
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{OPS_BY_TYPE[f.type].map((op) => (
											<SelectItem key={op} value={op}>
												{t(`op_${op}`)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)}
							{f?.type === "number" && (
								<Input
									type="number"
									inputMode="decimal"
									aria-label={t("value")}
									className="w-full sm:w-28"
									value={typeof c.value === "number" ? c.value : ""}
									onChange={(e) =>
										set(i, { ...c, value: Number(e.target.value) })
									}
								/>
							)}
							{f?.type === "enum" && c.op !== "in" && (
								<Select
									value={typeof c.value === "string" ? c.value : ""}
									onValueChange={(v) => set(i, { ...c, value: v })}
								>
									<SelectTrigger
										className="w-full sm:w-52"
										aria-label={t("value")}
									>
										<SelectValue placeholder={t("choose")} />
									</SelectTrigger>
									<SelectContent>
										{f.options.map((o) => (
											<SelectItem key={o.value} value={o.value}>
												{o.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)}
							<Button
								type="button"
								size="icon"
								variant="ghost"
								aria-label={t("removeCondition")}
								onClick={() => onChange(value.filter((_, j) => j !== i))}
							>
								<X />
							</Button>
						</div>
						{f?.type === "enum" && c.op === "in" && (
							<div className="flex flex-wrap gap-x-4 gap-y-1">
								{f.options.map((o) => {
									const id = `${uid}-${i}-${o.value}`;
									const cur = Array.isArray(c.value) ? c.value : [];
									return (
										<label
											key={o.value}
											htmlFor={id}
											className="flex items-center gap-1.5 text-sm"
										>
											<Checkbox
												id={id}
												checked={cur.includes(o.value)}
												onCheckedChange={(v) =>
													set(i, {
														...c,
														value:
															v === true
																? [...cur, o.value]
																: cur.filter((x) => x !== o.value),
													})
												}
											/>
											{o.label}
										</label>
									);
								})}
							</div>
						)}
						{errs.length > 0 && (
							<p className="text-destructive text-xs" role="alert">
								{errs.join(" ")}
							</p>
						)}
					</div>
				);
			})}
			<Button
				type="button"
				size="sm"
				variant="ghost"
				className="self-start"
				disabled={value.length >= 8 || facts.length === 0}
				onClick={() => {
					const f = facts[0];
					if (f) onChange([...value, defaultCondition(f)]);
				}}
			>
				<Plus />
				{t("addCondition")}
			</Button>
		</div>
	);
}

const NONE = "__none__";

function DryRun({
	trigger,
	facts,
	conditions,
	steps,
	names,
	people,
	requesterDefault,
}: {
	trigger: string;
	facts: FactInfo[];
	conditions: ApprovalCondition[];
	steps: ApprovalStep[];
	names: RuleNames;
	people: { userId: string; name: string }[];
	requesterDefault: string;
}) {
	const t = useTranslations("Workflows");
	const tc = useTranslations("Common");
	const uid = useId();
	const [pending, start] = useTransition();
	const [requester, setRequester] = useState(requesterDefault);
	const [owner, setOwner] = useState(NONE);
	const [values, setValues] = useState<Record<string, string>>({});
	const [result, setResult] = useState<{
		applies: boolean;
		steps: DryRunStep[];
		warnings: RouteWarning[];
	} | null>(null);
	const nameOf = (id: string) =>
		people.find((p) => p.userId === id)?.name ?? "—";
	const usesOwner = steps.some(
		(s) =>
			(s.approvers ?? [s.approverRule]).includes("owner_of_entity") ||
			(s.skipIf ?? []).includes("owner_of_entity"),
	);

	function run() {
		const factValues: Record<string, string | number | boolean | null> = {};
		for (const f of facts) {
			const v = values[f.key];
			if (v === undefined || v === NONE || v === "") continue;
			factValues[f.key] =
				f.type === "number"
					? Number(v)
					: f.type === "boolean"
						? v === "true"
						: v;
		}
		start(async () => {
			const res = await dryRunWorkflow({
				trigger,
				conditions,
				steps: steps.map(payloadStep),
				requesterUserId: requester,
				entityOwnerUserId: owner === NONE ? undefined : owner,
				facts: factValues,
			});
			if (!res.ok) {
				toast.error(res.error === "invalid" ? t("error_invalid") : tc("error"));
				return;
			}
			setResult(res.data);
		});
	}

	return (
		<section className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3">
			<div>
				<h2 className="font-medium">{t("dryRunTitle")}</h2>
				<p className="text-muted-foreground text-sm">{t("dryRunLead")}</p>
			</div>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={`${uid}-req`}>{t("requester")}</Label>
					<Select value={requester} onValueChange={setRequester}>
						<SelectTrigger id={`${uid}-req`}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{people.map((p) => (
								<SelectItem key={p.userId} value={p.userId}>
									{p.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				{usesOwner && (
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={`${uid}-owner`}>{t("entityOwner")}</Label>
						<Select value={owner} onValueChange={setOwner}>
							<SelectTrigger id={`${uid}-owner`}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NONE}>{t("none")}</SelectItem>
								{people.map((p) => (
									<SelectItem key={p.userId} value={p.userId}>
										{p.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}
				{facts.map((f) => (
					<div key={f.key} className="flex flex-col gap-1.5">
						<Label htmlFor={`${uid}-f-${f.key}`}>{f.label}</Label>
						{f.type === "number" ? (
							<Input
								id={`${uid}-f-${f.key}`}
								type="number"
								inputMode="decimal"
								value={values[f.key] ?? ""}
								onChange={(e) =>
									setValues((v) => ({ ...v, [f.key]: e.target.value }))
								}
							/>
						) : (
							<Select
								value={values[f.key] ?? NONE}
								onValueChange={(x) => setValues((v) => ({ ...v, [f.key]: x }))}
							>
								<SelectTrigger id={`${uid}-f-${f.key}`}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NONE}>{t("none")}</SelectItem>
									{f.type === "boolean" ? (
										<>
											<SelectItem value="true">{t("yes")}</SelectItem>
											<SelectItem value="false">{t("no")}</SelectItem>
										</>
									) : (
										f.options.map((o) => (
											<SelectItem key={o.value} value={o.value}>
												{o.label}
											</SelectItem>
										))
									)}
								</SelectContent>
							</Select>
						)}
					</div>
				))}
			</div>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="self-start"
				disabled={pending || steps.every((s) => !s.approverRule)}
				onClick={run}
			>
				{pending ? `${t("dryRunButton")}…` : t("dryRunButton")}
			</Button>
			<div aria-live="polite">
				{result && (
					<div className="flex flex-col gap-2 text-sm">
						{!result.applies && (
							<p className="font-medium text-foreground">
								{t("dryRunNotApplies")}
							</p>
						)}
						<ol className="flex list-decimal flex-col gap-1 pl-5">
							{result.steps.map((s) => (
								<li key={s.order}>
									<span className="font-medium">
										{s.label ??
											(steps[s.order - 1]
												? ruleLabel(
														steps[s.order - 1]?.approverRule ?? "",
														names,
													)
												: "")}
									</span>
									{": "}
									{s.skipped ? (
										<span className="text-muted-foreground">
											{s.skipped.by === "requester"
												? t("dryRunSkippedRequester", {
														name: ruleLabel(s.skipped.rule, names),
													})
												: t("dryRunSkippedCondition")}
										</span>
									) : s.perRule.length > 0 ? (
										s.perRule.map((r, j) => (
											<span key={r.rule}>
												{j > 0 ? " · " : ""}
												{ruleLabel(r.rule, names)}:{" "}
												{r.approvers.length > 0 ? (
													r.approvers.join(", ")
												) : (
													<span className="text-destructive">
														{t("dryRunNobody")}
													</span>
												)}
											</span>
										))
									) : s.approvers.length > 0 ? (
										s.approvers.join(", ")
									) : (
										<span className="text-destructive">
											{t("dryRunNobody")}
										</span>
									)}
								</li>
							))}
						</ol>
						<p
							className={
								result.warnings.length > 0
									? "text-destructive"
									: "text-muted-foreground"
							}
						>
							{result.warnings.length > 0
								? t("dryRunWarnings", {
										n: new Set(result.warnings.map((w) => w.order)).size,
									})
								: t("dryRunOk")}
						</p>
						<p className="text-muted-foreground text-xs">
							{t("requester")}: {nameOf(requester)}
						</p>
					</div>
				)}
			</div>
		</section>
	);
}

function DeleteVariant({ id, name }: { id: string; name: string }) {
	const t = useTranslations("Workflows");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button variant="ghost" className="text-destructive" disabled={pending}>
					<Trash2 />
					{t("delete")}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("deleteConfirm", { name })}</AlertDialogTitle>
					<AlertDialogDescription>{t("deleteLead")}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
					<AlertDialogAction
						onClick={() =>
							start(async () => {
								const res = await withStepUp(() => deleteWorkflow({ id }));
								if (!res.ok) {
									toast.error(
										res.error === "hasRequests"
											? t("error_hasRequests")
											: res.error === "step_up_required"
												? t("stepUp")
												: tc("error"),
									);
									return;
								}
								toast.success(t("deleted"));
								router.push("/einstellungen?tab=workflows");
							})
						}
					>
						{t("delete")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
