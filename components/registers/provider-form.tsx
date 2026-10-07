"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { upsertProvider } from "@/app/actions/registers";
import type { MemberOption } from "@/components/entity/owner-assignee";
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

export type ProviderDraft = {
	providerId?: string;
	name: string;
	partnerType: (typeof PARTNER)[number];
	serviceType?: (typeof SERVICE)[number] | null;
	serviceDescription?: string | null;
	criticality: (typeof CRIT)[number];
	isIct: boolean;
	isOutsourcing: boolean;
	isMaterial: boolean;
	country?: string | null;
	processesPersonalData: boolean;
	contractRef?: string | null;
	contractEnd?: string | null;
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
					<Button
						size="sm"
						variant="ghost"
						className="normal-case tracking-normal"
					>
						{triggerLabel ?? tc("edit")}
					</Button>
				) : (
					<Button size="sm" variant="brown">
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
								contractEnd: d.contractEnd || null,
								noticePeriodDays: d.noticePeriodDays ?? null,
								ownerUserId: d.ownerUserId ?? null,
								notes: d.notes ?? undefined,
							});
							if (!res.ok) return void toast.error(tc("error"));
							toast.success(isEdit ? t("saved") : t("created"));
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{isEdit ? tc("edit") : t("new")}</DialogTitle>
						<DialogDescription>{t("lead")}</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 sm:grid-cols-2">
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
							<Label htmlFor="pv-contract">{t("contract")}</Label>
							<Input
								id="pv-contract"
								value={d.contractRef ?? ""}
								onChange={(e) => set("contractRef", e.target.value)}
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
							<Select
								value={d.ownerUserId ?? "none"}
								onValueChange={(v) =>
									set("ownerUserId", v === "none" ? null : v)
								}
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
					<div className="flex flex-wrap gap-5 text-sm">
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
