"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { upsertAsset } from "@/app/actions/registers";
import type { MemberOption } from "@/components/entity/owner-assignee";
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
	name: string;
	type: (typeof TYPES)[number];
	classification: (typeof CLASSES)[number];
	providerId?: string | null;
	ownerUserId?: string | null;
	location?: string | null;
	description?: string | null;
	isLegacy: boolean;
	custodian?: string | null;
	backupLocation?: string | null;
	rotationDue?: string | null;
};

export function AssetForm({
	initial,
	members,
	providers,
	trigger,
}: {
	initial?: AssetDraft;
	members: MemberOption[];
	providers: { id: string; name: string }[];
	trigger?: "button" | "link";
}) {
	const t = useTranslations("Assets");
	const tc = useTranslations("Common");
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
					<Button
						size="sm"
						variant="ghost"
						className="normal-case tracking-normal"
					>
						{tc("edit")}
					</Button>
				) : (
					<Button size="sm" variant="brown">
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
								ownerUserId: d.ownerUserId ?? null,
								location: d.location ?? undefined,
								description: d.description ?? undefined,
								custodian: d.custodian ?? undefined,
								backupLocation: d.backupLocation ?? undefined,
								rotationDue: d.rotationDue || null,
							});
							if (!res.ok) return void toast.error(tc("error"));
							toast.success(initial ? t("saved") : t("created"));
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{initial ? tc("edit") : t("new")}</DialogTitle>
					</DialogHeader>
					<div className="grid gap-4 sm:grid-cols-2">
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
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="as-loc">{t("location")}</Label>
							<Input
								id="as-loc"
								value={d.location ?? ""}
								onChange={(e) => set("location", e.target.value)}
							/>
						</div>
						<label className="flex items-center gap-2 self-end text-sm">
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
