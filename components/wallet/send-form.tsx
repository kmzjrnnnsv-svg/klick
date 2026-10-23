"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { createPayout } from "@/app/actions/wallet-send";
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
import type { PayoutSpeed } from "@/db/schema/wallet";
import { formatAmountDe } from "@/lib/wallet/core/amount";
import { ASSETS, type AssetCode } from "@/lib/wallet/core/assets";
import type { WalletNetwork } from "@/lib/wallet/core/networks";

type Account = {
	id: string;
	name: string;
	network: WalletNetwork;
	networkLabel: string;
	available: Partial<Record<AssetCode, string>>;
};
type Destination = {
	id: string;
	network: WalletNetwork;
	label: string;
	address: string;
};

const SPEEDS: PayoutSpeed[] = ["slow", "normal", "fast"];

// Senden: Konto, Asset, Betrag, Ziel aus dem Adressbuch, Tempo. Ergebnis ist
// eine Absicht im Signer — bestätigt wird auf der Bestätigungsseite.
export function SendForm({
	accounts,
	destinations,
}: {
	accounts: Account[];
	destinations: Destination[];
}) {
	const t = useTranslations("Wallet");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
	const account = accounts.find((a) => a.id === accountId);
	const assets = account ? ASSETS[account.network] : [];
	const [asset, setAsset] = useState<AssetCode>(assets[0]?.code ?? "BTC");
	const [amount, setAmount] = useState("");
	const dests = useMemo(
		() => destinations.filter((d) => d.network === account?.network),
		[destinations, account?.network],
	);
	const [destId, setDestId] = useState(dests[0]?.id ?? "");
	const [speed, setSpeed] = useState<PayoutSpeed>("normal");
	const info = assets.find((a) => a.code === asset);
	const available =
		account && info
			? formatAmountDe(BigInt(account.available[asset] ?? "0"), info.decimals)
			: "0";
	const dest = dests.find((d) => d.id === destId);

	function submit() {
		start(async () => {
			const res = await createPayout({
				accountId,
				asset,
				amount,
				addressBookId: destId,
				speed,
			});
			if (!res.ok) {
				const key = `error_${res.error ?? ""}`;
				const first = Object.values(res.fieldErrors ?? {})[0]?.[0];
				toast.error(
					t.has(key as never)
						? t(key as never)
						: first && t.has(`error_${first}` as never)
							? t(`error_${first}` as never)
							: tc("error"),
				);
				return;
			}
			toast.success(t("sendCreated"));
			router.push(`/wallet/auszahlungen/${res.data.id}`);
		});
	}

	return (
		<form
			className="flex max-w-xl flex-col gap-5"
			onSubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="send-account">{t("sendAccount")}</Label>
				<Select
					value={accountId}
					onValueChange={(v) => {
						setAccountId(v);
						const a = accounts.find((x) => x.id === v);
						const first = a ? ASSETS[a.network][0]?.code : undefined;
						if (first) setAsset(first);
						setDestId(
							destinations.find((d) => d.network === a?.network)?.id ?? "",
						);
					}}
				>
					<SelectTrigger id="send-account" className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{accounts.map((a) => (
							<SelectItem key={a.id} value={a.id}>
								{a.name} · {a.networkLabel}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="send-asset">{t("sendAsset")}</Label>
					<Select value={asset} onValueChange={(v) => setAsset(v as AssetCode)}>
						<SelectTrigger id="send-asset" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{assets.map((a) => (
								<SelectItem key={a.code} value={a.code}>
									{a.code}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="send-amount">{t("sendAmount")}</Label>
					<Input
						id="send-amount"
						name="amount"
						inputMode="decimal"
						autoComplete="off"
						className="font-mono tabular-nums"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
						placeholder="0,001"
						required
					/>
					<p className="text-muted-foreground text-xs">
						{t("sendAvailable", { amount: `${available} ${asset}` })}
					</p>
				</div>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="send-dest">{t("sendDestination")}</Label>
				{dests.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{t("sendNoDestination")}
					</p>
				) : (
					<Select value={destId} onValueChange={setDestId}>
						<SelectTrigger id="send-dest" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{dests.map((d) => (
								<SelectItem key={d.id} value={d.id}>
									{d.label} · {d.address.slice(0, 10)}…{d.address.slice(-6)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
				{dest && (
					<code
						className="break-all font-mono text-muted-foreground text-xs"
						translate="no"
					>
						{dest.address}
					</code>
				)}
			</div>
			<fieldset className="flex flex-col gap-2">
				<legend className="mb-1.5 font-medium text-sm">{t("sendSpeed")}</legend>
				<div className="flex flex-wrap gap-2">
					{SPEEDS.map((s) => (
						<label
							key={s}
							className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
						>
							<input
								type="radio"
								name="speed"
								value={s}
								checked={speed === s}
								onChange={() => setSpeed(s)}
								className="accent-primary"
							/>
							{t(`speed_${s}`)}
						</label>
					))}
				</div>
			</fieldset>
			<p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
				{t("sendHint")}
			</p>
			<div>
				<Button type="submit" disabled={pending || !destId || !amount}>
					<Send aria-hidden />
					{pending ? t("sendCreating") : t("sendSubmit")}
				</Button>
			</div>
		</form>
	);
}
