"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { upsertProvider } from "@/app/actions/registers";
import { useGateFeedback } from "@/components/approvals/use-gate-feedback";
import type { MemberOption } from "@/components/entity/owner-assignee";
import { ResponsibleSelect } from "@/components/entity/responsible-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
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
import { PROVIDER_CATEGORIES, PROVIDER_STATUSES } from "@/db/schema/registers";

const PARTNER = [
	"ict",
	"outsourcing",
	"licence_partner",
	"bank",
	"issuer",
	"exchange",
	"custodian",
	"distribution",
] as const;
const SERVICE = [
	"cloud_iaas",
	"cloud_paas",
	"cloud_saas",
	"hosting",
	"network",
	"software",
	"security",
	"payment",
	"data",
	"other",
] as const;
const CRIT = ["critical", "important", "standard"] as const;
const CATEGORY = PROVIDER_CATEGORIES;
const STATUS = PROVIDER_STATUSES;

export type ProviderDraft = {
	providerId?: string;
	name: string;
	partnerType: (typeof PARTNER)[number];
	serviceType?: (typeof SERVICE)[number] | null;
	serviceDescription?: string | null;
	category?: (typeof CATEGORY)[number] | null;
	status?: (typeof STATUS)[number];
	criticality: (typeof CRIT)[number];
	isIct: boolean;
	isOutsourcing: boolean;
	isMaterial: boolean;
	country?: string | null;
	processesPersonalData: boolean;
	contractRef?: string | null;
	contractStart?: string | null;
	contractEnd?: string | null;
	dataLocations?: string[] | null;
	noticePeriodDays?: number | null;
	ownerUserId?: string | null;
	notes?: string | null;
};

export function ProviderForm({
	initial,
	members,
	trigger,
	triggerLabel,
}: {
	initial?: ProviderDraft;
	members: MemberOption[];
	trigger?: "button" | "link";
	// Beschriftung des Link-Triggers (z. B. „Als Dienstleister anlegen")
	triggerLabel?: string;
}) {
	const isEdit = Boolean(initial?.providerId);
	const t = useTranslations("Providers");
	const tc = useTranslations("Common");
	const gate = useGateFeedback();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<ProviderDraft>(
		initial ?? {
			name: "",
			partnerType: "ict",
			criticality: "standard",
			isIct: true,
			isOutsourcing: false,
			isMaterial: false,
			processesPersonalData: false,
		},
	);
	const set = <K extends keyof ProviderDraft>(k: K, v: ProviderDraft[K]) =>
		setD({ ...d, [k]: v });
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{trigger === "link" ? (
					<Button size="sm" variant="ghost" className="">
						{triggerLabel ?? tc("edit")}
					</Button>
				) : (
					<Button size="sm">
						<Plus />
						{t("new")}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await upsertProvider({
								...d,
								serviceType: d.serviceType ?? undefined,
								serviceDescription: d.serviceDescription ?? undefined,
								country: d.country
									? d.country.toUpperCase().slice(0, 2)
									: undefined,
								contractRef: d.contractRef ?? undefined,
								category: d.category ?? null,
								status: d.status ?? "active",
								contractStart: d.contractStart || null,
								contractEnd: d.contractEnd || null,
								dataLocations: (d.dataLocations ?? [])
									.map((x) => x.trim())
									.filter(Boolean),
								noticePeriodDays: d.noticePeriodDays ?? null,
								ownerUserId: d.ownerUserId ?? null,
								notes: d.notes ?? undefined,
							});
							if (!res.ok)
								return void toast.error(
									res.error === "statusLocked"
										? t("statusLocked")
										: (gate.errorText(res.error) ?? errorText(tc, res)),
								);
							if (res.data.approvalPending) toast.info(gate.pendingText());
							else toast.success(isEdit ? t("saved") : t("created"));
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{isEdit ? tc("edit") : t("new")}</DialogTitle>
						<DialogDescription>{t("lead")}</DialogDescription>
					</DialogHeader>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5 sm:col-span-2">
							<Label htmlFor="pv-name">{t("name")}</Label>
							<Input
								id="pv-name"
								value={d.name}
								onChange={(e) => set("name", e.target.value)}
								required
								maxLength={200}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("partnerType")}</Label>
							<Select
								value={d.partnerType}
								onValueChange={(v) =>
									set("partnerType", v as ProviderDraft["partnerType"])
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PARTNER.map((x) => (
										<SelectItem key={x} value={x}>
											{t(`partner_${x}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("category")}</Label>
							<Select
								value={d.category ?? "none"}
								onValueChange={(v) =>
									set(
										"category",
										v === "none" ? null : (v as ProviderDraft["category"]),
									)
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">—</SelectItem>
									{CATEGORY.map((x) => (
										<SelectItem key={x} value={x}>
											{t(`category_${x}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("status")}</Label>
							<Select
								value={d.status ?? "active"}
								onValueChange={(v) =>
									set("status", v as ProviderDraft["status"])
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{STATUS.map((x) => (
										<SelectItem key={x} value={x}>
											{t(`status_${x}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("serviceType")}</Label>
							<Select
								value={d.serviceType ?? "none"}
								onValueChange={(v) =>
									set(
										"serviceType",
										v === "none" ? null : (v as ProviderDraft["serviceType"]),
									)
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">—</SelectItem>
									{SERVICE.map((x) => (
										<SelectItem key={x} value={x}>
											{t(`service_${x}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("criticality")}</Label>
							<Select
								value={d.criticality}
								onValueChange={(v) =>
									set("criticality", v as ProviderDraft["criticality"])
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CRIT.map((x) => (
										<SelectItem key={x} value={x}>
											{t(`crit_${x}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pv-country">{t("country")} (ISO-2)</Label>
							<Input
								id="pv-country"
								value={d.country ?? ""}
								onChange={(e) => set("country", e.target.value)}
								maxLength={2}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pv-locs">{t("dataLocations")}</Label>
							<Input
								id="pv-locs"
								value={(d.dataLocations ?? []).join(", ")}
								placeholder="DE, IE"
								onChange={(e) =>
									set(
										"dataLocations",
										e.target.value.split(",").map((x) => x.trimStart()),
									)
								}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pv-contract">{t("contract")}</Label>
							<Input
								id="pv-contract"
								value={d.contractRef ?? ""}
								onChange={(e) => set("contractRef", e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pv-start">{t("contractStart")}</Label>
							<Input
								id="pv-start"
								type="date"
								value={d.contractStart ?? ""}
								onChange={(e) => set("contractStart", e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pv-end">{t("contractEnd")}</Label>
							<Input
								id="pv-end"
								type="date"
								value={d.contractEnd ?? ""}
								onChange={(e) => set("contractEnd", e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="pv-notice">{t("noticePeriod")}</Label>
							<Input
								id="pv-notice"
								type="number"
								min={0}
								value={d.noticePeriodDays ?? ""}
								onChange={(e) =>
									set(
										"noticePeriodDays",
										e.target.value === "" ? null : Number(e.target.value),
									)
								}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("owner")}</Label>
							<ResponsibleSelect
								value={d.ownerUserId}
								onChange={(v) => set("ownerUserId", v)}
								members={members}
								aria-label={t("owner")}
							/>
						</div>
					</div>
					<div className="flex flex-wrap gap-5 text-subhead">
						<label className="flex items-center gap-2">
							<Checkbox
								checked={d.isIct}
								onCheckedChange={(v) => set("isIct", Boolean(v))}
							/>
							{t("isIct")}
						</label>
						<label className="flex items-center gap-2">
							<Checkbox
								checked={d.isOutsourcing}
								onCheckedChange={(v) => set("isOutsourcing", Boolean(v))}
							/>
							{t("isOutsourcing")}
						</label>
						<label className="flex items-center gap-2">
							<Checkbox
								checked={d.isMaterial}
								onCheckedChange={(v) => set("isMaterial", Boolean(v))}
							/>
							{t("isMaterial")}
						</label>
						<label className="flex items-center gap-2">
							<Checkbox
								checked={d.processesPersonalData}
								onCheckedChange={(v) =>
									set("processesPersonalData", Boolean(v))
								}
							/>
							{t("processesPersonalData")}
						</label>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="pv-desc">{t("description")}</Label>
						<Textarea
							id="pv-desc"
							rows={2}
							value={d.serviceDescription ?? ""}
							onChange={(e) => set("serviceDescription", e.target.value)}
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
						<Button type="submit" disabled={pending || !d.name.trim()}>
							{tc("save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
