"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	createException,
	createLossEvent,
	createRisk,
	createTreatment,
	updateRisk,
} from "@/app/actions/risks";
import type { MemberOption } from "@/components/entity/owner-assignee";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RISK_CATEGORIES } from "@/db/schema/grc";

const SCALE = [1, 2, 3, 4, 5] as const;

function ScaleSelect({
	value,
	onChange,
	labels,
	id,
}: {
	value: number;
	onChange: (v: number) => void;
	labels: string[];
	id?: string;
}) {
	return (
		<Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
			<SelectTrigger className="w-full" id={id}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{SCALE.map((n) => (
					<SelectItem key={n} value={String(n)}>
						{n} · {labels[n - 1]}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

// „+ Risiko": Titel, Kategorie, Eintrittswahrscheinlichkeit, Auswirkung.
export function RiskQuickCreate({
	scales,
}: {
	scales: { likelihood: string[]; impact: string[] };
}) {
	const t = useTranslations("Risks");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [title, setTitle] = useState("");
	const [category, setCategory] =
		useState<(typeof RISK_CATEGORIES)[number]>("operational");
	const [l, setL] = useState(3);
	const [i, setI] = useState(3);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="brown">
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
							const res = await createRisk({
								title,
								category,
								likelihood: l,
								impact: i,
							});
							if (!res.ok) return void toast.error(tc("error"));
							toast.success(t("created"));
							setOpen(false);
							setTitle("");
							router.push(`/risiken/${res.data.id}`);
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("new")}</DialogTitle>
						<DialogDescription>{t("quickLead")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="risk-title">{t("titleField")}</Label>
						<Input
							id="risk-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							required
							maxLength={200}
							autoFocus
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label>{t("category")}</Label>
						<Select
							value={category}
							onValueChange={(v) => setCategory(v as typeof category)}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{RISK_CATEGORIES.map((c) => (
									<SelectItem key={c} value={c}>
										{t(`category_${c}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<Label>{t("likelihood")}</Label>
							<ScaleSelect
								value={l}
								onChange={setL}
								labels={scales.likelihood}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("impact")}</Label>
							<ScaleSelect value={i} onChange={setI} labels={scales.impact} />
						</div>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button
							type="submit"
							disabled={pending || title.trim().length === 0}
						>
							{tc("create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// Bewertung + Behandlung + Verknüpfungen bearbeiten (Detailseite).
export function RiskEditForm({
	risk,
	scales,
	members,
	controlOptions,
	assetOptions,
	linkedControls,
	linkedAssets,
	canEdit,
}: {
	risk: {
		id: string;
		likelihood: number;
		impact: number;
		treatment: "mitigate" | "accept" | "transfer" | "avoid";
		residualLikelihood: number | null;
		residualImpact: number | null;
		ownerUserId: string | null;
		assigneeUserId: string | null;
		reviewAt: string | null;
		description: string | null;
	};
	scales: { likelihood: string[]; impact: string[] };
	members: MemberOption[];
	controlOptions: { code: string; title: string }[];
	assetOptions: { id: string; name: string }[];
	linkedControls: string[];
	linkedAssets: string[];
	canEdit: boolean;
}) {
	const t = useTranslations("Risks");
	const te = useTranslations("Entity");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [l, setL] = useState(risk.likelihood);
	const [i, setI] = useState(risk.impact);
	const [treatment, setTreatment] = useState(risk.treatment);
	const [rl, setRl] = useState<number | null>(risk.residualLikelihood);
	const [ri, setRi] = useState<number | null>(risk.residualImpact);
	const [owner, setOwner] = useState(risk.ownerUserId ?? "");
	const [assignee, setAssignee] = useState(risk.assigneeUserId ?? "");
	const [reviewAt, setReviewAt] = useState(risk.reviewAt ?? "");
	const [description, setDescription] = useState(risk.description ?? "");
	const [ctrls, setCtrls] = useState<string[]>(linkedControls);
	const [assets, setAssets] = useState<string[]>(linkedAssets);
	if (!canEdit) return null;
	return (
		<form
			className="flex flex-col gap-4 text-sm"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					const res = await updateRisk({
						riskId: risk.id,
						likelihood: l,
						impact: i,
						treatment,
						residualLikelihood: rl,
						residualImpact: ri,
						ownerUserId: owner || null,
						assigneeUserId: assignee || null,
						reviewAt: reviewAt || null,
						description: description || null,
						controlCodes: ctrls,
						assetIds: assets,
					});
					if (!res.ok) toast.error(tc("error"));
					else {
						toast.success(t("saved"));
						router.refresh();
					}
				});
			}}
		>
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label>{t("likelihood")}</Label>
					<ScaleSelect value={l} onChange={setL} labels={scales.likelihood} />
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>{t("impact")}</Label>
					<ScaleSelect value={i} onChange={setI} labels={scales.impact} />
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>{t("treatment")}</Label>
					<Select
						value={treatment}
						onValueChange={(v) => setTreatment(v as typeof treatment)}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(["mitigate", "accept", "transfer", "avoid"] as const).map(
								(x) => (
									<SelectItem key={x} value={x}>
										{t(`treatment_${x}`)}
									</SelectItem>
								),
							)}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="risk-review">{t("reviewAt")}</Label>
					<Input
						id="risk-review"
						type="date"
						value={reviewAt}
						onChange={(e) => setReviewAt(e.target.value)}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>{t("residualLikelihood")}</Label>
					<Select
						value={rl === null ? "none" : String(rl)}
						onValueChange={(v) => setRl(v === "none" ? null : Number(v))}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">—</SelectItem>
							{SCALE.map((n) => (
								<SelectItem key={n} value={String(n)}>
									{n} · {scales.likelihood[n - 1]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>{t("residualImpact")}</Label>
					<Select
						value={ri === null ? "none" : String(ri)}
						onValueChange={(v) => setRi(v === "none" ? null : Number(v))}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">—</SelectItem>
							{SCALE.map((n) => (
								<SelectItem key={n} value={String(n)}>
									{n} · {scales.impact[n - 1]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>{te("owner")}</Label>
					<Select
						value={owner || "none"}
						onValueChange={(v) => setOwner(v === "none" ? "" : v)}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">—</SelectItem>
							{members.map((m) => (
								<SelectItem key={m.userId} value={m.userId}>
									{m.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>{te("assignee")}</Label>
					<Select
						value={assignee || "none"}
						onValueChange={(v) => setAssignee(v === "none" ? "" : v)}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">—</SelectItem>
							{members.map((m) => (
								<SelectItem key={m.userId} value={m.userId}>
									{m.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="risk-desc">
					{te("title")}: {t("titleField")} / Beschreibung
				</Label>
				<Textarea
					id="risk-desc"
					rows={3}
					value={description}
					onChange={(e) => setDescription(e.target.value)}
				/>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<fieldset className="flex flex-col gap-1.5">
					<legend className="lv-eyebrow mb-1 text-[0.52rem] text-muted-foreground">
						{t("controls")}
					</legend>
					<div className="max-h-48 overflow-y-auto rounded-md border p-2">
						{controlOptions.map((c) => (
							<label
								key={c.code}
								className="flex items-center gap-2 py-0.5 text-xs"
							>
								<input
									type="checkbox"
									checked={ctrls.includes(c.code)}
									onChange={(e) =>
										setCtrls(
											e.target.checked
												? [...ctrls, c.code]
												: ctrls.filter((x) => x !== c.code),
										)
									}
								/>
								<span className="font-mono">{c.code}</span>
								<span className="truncate text-muted-foreground">
									{c.title}
								</span>
							</label>
						))}
					</div>
				</fieldset>
				<fieldset className="flex flex-col gap-1.5">
					<legend className="lv-eyebrow mb-1 text-[0.52rem] text-muted-foreground">
						{t("assets")}
					</legend>
					<div className="max-h-48 overflow-y-auto rounded-md border p-2">
						{assetOptions.length === 0 && (
							<p className="text-muted-foreground text-xs">—</p>
						)}
						{assetOptions.map((a) => (
							<label
								key={a.id}
								className="flex items-center gap-2 py-0.5 text-xs"
							>
								<input
									type="checkbox"
									checked={assets.includes(a.id)}
									onChange={(e) =>
										setAssets(
											e.target.checked
												? [...assets, a.id]
												: assets.filter((x) => x !== a.id),
										)
									}
								/>
								<span className="truncate">{a.name}</span>
							</label>
						))}
					</div>
				</fieldset>
			</div>
			<div className="flex justify-end">
				<Button type="submit" size="sm" disabled={pending}>
					{t("save")}
				</Button>
			</div>
		</form>
	);
}

export function TreatmentForm({
	riskId,
	members,
}: {
	riskId: string;
	members: MemberOption[];
}) {
	const t = useTranslations("Risks");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [title, setTitle] = useState("");
	const [owner, setOwner] = useState("");
	const [dueAt, setDueAt] = useState("");
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					<Plus />
					{t("addTreatment")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await createTreatment({
								riskId,
								title,
								ownerUserId: owner || null,
								dueAt: dueAt || null,
							});
							if (!res.ok) return void toast.error(tc("error"));
							toast.success(t("treatmentCreated"));
							setOpen(false);
							setTitle("");
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("addTreatment")}</DialogTitle>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="tr-title">{t("titleField")}</Label>
						<Input
							id="tr-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							required
							maxLength={200}
							autoFocus
						/>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<Label>{t("owner")}</Label>
							<Select
								value={owner || "me"}
								onValueChange={(v) => setOwner(v === "me" ? "" : v)}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="me">—</SelectItem>
									{members.map((m) => (
										<SelectItem key={m.userId} value={m.userId}>
											{m.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="tr-due">{t("reviewAt")}</Label>
							<Input
								id="tr-due"
								type="date"
								value={dueAt}
								onChange={(e) => setDueAt(e.target.value)}
							/>
						</div>
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

export function ExceptionForm({
	controlOptions,
}: {
	controlOptions: { code: string; title: string }[];
}) {
	const t = useTranslations("Risks");
	const ta = useTranslations("Approvals");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [title, setTitle] = useState("");
	const [controlCode, setControlCode] = useState("");
	const [justification, setJustification] = useState("");
	const [compensating, setCompensating] = useState("");
	const [validUntil, setValidUntil] = useState("");
	const [reason, setReason] = useState("");
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					<Plus />
					{t("newException")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await createException({
								title,
								controlCode: controlCode || undefined,
								justification,
								compensatingControls: compensating || undefined,
								validUntil,
								selfApprovalReason: reason || undefined,
							});
							if (!res.ok) {
								toast.error(
									res.error.startsWith("solo_") || res.error === "no_approver"
										? ta(`errors_${res.error}` as "errors_no_approver")
										: tc("error"),
								);
								return;
							}
							toast.success(t("exceptionCreated"));
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("newException")}</DialogTitle>
						<DialogDescription>{t("exceptionsLead")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ex-title">{t("titleField")}</Label>
						<Input
							id="ex-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							required
							maxLength={200}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label>Control</Label>
						<Select
							value={controlCode || "none"}
							onValueChange={(v) => setControlCode(v === "none" ? "" : v)}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">—</SelectItem>
								{controlOptions.map((c) => (
									<SelectItem key={c.code} value={c.code}>
										{c.code} · {c.title}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ex-just">{t("justification")}</Label>
						<Textarea
							id="ex-just"
							rows={3}
							value={justification}
							onChange={(e) => setJustification(e.target.value)}
							required
							minLength={10}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ex-comp">{t("compensating")}</Label>
						<Textarea
							id="ex-comp"
							rows={2}
							value={compensating}
							onChange={(e) => setCompensating(e.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ex-until">{t("validUntil")}</Label>
						<Input
							id="ex-until"
							type="date"
							required
							value={validUntil}
							onChange={(e) => setValidUntil(e.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ex-reason">{ta("selfApprovalReason")}</Label>
						<Input
							id="ex-reason"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder={ta("soloHint")}
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button
							type="submit"
							disabled={
								pending ||
								!title.trim() ||
								justification.trim().length < 10 ||
								!validUntil
							}
						>
							{tc("create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function LossEventForm() {
	const t = useTranslations("Risks");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [occurredAt, setOccurredAt] = useState("");
	const [amount, setAmount] = useState("");
	const [recovery, setRecovery] = useState("");
	const [category, setCategory] = useState("");
	const [cause, setCause] = useState("");
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					<Plus />
					{t("newLossEvent")}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await createLossEvent({
								occurredAt,
								amount: amount ? Number(amount) : undefined,
								recovery: recovery ? Number(recovery) : undefined,
								category,
								cause: cause || undefined,
							});
							if (!res.ok) return void toast.error(tc("error"));
							toast.success(t("lossEventCreated"));
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("newLossEvent")}</DialogTitle>
						<DialogDescription>{t("lossEventsLead")}</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="le-date">{t("occurredAt")}</Label>
							<Input
								id="le-date"
								type="date"
								required
								value={occurredAt}
								onChange={(e) => setOccurredAt(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="le-cat">{t("category")}</Label>
							<Input
								id="le-cat"
								required
								value={category}
								onChange={(e) => setCategory(e.target.value)}
								maxLength={200}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="le-amount">{t("amount")} (EUR)</Label>
							<Input
								id="le-amount"
								type="number"
								min={0}
								step="0.01"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="le-rec">{t("recovery")} (EUR)</Label>
							<Input
								id="le-rec"
								type="number"
								min={0}
								step="0.01"
								value={recovery}
								onChange={(e) => setRecovery(e.target.value)}
							/>
						</div>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="le-cause">{t("cause")}</Label>
						<Textarea
							id="le-cause"
							rows={2}
							value={cause}
							onChange={(e) => setCause(e.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button
							type="submit"
							disabled={pending || !occurredAt || !category.trim()}
						>
							{tc("create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
