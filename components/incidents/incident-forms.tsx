"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	addIncidentUpdate,
	classifyIncident,
	createIncident,
	markIncidentReported,
	markMitigationAvailable,
} from "@/app/actions/incidents";
import { useGateFeedback } from "@/components/approvals/use-gate-feedback";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorText } from "@/components/ui/error-text";
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
import { toast } from "@/components/ui/toast";
import type { IncidentRegime } from "@/db/schema/enums";

function nowLocal(): string {
	const d = new Date();
	d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
	return d.toISOString().slice(0, 16);
}

type ProductOption = { id: string; code: string; name: string };

// Drei Felder: Was · Wann bemerkt (Default jetzt) · Betrifft Zahlungen/Kunden.
// Mit CRA zusätzlich: betroffenes Produkt und Art der Meldung (Art. 14).
export function IncidentCreateForm({
	regimes,
	products = [],
}: {
	regimes: IncidentRegime[];
	products?: ProductOption[];
}) {
	const t = useTranslations("Incidents");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [title, setTitle] = useState("");
	const [awareAt, setAwareAt] = useState(nowLocal());
	const [payments, setPayments] = useState(false);
	const [customers, setCustomers] = useState(false);
	const [description, setDescription] = useState("");
	const [productId, setProductId] = useState("");
	const [craKind, setCraKind] = useState<"" | "cra_vuln" | "cra_incident">("");
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
						// CRA-Meldung: die Produkt-Uhr führt (DORA/DSGVO kommen über
						// Zahlungen/Kunden oder die Einstufung dazu); sonst die Regime der
						// Rahmenwerke, ohne beides die DORA-Uhr als Default.
						regimes: craKind
							? [craKind]
							: regimes.length > 0
								? regimes
								: ["dora"],
						productId: productId || null,
					});
					if (!res.ok) return void toast.error(errorText(tc, res));
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
				<label className="flex items-center gap-2 text-subhead">
					<Checkbox
						checked={payments}
						onCheckedChange={(v) => setPayments(Boolean(v))}
					/>
					{t("affectsPayments")}
				</label>
				<label className="flex items-center gap-2 text-subhead">
					<Checkbox
						checked={customers}
						onCheckedChange={(v) => setCustomers(Boolean(v))}
					/>
					{t("affectsCustomers")}
				</label>
			</div>
			{products.length > 0 && (
				<fieldset className="grid grid-cols-1 gap-3 rounded-2xl bg-card p-3 sm:grid-cols-2">
					<legend className="px-1 text-muted-foreground text-footnote">
						{t("craLegend")}
					</legend>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="inc-product">{t("product")}</Label>
						<Select
							value={productId || "none"}
							onValueChange={(v) => setProductId(v === "none" ? "" : v)}
						>
							<SelectTrigger id="inc-product" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">—</SelectItem>
								{products.map((p) => (
									<SelectItem key={p.id} value={p.id}>
										{p.code} {p.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="inc-cra">{t("craKind")}</Label>
						<Select
							value={craKind || "none"}
							onValueChange={(v) =>
								setCraKind(v === "none" ? "" : (v as typeof craKind))
							}
						>
							<SelectTrigger id="inc-cra" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">{t("craNone")}</SelectItem>
								<SelectItem value="cra_vuln">{t("regime_cra_vuln")}</SelectItem>
								<SelectItem value="cra_incident">
									{t("regime_cra_incident")}
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</fieldset>
			)}
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
				<Button type="submit" disabled={pending || !title.trim()}>
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

const CRA_BOOL = [
	"activelyExploited",
	"affectsAvailabilityOrIntegrity",
	"maliciousCode",
] as const;

export function ClassifyForm({
	incidentId,
	regimes,
	available,
	affectsPayments,
	initialDora,
	initialNis2,
	initialCra,
	productId: initialProductId,
	products = [],
}: {
	incidentId: string;
	regimes: IncidentRegime[];
	// wählbare Regime (aus den aktiven Rahmenwerken, plus die schon gesetzten)
	available: IncidentRegime[];
	affectsPayments: boolean;
	initialDora: Record<string, unknown> | null;
	initialNis2: Record<string, unknown> | null;
	initialCra?: Record<string, unknown> | null;
	productId?: string | null;
	products?: ProductOption[];
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
	const [cra, setCra] = useState<Record<string, boolean | undefined>>(
		(initialCra as Record<string, boolean>) ?? {},
	);
	const [productId, setProductId] = useState(initialProductId ?? "");
	const hasCra = regs.includes("cra_vuln") || regs.includes("cra_incident");
	const [override, setOverride] = useState<
		"" | "major" | "significant" | "minor"
	>("");
	const [overrideNote, setOverrideNote] = useState("");
	return (
		<form
			className="flex flex-col gap-4 text-subhead"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					const res = await classifyIncident({
						incidentId,
						regimes: regs,
						affectsPayments,
						doraCriteria: regs.includes("dora") ? dora : undefined,
						nis2Criteria: regs.includes("nis2") ? nis2 : undefined,
						craCriteria: hasCra ? cra : undefined,
						productId: products.length > 0 ? productId || null : undefined,
						classificationOverride: override || undefined,
						classificationOverrideNote: overrideNote || undefined,
					});
					if (!res.ok) return void toast.error(errorText(tc, res));
					toast.success(
						`${t("classified")} ${t(`class_${res.data.classification as "major"}`)}`,
					);
					router.refresh();
				});
			}}
		>
			<p className="text-muted-foreground">{t("classifyLead")}</p>
			<div className="flex flex-wrap gap-4">
				{available.map((r) => (
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
				<fieldset className="grid grid-cols-1 gap-3 rounded-2xl bg-card p-3 sm:grid-cols-2">
					<legend className="font-medium text-footnote px-1 text-footnote text-muted-foreground">
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
							<Label htmlFor={`d-${k}`} className="">
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
				<fieldset className="grid grid-cols-1 gap-3 rounded-2xl bg-card p-3 sm:grid-cols-3">
					<legend className="font-medium text-footnote px-1 text-footnote text-muted-foreground">
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
			{hasCra && (
				<fieldset className="grid grid-cols-1 gap-3 rounded-2xl bg-card p-3 sm:grid-cols-2">
					<legend className="font-medium text-footnote px-1 text-footnote text-muted-foreground">
						CRA · Art. 14
					</legend>
					{CRA_BOOL.map((k) => (
						<label key={k} className="flex items-center gap-2">
							<Checkbox
								checked={Boolean(cra[k])}
								onCheckedChange={(v) => setCra({ ...cra, [k]: Boolean(v) })}
							/>
							{t(`crit_${k}`)}
						</label>
					))}
					{products.length > 0 && (
						<div className="flex flex-col gap-1">
							<Label htmlFor="cls-product">{t("product")}</Label>
							<Select
								value={productId || "none"}
								onValueChange={(v) => setProductId(v === "none" ? "" : v)}
							>
								<SelectTrigger id="cls-product" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">—</SelectItem>
									{products.map((p) => (
										<SelectItem key={p.id} value={p.id}>
											{p.code} {p.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
				</fieldset>
			)}
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
	const gate = useGateFeedback();
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
					if (!res.ok) {
						toast.error(
							res.error === "approval_pending"
								? t("reportApprovalPending")
								: (gate.errorText(res.error) ?? errorText(tc, res)),
						);
						return;
					}
					toast.success(
						res.data.approvalRequested
							? t("reportApprovalRequested")
							: t("reported"),
					);
					router.refresh();
				})
			}
		>
			{label}
		</Button>
	);
}

// CRA: Korrektur/Abhilfe verfügbar — startet die 14-Tage-Uhr des
// Abschlussberichts (aktiv ausgenutzte Schwachstelle).
export function MitigationButton({ incidentId }: { incidentId: string }) {
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
					const res = await markMitigationAvailable({ incidentId });
					if (!res.ok) toast.error(errorText(tc, res));
					else {
						toast.success(t("mitigationSaved"));
						router.refresh();
					}
				})
			}
		>
			{pending ? tc("working") : t("mitigationAvailable")}
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
			className="flex flex-col gap-2 text-subhead"
			onSubmit={(e) => {
				e.preventDefault();
				start(async () => {
					const res = await addIncidentUpdate({
						incidentId,
						body,
						rootCause: cause !== (rootCause ?? "") ? cause : undefined,
					});
					if (!res.ok) return void toast.error(errorText(tc, res));
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
