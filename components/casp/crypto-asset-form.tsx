"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { applyCryptoAssetSeed, upsertCryptoAsset } from "@/app/actions/casp";
import {
	EditTrigger,
	Field,
	FormDialog,
	NewTrigger,
} from "@/components/organisation/governance-forms";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export type CryptoAssetDraft = {
	id?: string;
	symbol: string;
	name: string;
	issuer?: string | null;
	type: "emt" | "art" | "native" | "other";
	issuerAuthorisation?: string | null;
	whitepaperRef?: string | null;
	micarStatus: "authorised" | "not_authorised" | "pending";
	networks: string; // kommagetrennt
	accepted: boolean;
	acceptedFrom?: string | null;
	perTxLimit?: string | null;
	reviewedAt?: string | null;
	notes?: string | null;
};

const TYPES = ["emt", "art", "native", "other"] as const;
const STATUSES = ["authorised", "not_authorised", "pending"] as const;

export function CryptoAssetForm({ initial }: { initial?: CryptoAssetDraft }) {
	const t = useTranslations("CryptoAssets");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [d, setD] = useState<CryptoAssetDraft>(
		initial ?? {
			symbol: "",
			name: "",
			type: "emt",
			micarStatus: "pending",
			networks: "",
			accepted: false,
		},
	);
	const canAccept = d.type === "native" || d.micarStatus === "authorised";
	return (
		<FormDialog
			title={initial ? t("edit") : t("new")}
			lead={t("formLead")}
			trigger={initial ? <EditTrigger /> : <NewTrigger label={t("new")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			wide
			onSubmit={() =>
				start(async () => {
					const res = await upsertCryptoAsset({
						id: d.id,
						symbol: d.symbol,
						name: d.name,
						issuer: d.issuer || null,
						type: d.type,
						issuerAuthorisation: d.issuerAuthorisation || null,
						whitepaperRef: d.whitepaperRef || null,
						micarStatus: d.micarStatus,
						networks: d.networks
							.split(",")
							.map((s) => s.trim())
							.filter(Boolean),
						accepted: d.accepted,
						acceptedFrom: d.acceptedFrom || null,
						perTxLimit: d.perTxLimit ? Number(d.perTxLimit) : null,
						reviewedAt: d.reviewedAt || null,
						notes: d.notes || undefined,
					});
					if (!res.ok)
						return void toast.error(
							res.error === "notAuthorised"
								? t("notAuthorised")
								: res.error === "duplicate"
									? t("duplicate")
									: tc("error"),
						);
					toast.success(t("saved"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="grid gap-4 sm:grid-cols-3">
				<Field
					id="ca-symbol"
					label={t("symbol")}
					value={d.symbol}
					onChange={(v) => setD({ ...d, symbol: v.toUpperCase() })}
					required
				/>
				<div className="sm:col-span-2">
					<Field
						id="ca-name"
						label={t("name")}
						value={d.name}
						onChange={(v) => setD({ ...d, name: v })}
						required
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>{t("type")}</Label>
					<Select
						value={d.type}
						onValueChange={(v) =>
							setD({ ...d, type: v as CryptoAssetDraft["type"] })
						}
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
					<Label>{t("micarStatus")}</Label>
					<Select
						value={d.micarStatus}
						onValueChange={(v) =>
							setD({ ...d, micarStatus: v as CryptoAssetDraft["micarStatus"] })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{STATUSES.map((x) => (
								<SelectItem key={x} value={x}>
									{t(`status_${x}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Field
					id="ca-limit"
					label={t("perTxLimit")}
					type="number"
					value={d.perTxLimit ?? ""}
					onChange={(v) => setD({ ...d, perTxLimit: v })}
				/>
				<div className="sm:col-span-3">
					<Field
						id="ca-issuer"
						label={t("issuer")}
						value={d.issuer ?? ""}
						onChange={(v) => setD({ ...d, issuer: v })}
					/>
				</div>
				<div className="sm:col-span-3">
					<Field
						id="ca-auth"
						label={t("issuerAuthorisation")}
						value={d.issuerAuthorisation ?? ""}
						onChange={(v) => setD({ ...d, issuerAuthorisation: v })}
					/>
				</div>
				<div className="sm:col-span-2">
					<Field
						id="ca-wp"
						label={t("whitepaperRef")}
						value={d.whitepaperRef ?? ""}
						onChange={(v) => setD({ ...d, whitepaperRef: v })}
					/>
				</div>
				<Field
					id="ca-networks"
					label={t("networks")}
					value={d.networks}
					onChange={(v) => setD({ ...d, networks: v })}
				/>
			</div>
			<label className="flex items-center gap-2 text-sm">
				<Checkbox
					checked={d.accepted}
					disabled={!canAccept}
					onCheckedChange={(v) => setD({ ...d, accepted: Boolean(v) })}
				/>
				{t("accepted")}
				{!canAccept && (
					<span className="text-muted-foreground text-xs">
						— {t("notAuthorised")}
					</span>
				)}
			</label>
			<Field
				id="ca-notes"
				label={t("notes")}
				value={d.notes ?? ""}
				onChange={(v) => setD({ ...d, notes: v })}
				rows={2}
			/>
		</FormDialog>
	);
}

export function ApplyCryptoSeedButton() {
	const t = useTranslations("CryptoAssets");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			variant="outline"
			size="sm"
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await applyCryptoAssetSeed();
					if (!res.ok) return void toast.error(tc("error"));
					toast.success(t("seedApplied", { n: res.data.created }));
					router.refresh();
				})
			}
		>
			<Sparkles />
			{t("applySeed")}
		</Button>
	);
}
