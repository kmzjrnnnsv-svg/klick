"use client";

import { issueReceiveAddress } from "@wallet/app/actions/wallet";
import { CopyButton } from "@wallet/components/wallet/copy-button";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
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
import { AmountError, parseAmount } from "@/lib/wallet/core/amount";
import { type AssetCode, assetOf, assetsFor } from "@/lib/wallet/core/assets";
import { NETWORKS, type WalletNetwork } from "@/lib/wallet/core/networks";
import { paymentUri } from "@/lib/wallet/core/uri";

// Adresse + QR (BIP-21 / EIP-681). Betrag und Asset fließen nur in den
// Zahlungs-Link; die Adresse selbst ändert sich dadurch nicht.
export function ReceivePanel({
	accountId,
	network,
	address,
	kind,
	reused,
}: {
	accountId: string;
	network: WalletNetwork;
	address: string;
	kind: "hot" | "cold";
	reused?: boolean;
}) {
	const t = useTranslations("Wallet");
	const router = useRouter();
	const [pending, start] = useTransition();
	const assets = assetsFor(network);
	const [asset, setAsset] = useState<AssetCode>(assets[0]?.code ?? "BTC");
	const [amount, setAmount] = useState("");
	const [label, setLabel] = useState("");
	const [qr, setQr] = useState<string | null>(null);
	const isBitcoin = NETWORKS[network].chain === "bitcoin";
	const info = assetOf(network, asset);

	const parsed = useMemo(() => {
		if (!amount.trim() || !info) return { value: null, error: false };
		try {
			return { value: parseAmount(amount, info.decimals), error: false };
		} catch (e) {
			if (e instanceof AmountError) return { value: null, error: true };
			throw e;
		}
	}, [amount, info]);

	const uri = info
		? paymentUri({ network, asset: info, address, amount: parsed.value })
		: address;

	useEffect(() => {
		let alive = true;
		QRCode.toDataURL(uri, { margin: 1, width: 240, errorCorrectionLevel: "M" })
			.then((url) => alive && setQr(url))
			.catch(() => alive && setQr(null));
		return () => {
			alive = false;
		};
	}, [uri]);

	function newAddress() {
		start(async () => {
			const res = await issueReceiveAddress({ accountId, label });
			if (!res.ok) {
				toast.error(
					t.has(`error_${res.error}` as never)
						? t(`error_${res.error}` as never)
						: res.error,
				);
				return;
			}
			setLabel("");
			if (res.data.reused) toast.info(t("receiveReused"));
			router.refresh();
		});
	}

	return (
		<div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
			<div className="flex items-center justify-center rounded-lg border border-border/60 bg-white p-3">
				{qr ? (
					// biome-ignore lint/performance/noImgElement: data-URI aus qrcode, kein Remote-Bild
					<img
						src={qr}
						width={240}
						height={240}
						alt={t("receiveQrAlt", { address })}
						className="size-56 [image-rendering:pixelated]"
					/>
				) : (
					<div className="size-56" aria-hidden />
				)}
			</div>
			<div className="flex min-w-0 flex-col gap-4">
				<div>
					<p
						className="break-all font-mono text-base leading-relaxed sm:text-lg"
						translate="no"
					>
						{address}
					</p>
					<div className="mt-3 flex flex-wrap gap-2">
						<CopyButton value={address} label={t("receiveCopy")} />
						{isBitcoin && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={newAddress}
								disabled={pending}
							>
								<RefreshCw className="size-3.5" aria-hidden />
								{pending ? t("receiveNewBusy") : t("receiveNew")}
							</Button>
						)}
					</div>
					{reused && (
						<p className="mt-2 text-muted-foreground text-xs">
							{t("receiveReused")}
						</p>
					)}
					{kind === "cold" && (
						<p className="mt-2 text-xs">{t("receiveCheckDevice")}</p>
					)}
				</div>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{assets.length > 1 && (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="rc-asset">{t("receiveAsset")}</Label>
							<Select
								value={asset}
								onValueChange={(v) => setAsset(v as AssetCode)}
							>
								<SelectTrigger id="rc-asset" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{assets.map((a) => (
										<SelectItem key={a.code} value={a.code}>
											{a.code} · {a.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="rc-amount">{t("receiveAmount")}</Label>
						<Input
							id="rc-amount"
							name="amount"
							inputMode="decimal"
							autoComplete="off"
							placeholder="z. B. 0,01…"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							aria-invalid={parsed.error || undefined}
							aria-describedby={parsed.error ? "rc-amount-error" : undefined}
						/>
						{parsed.error && (
							<p
								id="rc-amount-error"
								className="text-destructive text-xs"
								aria-live="polite"
							>
								{t("receiveAmountInvalid", { decimals: info?.decimals ?? 0 })}
							</p>
						)}
					</div>
					{isBitcoin && (
						<div className="flex flex-col gap-1.5 sm:col-span-2">
							<Label htmlFor="rc-label">{t("receiveLabel")}</Label>
							<Input
								id="rc-label"
								name="label"
								autoComplete="off"
								maxLength={80}
								placeholder={t("receiveLabelPlaceholder")}
								value={label}
								onChange={(e) => setLabel(e.target.value)}
							/>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
