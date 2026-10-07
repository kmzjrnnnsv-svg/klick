"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	addIncidentUpdate,
	classifyIncident,
	createIncident,
	markIncidentReported,
} from "@/app/actions/incidents";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { IncidentRegime } from "@/db/schema/enums";

function nowLocal(): string {
	const d = new Date();
	d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
	return d.toISOString().slice(0, 16);
}

// Drei Felder: Was · Wann bemerkt (Default jetzt) · Betrifft Zahlungen/Kunden.
export function IncidentCreateForm({ regimes }: { regimes: IncidentRegime[] }) {
	const t = useTranslations("Incidents");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [title, setTitle] = useState("");
	const [awareAt, setAwareAt] = useState(nowLocal());
	const [payments, setPayments] = useState(false);
	const [customers, setCustomers] = useState(false);
	const [description, setDescription] = useState("");
	return (
		<form
			className="flex max-w-xl flex-col gap-5"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					const res = await createIncident({
						title,
						awareAt: new Date(awareAt),
						affectsPayments: payments,
						affectsCustomers: customers,
						description: description || undefined,
						regimes: regimes.length > 0 ? regimes : ["dora"],
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("created"));
					router.push(`/vorfaelle/${res.data.id}`);
				});
			}}
		>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="inc-title">{t("what")}</Label>
				<Input
					id="inc-title"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					required
					maxLength={200}
					autoFocus
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="inc-aware">{t("awareAt")}</Label>
				<Input
					id="inc-aware"
					type="datetime-local"
					value={awareAt}
					onChange={(e) => setAwareAt(e.target.value)}
					required
				/>
			</div>
			<div className="flex flex-wrap gap-6">
				<label className="flex items-center gap-2 text-sm">
					<Checkbox
						checked={payments}
						onCheckedChange={(v) => setPayments(Boolean(v))}
					/>
					{t("affectsPayments")}
				</label>
				<label className="flex items-center gap-2 text-sm">
					<Checkbox
						checked={customers}
						onCheckedChange={(v) => setCustomers(Boolean(v))}
					/>
					{t("affectsCustomers")}
				</label>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="inc-desc">
					{t("description")} ({tc("optional")})
				</Label>
				<Textarea
					id="inc-desc"
					rows={3}
					value={description}
					onChange={(e) => setDescription(e.target.value)}
				/>
			</div>
			<div className="flex justify-end">
				<Button
					type="submit"
					variant="brown"
					disabled={pending || !title.trim()}
				>
					{t("report")}
				</Button>
			</div>
		</form>
	);
}

const DORA_BOOL = [
	"criticalServicesAffected",
	"maliciousAccess",
	"geographicSpread",
	"dataLoss",
	"reputationalImpact",
] as const;
const DORA_NUM = [
	"clientsAffectedPct",
	"durationHours",
	"downtimeHours",
	"economicImpactEur",
] as const;
const NIS2_BOOL = [
	"severeOperationalDisruption",
	"financialLoss",
	"affectsOthers",
] as const;

export function ClassifyForm({
	incidentId,
	regimes,
	affectsPayments,
	initialDora,
	initialNis2,
}: {
	incidentId: string;
	regimes: IncidentRegime[];
	affectsPayments: boolean;
	initialDora: Record<string, unknown> | null;
	initialNis2: Record<string, unknown> | null;
}) {
	const t = useTranslations("Incidents");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [regs, setRegs] = useState<IncidentRegime[]>(regimes);
	const [dora, setDora] = useState<
		Record<string, boolean | number | undefined>
	>((initialDora as Record<string, boolean | number>) ?? {});
	const [nis2, setNis2] = useState<Record<string, boolean | undefined>>(
		(initialNis2 as Record<string, boolean>) ?? {},
	);
	const [override, setOverride] = useState<
		"" | "major" | "significant" | "minor"
	>("");
	const [overrideNote, setOverrideNote] = useState("");
	return (
		<form
			className="flex flex-col gap-4 text-sm"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					const res = await classifyIncident({
						incidentId,
						regimes: regs,
						affectsPayments,
						doraCriteria: regs.includes("dora") ? dora : undefined,
						nis2Criteria: regs.includes("nis2") ? nis2 : undefined,
						classificationOverride: override || undefined,
						classificationOverrideNote: overrideNote || undefined,
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(
						`${t("classified")} ${t(`class_${res.data.classification as "major"}`)}`,
					);
					router.refresh();
				});
			}}
		>
			<p className="text-muted-foreground">{t("classifyLead")}</p>
			<div className="flex flex-wrap gap-4">
				{(["dora", "nis2", "dsgvo", "gwg_sar"] as const).map((r) => (
					<label key={r} className="flex items-center gap-2">
						<Checkbox
							checked={regs.includes(r)}
							onCheckedChange={(v) =>
								setRegs(v ? [...regs, r] : regs.filter((x) => x !== r))
							}
						/>
						{t(`regime_${r}`)}
					</label>
				))}
			</div>
			{regs.includes("dora") && (
				<fieldset className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
					<legend className="lv-eyebrow px-1 text-[0.52rem] text-muted-foreground">
						DORA · RTS 2024/1772
					</legend>
					{DORA_BOOL.map((k) => (
						<label key={k} className="flex items-center gap-2">
							<Checkbox
								checked={Boolean(dora[k])}
								onCheckedChange={(v) => setDora({ ...dora, [k]: Boolean(v) })}
							/>
							{t(`crit_${k}`)}
						</label>
					))}
					{DORA_NUM.map((k) => (
						<div key={k} className="flex flex-col gap-1">
							<Label htmlFor={`d-${k}`} className="normal-case tracking-normal">
								{t(`crit_${k}`)}
							</Label>
							<Input
								id={`d-${k}`}
								type="number"
								min={0}
								value={dora[k] === undefined ? "" : String(dora[k])}
								onChange={(e) =>
									setDora({
										...dora,
										[k]:
											e.target.value === ""
												? undefined
												: Number(e.target.value),
									})
								}
							/>
						</div>
					))}
				</fieldset>
			)}
			{regs.includes("nis2") && (
				<fieldset className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
					<legend className="lv-eyebrow px-1 text-[0.52rem] text-muted-foreground">
						NIS2 · Art. 23(3)
					</legend>
					{NIS2_BOOL.map((k) => (
						<label key={k} className="flex items-center gap-2">
							<Checkbox
								checked={Boolean(nis2[k])}
								onCheckedChange={(v) => setNis2({ ...nis2, [k]: Boolean(v) })}
							/>
							{t(`crit_${k}`)}
						</label>
					))}
				</fieldset>
			)}
			<div className="grid gap-3 sm:grid-cols-2">
				<div className="flex flex-col gap-1">
					<Label>{t("override")}</Label>
					<Select
						value={override || "none"}
						onValueChange={(v) =>
							setOverride(v === "none" ? "" : (v as typeof override))
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">—</SelectItem>
							{(["major", "significant", "minor"] as const).map((c) => (
								<SelectItem key={c} value={c}>
									{t(`class_${c}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				{override && (
					<div className="flex flex-col gap-1">
						<Label htmlFor="ov-note">{t("overrideNote")}</Label>
						<Input
							id="ov-note"
							value={overrideNote}
							onChange={(e) => setOverrideNote(e.target.value)}
							required
						/>
					</div>
				)}
			</div>
			<div className="flex justify-end">
				<Button type="submit" size="sm" disabled={pending || regs.length === 0}>
					{t("classify")}
				</Button>
			</div>
		</form>
	);
}

export function ReportButton({
	incidentId,
	report,
	label,
}: {
	incidentId: string;
	report: "initial" | "intermediate" | "final";
	label: string;
}) {
	const t = useTranslations("Incidents");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			size="sm"
			variant="outline"
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await markIncidentReported({ incidentId, report });
					if (!res.ok) toast.error(tc("error"));
					else {
						toast.success(t("reported"));
						router.refresh();
					}
				})
			}
		>
			{label}
		</Button>
	);
}

export function IncidentUpdateForm({
	incidentId,
	rootCause,
}: {
	incidentId: string;
	rootCause: string | null;
}) {
	const t = useTranslations("Incidents");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [body, setBody] = useState("");
	const [cause, setCause] = useState(rootCause ?? "");
	return (
		<form
			className="flex flex-col gap-2 text-sm"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					const res = await addIncidentUpdate({
						incidentId,
						body,
						rootCause: cause !== (rootCause ?? "") ? cause : undefined,
					});
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("updateAdded"));
					setBody("");
					router.refresh();
				});
			}}
		>
			<Label htmlFor="inc-update">{t("addUpdate")}</Label>
			<Textarea
				id="inc-update"
				rows={3}
				value={body}
				onChange={(e) => setBody(e.target.value)}
			/>
			<Label htmlFor="inc-cause">{t("rootCause")}</Label>
			<Textarea
				id="inc-cause"
				rows={2}
				value={cause}
				onChange={(e) => setCause(e.target.value)}
			/>
			<div className="flex justify-end">
				<Button
					type="submit"
					size="sm"
					disabled={pending || (!body.trim() && cause === (rootCause ?? ""))}
				>
					{tc("save")}
				</Button>
			</div>
		</form>
	);
}
