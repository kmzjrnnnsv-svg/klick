"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { retireAsset, upsertAsset } from "@/app/actions/registers";
import { useGateFeedback } from "@/components/approvals/use-gate-feedback";
import type { MemberOption } from "@/components/entity/owner-assignee";
import { ResponsibleSelect } from "@/components/entity/responsible-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
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

const TYPES = [
	"system",
	"application",
	"data",
	"service",
	"device",
	"facility",
	"key_material",
	"hsm",
] as const;
const CLASSES = ["public", "internal", "confidential", "secret"] as const;

export type AssetDraft = {
	assetId?: string;
	status?: "active" | "retired" | "pending" | "declined";
	name: string;
	type: (typeof TYPES)[number];
	classification: (typeof CLASSES)[number];
	providerId?: string | null;
	siteId?: string | null;
	ownerUserId?: string | null;
	location?: string | null;
	description?: string | null;
	isLegacy: boolean;
	custodian?: string | null;
	backupLocation?: string | null;
	rotationDue?: string | null;
	vendor?: string | null;
	product?: string | null;
	version?: string | null;
	endOfLifeAt?: string | null;
	supportEndAt?: string | null;
	maintenance?: "contract" | "internal" | "none" | null;
	maintenanceUntil?: string | null;
	lastPatchedAt?: string | null;
};

const MAINTENANCE = ["contract", "internal", "none"] as const;

export function AssetForm({
	initial,
	members,
	providers,
	sites = [],
	trigger,
}: {
	initial?: AssetDraft;
	members: MemberOption[];
	providers: { id: string; name: string }[];
	sites?: { id: string; name: string }[];
	trigger?: "button" | "link";
}) {
	const t = useTranslations("Assets");
	const tc = useTranslations("Common");
	const gate = useGateFeedback();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<AssetDraft>(
		initial ?? {
			name: "",
			type: "system",
			classification: "internal",
			isLegacy: false,
		},
	);
	const set = <K extends keyof AssetDraft>(k: K, v: AssetDraft[K]) =>
		setD({ ...d, [k]: v });
	const isKey = d.type === "key_material" || d.type === "hsm";
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{trigger === "link" ? (
					<Button size="sm" variant="ghost" className="">
						{tc("edit")}
					</Button>
				) : (
					<Button size="sm">
						<Plus />
						{t("new")}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await upsertAsset({
								...d,
								providerId: d.providerId ?? null,
								siteId: d.siteId ?? null,
								ownerUserId: d.ownerUserId ?? null,
								location: d.location ?? undefined,
								description: d.description ?? undefined,
								custodian: d.custodian ?? undefined,
								backupLocation: d.backupLocation ?? undefined,
								rotationDue: d.rotationDue || null,
								vendor: d.vendor ?? undefined,
								product: d.product ?? undefined,
								version: d.version ?? undefined,
								endOfLifeAt: d.endOfLifeAt || null,
								supportEndAt: d.supportEndAt || null,
								maintenance: d.maintenance ?? null,
								maintenanceUntil: d.maintenanceUntil || null,
								lastPatchedAt: d.lastPatchedAt || null,
							});
							if (!res.ok)
								return void toast.error(
									gate.errorText(res.error) ?? errorText(tc, res),
								);
							if (res.data.approvalPending) toast.info(gate.pendingText());
							else toast.success(initial ? t("saved") : t("created"));
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{initial ? tc("edit") : t("new")}</DialogTitle>
					</DialogHeader>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5 sm:col-span-2">
							<Label htmlFor="as-name">{t("name")}</Label>
							<Input
								id="as-name"
								value={d.name}
								onChange={(e) => set("name", e.target.value)}
								required
								maxLength={200}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("type")}</Label>
							<Select
								value={d.type}
								onValueChange={(v) => set("type", v as AssetDraft["type"])}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{TYPES.map((x) => (
										<SelectItem key={x} value={x}>
											{t(`type_${x}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("classification")}</Label>
							<Select
								value={d.classification}
								onValueChange={(v) =>
									set("classification", v as AssetDraft["classification"])
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CLASSES.map((x) => (
										<SelectItem key={x} value={x}>
											{x}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("provider")}</Label>
							<Select
								value={d.providerId ?? "none"}
								onValueChange={(v) =>
									set("providerId", v === "none" ? null : v)
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">—</SelectItem>
									{providers.map((p) => (
										<SelectItem key={p.id} value={p.id}>
											{p.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{sites.length > 0 && (
							<div className="flex flex-col gap-1.5">
								<Label>{t("site")}</Label>
								<Select
									value={d.siteId ?? "none"}
									onValueChange={(v) => set("siteId", v === "none" ? null : v)}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="none">—</SelectItem>
										{sites.map((x) => (
											<SelectItem key={x.id} value={x.id}>
												{x.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
						<div className="flex flex-col gap-1.5">
							<Label>{t("owner")}</Label>
							<ResponsibleSelect
								value={d.ownerUserId}
								onChange={(v) => set("ownerUserId", v)}
								members={members}
								aria-label={t("owner")}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="as-loc">{t("location")}</Label>
							<Input
								id="as-loc"
								value={d.location ?? ""}
								onChange={(e) => set("location", e.target.value)}
							/>
						</div>
						<label className="flex items-center gap-2 self-end text-subhead">
							<Checkbox
								checked={d.isLegacy}
								onCheckedChange={(v) => set("isLegacy", Boolean(v))}
							/>
							{t("isLegacy")}
						</label>
						{isKey && (
							<>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="as-cust">{t("custodian")}</Label>
									<Input
										id="as-cust"
										value={d.custodian ?? ""}
										onChange={(e) => set("custodian", e.target.value)}
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="as-backup">{t("backupLocation")}</Label>
									<Input
										id="as-backup"
										value={d.backupLocation ?? ""}
										onChange={(e) => set("backupLocation", e.target.value)}
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="as-rot">{t("rotationDue")}</Label>
									<Input
										id="as-rot"
										type="date"
										value={d.rotationDue ?? ""}
										onChange={(e) => set("rotationDue", e.target.value)}
									/>
								</div>
							</>
						)}
					</div>
					<fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<legend className="font-medium text-footnote mb-1 text-footnote text-muted-foreground">
							{t("lifecycle")}
						</legend>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="as-vendor">{t("vendor")}</Label>
							<Input
								id="as-vendor"
								value={d.vendor ?? ""}
								onChange={(e) => set("vendor", e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="as-product">{t("productVersion")}</Label>
							<div className="flex gap-2">
								<Input
									id="as-product"
									value={d.product ?? ""}
									onChange={(e) => set("product", e.target.value)}
								/>
								<Input
									aria-label={t("version")}
									placeholder={t("version")}
									className="w-24"
									value={d.version ?? ""}
									onChange={(e) => set("version", e.target.value)}
								/>
							</div>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="as-eol">{t("endOfLifeAt")}</Label>
							<Input
								id="as-eol"
								type="date"
								value={d.endOfLifeAt ?? ""}
								onChange={(e) => set("endOfLifeAt", e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="as-support">{t("supportEndAt")}</Label>
							<Input
								id="as-support"
								type="date"
								value={d.supportEndAt ?? ""}
								onChange={(e) => set("supportEndAt", e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label>{t("maintenance")}</Label>
							<Select
								value={d.maintenance ?? "unknown"}
								onValueChange={(v) =>
									set(
										"maintenance",
										v === "unknown"
											? null
											: (v as (typeof MAINTENANCE)[number]),
									)
								}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="unknown">—</SelectItem>
									{MAINTENANCE.map((m) => (
										<SelectItem key={m} value={m}>
											{t(`maintenance_${m}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{d.maintenance && d.maintenance !== "none" && (
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="as-maint">{t("maintenanceUntil")}</Label>
								<Input
									id="as-maint"
									type="date"
									value={d.maintenanceUntil ?? ""}
									onChange={(e) => set("maintenanceUntil", e.target.value)}
								/>
							</div>
						)}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="as-patch">{t("lastPatchedAt")}</Label>
							<Input
								id="as-patch"
								type="date"
								value={d.lastPatchedAt ?? ""}
								onChange={(e) => set("lastPatchedAt", e.target.value)}
							/>
						</div>
					</fieldset>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="as-desc">{t("description")}</Label>
						<Textarea
							id="as-desc"
							rows={2}
							value={d.description ?? ""}
							onChange={(e) => set("description", e.target.value)}
						/>
					</div>
					<DialogFooter>
						{d.assetId && d.status === "active" && (
							<Button
								type="button"
								variant="outline"
								className="sm:mr-auto"
								disabled={pending}
								onClick={() => {
									if (!window.confirm(t("retireConfirm", { name: d.name })))
										return;
									start(async () => {
										const res = await retireAsset({
											assetId: d.assetId as string,
										});
										if (!res.ok)
											return void toast.error(
												gate.errorText(res.error) ?? errorText(tc, res),
											);
										toast.success(
											res.data.approvalPending
												? t("retireRequested")
												: t("retired"),
										);
										setOpen(false);
										router.refresh();
									});
								}}
							>
								{t("retire")}
							</Button>
						)}
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
