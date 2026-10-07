"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { requestOwnFundsApproval, upsertOwnFunds } from "@/app/actions/casp";
import {
	EditTrigger,
	Field,
	FormDialog,
	NewTrigger,
} from "@/components/organisation/governance-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	calculateOwnFunds,
	type MicarClass,
	type ZagMethod,
	type ZagPaymentServiceKind,
} from "@/lib/compliance/own-funds";

export type OwnFundsDraft = {
	id?: string;
	periodLabel: string;
	micarClass: MicarClass | null;
	fixedOverheadsPrevYear: string;
	zagMethod: ZagMethod | null;
	zagServiceKind: ZagPaymentServiceKind;
	monthlyPaymentVolume: string;
	relevantIndicator: string;
	availableOwnFunds: string;
	liquidityBuffer: string;
	riskAmounts: { category: string; amount: string }[];
};

const n = (v: string): number | null =>
	v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v);
const fmt = new Intl.NumberFormat("de-DE", {
	style: "currency",
	currency: "EUR",
	maximumFractionDigits: 0,
});

const RISK_CATEGORIES = [
	"operational",
	"credit",
	"market",
	"liquidity",
	"compliance",
	"other",
] as const;

export function OwnFundsForm({ initial }: { initial?: OwnFundsDraft }) {
	const t = useTranslations("OwnFunds");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<OwnFundsDraft>(
		initial ?? {
			periodLabel: `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`,
			micarClass: 2,
			fixedOverheadsPrevYear: "",
			zagMethod: "B",
			zagServiceKind: "money_remittance_only",
			monthlyPaymentVolume: "",
			relevantIndicator: "",
			availableOwnFunds: "",
			liquidityBuffer: "",
			riskAmounts: [],
		},
	);
	const preview = calculateOwnFunds({
		micar: d.micarClass
			? {
					micarClass: d.micarClass,
					fixedOverheadsPrevYear: n(d.fixedOverheadsPrevYear) ?? 0,
				}
			: null,
		zag: d.zagMethod
			? {
					method: d.zagMethod,
					serviceKind: d.zagServiceKind,
					fixedOverheadsPrevYear: n(d.fixedOverheadsPrevYear) ?? undefined,
					monthlyPaymentVolume: n(d.monthlyPaymentVolume) ?? undefined,
					relevantIndicator: n(d.relevantIndicator) ?? undefined,
				}
			: null,
		availableOwnFunds: n(d.availableOwnFunds),
	});
	return (
		<FormDialog
			title={initial ? t("editRun") : t("newRun")}
			lead={t("formLead")}
			trigger={initial ? <EditTrigger /> : <NewTrigger label={t("newRun")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			wide
			onSubmit={() =>
				start(async () => {
					const res = await upsertOwnFunds({
						id: d.id,
						periodLabel: d.periodLabel,
						micarClass: d.micarClass,
						fixedOverheadsPrevYear: n(d.fixedOverheadsPrevYear),
						zagMethod: d.zagMethod,
						zagServiceKind: d.zagServiceKind,
						monthlyPaymentVolume: n(d.monthlyPaymentVolume),
						relevantIndicator: n(d.relevantIndicator),
						availableOwnFunds: n(d.availableOwnFunds),
						liquidityBuffer: n(d.liquidityBuffer),
						riskAmounts: d.riskAmounts
							.filter((r) => r.category && n(r.amount) !== null)
							.map((r) => ({ category: r.category, amount: n(r.amount) ?? 0 })),
					});
					if (!res.ok)
						return void toast.error(
							res.error === "duplicate"
								? t("duplicatePeriod")
								: res.error === "notDraft"
									? t("notDraft")
									: tc("error"),
						);
					toast.success(
						t("saved", { total: fmt.format(res.data.totalRequired) }),
					);
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid gap-4 sm:grid-cols-3">
				<Field
					id="of-period"
					label={t("period")}
					value={d.periodLabel}
					onChange={(v) => setD({ ...d, periodLabel: v })}
					required
				/>
				<div className="flex flex-col gap-1.5">
					<Label>{t("micarClass")}</Label>
					<Select
						value={d.micarClass ? String(d.micarClass) : "none"}
						onValueChange={(v) =>
							setD({
								...d,
								micarClass: v === "none" ? null : (Number(v) as MicarClass),
							})
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">—</SelectItem>
							<SelectItem value="1">{t("class1")}</SelectItem>
							<SelectItem value="2">{t("class2")}</SelectItem>
							<SelectItem value="3">{t("class3")}</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<Field
					id="of-overheads"
					label={t("fixedOverheads")}
					type="number"
					value={d.fixedOverheadsPrevYear}
					onChange={(v) => setD({ ...d, fixedOverheadsPrevYear: v })}
				/>
				<div className="flex flex-col gap-1.5">
					<Label>{t("zagMethod")}</Label>
					<Select
						value={d.zagMethod ?? "none"}
						onValueChange={(v) =>
							setD({ ...d, zagMethod: v === "none" ? null : (v as ZagMethod) })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">—</SelectItem>
							<SelectItem value="A">{t("methodA")}</SelectItem>
							<SelectItem value="B">{t("methodB")}</SelectItem>
							<SelectItem value="C">{t("methodC")}</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>{t("serviceKind")}</Label>
					<Select
						value={d.zagServiceKind}
						onValueChange={(v) =>
							setD({ ...d, zagServiceKind: v as ZagPaymentServiceKind })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="money_remittance_only">
								{t("kind_remittance")}
							</SelectItem>
							<SelectItem value="payment_initiation_only">
								{t("kind_pis")}
							</SelectItem>
							<SelectItem value="other">{t("kind_other")}</SelectItem>
						</SelectContent>
					</Select>
				</div>
				{d.zagMethod === "B" && (
					<Field
						id="of-pv"
						label={t("monthlyVolume")}
						type="number"
						value={d.monthlyPaymentVolume}
						onChange={(v) => setD({ ...d, monthlyPaymentVolume: v })}
					/>
				)}
				{d.zagMethod === "C" && (
					<Field
						id="of-ri"
						label={t("relevantIndicator")}
						type="number"
						value={d.relevantIndicator}
						onChange={(v) => setD({ ...d, relevantIndicator: v })}
					/>
				)}
				<Field
					id="of-available"
					label={t("available")}
					type="number"
					value={d.availableOwnFunds}
					onChange={(v) => setD({ ...d, availableOwnFunds: v })}
				/>
				<Field
					id="of-liq"
					label={t("liquidityBuffer")}
					type="number"
					value={d.liquidityBuffer}
					onChange={(v) => setD({ ...d, liquidityBuffer: v })}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<Label>{t("riskAmounts")}</Label>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() =>
							setD({
								...d,
								riskAmounts: [
									...d.riskAmounts,
									{ category: "operational", amount: "" },
								],
							})
						}
					>
						<Plus />
						{t("addRisk")}
					</Button>
				</div>
				{d.riskAmounts.map((r, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: editierbare Liste ohne stabile ID
					<div key={i} className="flex items-center gap-2">
						<Select
							value={r.category}
							onValueChange={(v) =>
								setD({
									...d,
									riskAmounts: d.riskAmounts.map((x, j) =>
										j === i ? { ...x, category: v } : x,
									),
								})
							}
						>
							<SelectTrigger className="w-48">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{RISK_CATEGORIES.map((c) => (
									<SelectItem key={c} value={c}>
										{t(`rc_${c}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Input
							type="number"
							className="w-40"
							placeholder="€"
							value={r.amount}
							onChange={(e) =>
								setD({
									...d,
									riskAmounts: d.riskAmounts.map((x, j) =>
										j === i ? { ...x, amount: e.target.value } : x,
									),
								})
							}
						/>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							aria-label={tc("delete")}
							onClick={() =>
								setD({
									...d,
									riskAmounts: d.riskAmounts.filter((_, j) => j !== i),
								})
							}
						>
							<Trash2 />
						</Button>
					</div>
				))}
			</div>
			<dl className="grid grid-cols-2 gap-2 rounded-md border border-dashed p-3 text-sm sm:grid-cols-4">
				<dt className="text-muted-foreground">{t("micarRequired")}</dt>
				<dd className="font-medium">
					{fmt.format(preview.micar?.required ?? 0)}
				</dd>
				<dt className="text-muted-foreground">{t("zagRequired")}</dt>
				<dd className="font-medium">
					{fmt.format(preview.zag?.required ?? 0)}
				</dd>
				<dt className="text-muted-foreground">{t("totalRequired")}</dt>
				<dd className="font-serif-display text-lg text-primary">
					{fmt.format(preview.totalRequired)}
				</dd>
				<dt className="text-muted-foreground">{t("buffer")}</dt>
				<dd
					className={
						preview.buffer !== null && preview.buffer < 0
							? "font-medium text-destructive"
							: "font-medium"
					}
				>
					{preview.buffer === null ? "—" : fmt.format(preview.buffer)}
				</dd>
			</dl>
		</FormDialog>
	);
}

export function OwnFundsApproveButton({
	id,
	soloHint,
}: {
	id: string;
	soloHint?: boolean;
}) {
	const t = useTranslations("OwnFunds");
	const ts = useTranslations("Status");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [reason, setReason] = useState("");
	return (
		<div className="flex flex-wrap items-center gap-2">
			{soloHint && (
				<Input
					className="h-8 w-64"
					placeholder={t("soloReason")}
					value={reason}
					onChange={(e) => setReason(e.target.value)}
				/>
			)}
			<Button
				size="sm"
				disabled={pending}
				onClick={() =>
					start(async () => {
						const res = await requestOwnFundsApproval({
							id,
							selfApprovalReason: reason || undefined,
						});
						if (!res.ok)
							return void toast.error(
								res.error.startsWith("solo_") ||
									res.error === "no_approver" ||
									res.error === "workflow_disabled"
									? ts(
											`approvalError_${res.error}` as "approvalError_no_approver",
										)
									: res.error === "notDraft"
										? t("notDraft")
										: tc("error"),
							);
						toast.success(
							res.data.status === "approved"
								? t("approved")
								: ts("approvalRequested"),
						);
						router.refresh();
					})
				}
			>
				{t("requestApproval")}
			</Button>
		</div>
	);
}
